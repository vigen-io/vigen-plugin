#!/usr/bin/env node
// Image generation for the Vigen plugin. Node 18+, no dependencies.
//
//   node imagegen.mjs auth status
//   node imagegen.mjs auth set-gemini <key> | auth clear-gemini
//   node imagegen.mjs generate (--prompt T | --prompt-file F) --out <file.png> [--ref IMG|asset:<id>]...
//                     [--aspect 9:16] [--size 2K] [--model standard|pro|lite] [--via vigen|gemini]
//   node imagegen.mjs estimate [--model standard|pro|lite] [--size 2K] [--refs N]
//
// Two ways to pay for an image:
//   vigen   Vigen's image generation API, on the user's Vigen account (vigen.mjs's saved API key): charged in
//           credits once the image is made; the result says how many.
//           References are uploaded as Vigen assets; `asset:<id>` reuses one (e.g. an image made before).
//   gemini  run locally on the user's own Gemini API key (GEMINI_API_KEY, or saved with `auth set-gemini`):
//           Google bills them directly and nothing goes through Vigen.
// Without --via: their own key when one is set (they added it to use it), else Vigen.
//
// Writes the image to --out (the extension follows the image type returned) and <out>.json next to it
// (prompt, references, model, usage, cost). Results are JSON on stdout; failures print
// {"error":{"code","message",...}} and exit 2.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VIGEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "vigen", "scripts", "vigen.mjs");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_KEY_FILE = path.join(os.homedir(), ".config", "vigen", "gemini.json");
const GEMINI_KEYS_URL = "https://aistudio.google.com/apikey";

// The tiers --model takes, and the model each one runs
const TIERS = { standard: "gemini-3.1-flash-image", pro: "gemini-3-pro-image", lite: "gemini-3.1-flash-lite-image" };
const tierOf = (model) => Object.keys(TIERS).find((t) => TIERS[t] === model) ?? model;
// Gemini's paid-tier prices (USD per 1M tokens, Nov 2026), for the own-key estimate
const MODELS = {
  "gemini-3.1-flash-image": { input: 0.5, text: 3, image: 60, imageTokens: { "1K": 1120, "2K": 1680, "4K": 2520 } },
  "gemini-3-pro-image": { input: 2, text: 12, image: 120, imageTokens: { "1K": 1120, "2K": 1120, "4K": 2000 } },
  "gemini-3.1-flash-lite-image": { input: 0.25, text: 1.5, image: 30, imageTokens: { "1K": 1120 } },
};
const DEFAULT_MODEL = "gemini-3.1-flash-image";
// Vigen credits for one image with up to 2 references, as the server charges them today (rounded up); the
// charge itself comes back with each result
const CREDITS = {
  "gemini-3.1-flash-image": { "1K": 22, "2K": 33, "4K": 49 },
  "gemini-3-pro-image": { "1K": 45, "2K": 45, "4K": 79 },
  "gemini-3.1-flash-lite-image": { "1K": 11 },
};
const MAX_REFS = 6;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

class ImageError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}
const say = (m) => process.stderr.write(`[imagegen] ${m}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --ref can repeat; every other flag takes its last value
function parseArgs(argv) {
  const positional = [], flags = { ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { positional.push(a); continue; }
    const key = a.slice(2), next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : argv[++i];
    if (key === "ref") flags.ref.push(value);
    else flags[key] = value;
  }
  return { positional, flags };
}

function modelOf(flags) {
  const name = typeof flags.model === "string" ? flags.model : DEFAULT_MODEL;
  const model = TIERS[name] ?? name; // a tier, or a model id as older looks.json files give it
  if (!MODELS[model]) throw new ImageError("UNSUPPORTED_MODEL", `Unsupported image model: ${name}`, { supported: Object.keys(TIERS) });
  return model;
}

function sizeOf(flags, model) {
  const sizes = Object.keys(MODELS[model].imageTokens);
  const size = typeof flags.size === "string" ? flags.size.toUpperCase() : sizes.includes("2K") ? "2K" : sizes[0];
  if (!sizes.includes(size)) throw new ImageError("UNSUPPORTED_SIZE", `${tierOf(model)} makes ${sizes.join(", ")} images`, { supported: sizes });
  return size;
}

// What Gemini bills for a response's usageMetadata, in USD
function usdOf(model, usage) {
  const price = MODELS[model];
  const output = usage.candidatesTokenCount ?? 0;
  const details = usage.candidatesTokensDetails;
  const imageTokens = details ? details.filter((d) => d.modality === "IMAGE").reduce((s, d) => s + (d.tokenCount ?? 0), 0) : output;
  const textTokens = output - imageTokens + (usage.thoughtsTokenCount ?? 0);
  return ((usage.promptTokenCount ?? 0) * price.input + imageTokens * price.image + textTokens * price.text) / 1e6;
}
function estimate(model, size, refs) {
  const usd = usdOf(model, { promptTokenCount: 500 + refs * 1100, candidatesTokenCount: MODELS[model].imageTokens[size] });
  return { model: tierOf(model), size, refs, usd: +usd.toFixed(4), credits: CREDITS[model][size] };
}

// ── keys ────────────────────────────────────────────────────────────────────

async function geminiKey() {
  if (process.env.GEMINI_API_KEY) return { key: process.env.GEMINI_API_KEY, source: "env GEMINI_API_KEY" };
  try {
    const { apiKey } = JSON.parse(await fs.readFile(GEMINI_KEY_FILE, "utf8"));
    if (apiKey) return { key: apiKey, source: GEMINI_KEY_FILE };
  } catch {}
  return null;
}

// Lists one model: a cheap call that fails on a bad key
async function checkGeminiKey(key) {
  const res = await fetch(`${GEMINI_API_URL}/models?pageSize=1`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30_000) })
    .catch((err) => { throw new ImageError("NETWORK_ERROR", `Cannot reach Gemini: ${err.message}`); });
  if (!res.ok) throw new ImageError("INVALID_GEMINI_KEY", `Gemini rejected the key (HTTP ${res.status})`, { keysUrl: GEMINI_KEYS_URL });
}

// ── vigen.mjs ───────────────────────────────────────────────────────────────

function vigen(...args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [VIGEN, ...args], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => {
      let body;
      try { body = JSON.parse(out); } catch { return reject(new ImageError("VIGEN_ERROR", out.slice(0, 300) || "vigen.mjs printed nothing")); }
      if (body?.error) return reject(new ImageError(body.error.code, body.error.message, body.error));
      resolve(body);
    });
  });
}

async function vigenConfigured() {
  try {
    return (await vigen("auth", "status")).configured === true;
  } catch {
    return false;
  }
}

// ── generate ────────────────────────────────────────────────────────────────

async function readRef(ref) {
  if (!existsSync(ref)) throw new ImageError("FILE_NOT_FOUND", `Reference not found: ${ref}`);
  const mimeType = MIME[path.extname(ref).toLowerCase()];
  if (!mimeType) throw new ImageError("UNSUPPORTED_FILE", `References must be ${Object.keys(MIME).join(", ")}: ${ref}`);
  return { mimeType, data: (await fs.readFile(ref)).toString("base64") };
}

async function viaGemini({ key, model, prompt, refs, aspect, size }) {
  if (refs.some((r) => r.startsWith("asset:"))) {
    throw new ImageError("BAD_ARGS", "asset:<id> references are Vigen assets: use local files with your own Gemini key");
  }
  const parts = [...(await Promise.all(refs.map(readRef))).map((inlineData) => ({ inlineData })), { text: prompt }];
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: size } },
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GEMINI_API_URL}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      signal: AbortSignal.timeout(5 * 60_000),
    }).catch((err) => { throw new ImageError("NETWORK_ERROR", `Cannot reach Gemini: ${err.message}`); });
    if (res.ok) {
      const json = await res.json();
      const candidate = json.candidates?.[0];
      const out = (candidate?.content?.parts ?? []).filter((p) => !p.thought);
      const image = out.find((p) => p.inlineData?.data)?.inlineData;
      const text = out.map((p) => p.text ?? "").join("").trim();
      const usage = json.usageMetadata ?? {};
      if (!image) {
        const reason = json.promptFeedback?.blockReason ?? candidate?.finishReason;
        throw new ImageError("IMAGE_NOT_GENERATED", `Gemini returned no image${reason ? ` (${reason})` : ""}${text ? `: ${text}` : ""}`, { reason, text });
      }
      const usd = usdOf(model, usage);
      return { bytes: Buffer.from(image.data, "base64"), mimeType: image.mimeType || "image/png", text, usage, cost: { usd: +usd.toFixed(4) } };
    }
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    if (res.status === 400) throw new ImageError("IMAGE_REQUEST_REJECTED", detail);
    if (res.status === 401 || res.status === 403) throw new ImageError("INVALID_GEMINI_KEY", detail, { keysUrl: GEMINI_KEYS_URL });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      say(`Gemini ${res.status}, retrying in ${5 * attempt} s`);
      await sleep(5000 * attempt);
      continue;
    }
    throw new ImageError(res.status === 429 ? "GEMINI_RATE_LIMITED" : "IMAGE_GENERATION_FAILED", `Gemini ${res.status}: ${detail}`);
  }
}

async function viaVigen({ model, prompt, refs, aspect, size }) {
  const referenceAssetIds = [];
  for (const ref of refs) {
    if (ref.startsWith("asset:")) referenceAssetIds.push(ref.slice(6));
    else {
      await readRef(ref); // same checks as the other path, before uploading
      referenceAssetIds.push((await vigen("upload", ref, "--type", "image")).id);
    }
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await vigen("rpc", "generateImage", JSON.stringify({ prompt, referenceAssetIds, model, aspectRatio: aspect, imageSize: size }));
      const res = await fetch(result.asset.cdnUrl, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new ImageError("DOWNLOAD_FAILED", `HTTP ${res.status} (${result.asset.cdnUrl})`);
      const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
      return {
        bytes: Buffer.from(await res.arrayBuffer()), mimeType, text: result.text ?? "", usage: result.usage,
        cost: { credits: result.credits }, asset: { id: result.asset.id, url: result.asset.cdnUrl }, referenceAssetIds,
      };
    } catch (err) {
      if (err.code === "IMAGE_GENERATION_FAILED" && attempt < 3) {
        say(`generation failed (${err.message}), retrying`);
        await sleep(5000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

async function generate(flags) {
  const prompt = typeof flags["prompt-file"] === "string" ? await fs.readFile(flags["prompt-file"], "utf8")
    : typeof flags.prompt === "string" ? flags.prompt : null;
  if (!prompt?.trim()) throw new ImageError("BAD_ARGS", "Pass --prompt or --prompt-file");
  if (typeof flags.out !== "string") throw new ImageError("BAD_ARGS", "Missing --out");
  const refs = flags.ref.filter((r) => typeof r === "string");
  if (refs.length > MAX_REFS) throw new ImageError("BAD_ARGS", `At most ${MAX_REFS} references`);
  const model = modelOf(flags), size = sizeOf(flags, model);
  const aspect = typeof flags.aspect === "string" ? flags.aspect : "9:16";

  let via = typeof flags.via === "string" ? flags.via : null;
  if (via && via !== "vigen" && via !== "gemini") throw new ImageError("BAD_ARGS", "--via vigen | gemini");
  const own = via !== "vigen" ? await geminiKey() : null;
  if (!via) via = own ? "gemini" : "vigen";
  if (via === "gemini" && !own) throw new ImageError("NO_GEMINI_KEY", "No Gemini API key: set GEMINI_API_KEY or run auth set-gemini <key>", { keysUrl: GEMINI_KEYS_URL });

  say(`${tierOf(model)} ${size} ${aspect}, ${refs.length} reference(s), via ${via === "gemini" ? "your Gemini key" : "Vigen credits"}`);
  const args = { model, prompt: prompt.trim(), refs, aspect, size };
  const result = via === "gemini" ? await viaGemini({ ...args, key: own.key }) : await viaVigen(args);

  // the extension follows what came back (a .png asked for may arrive as a JPEG)
  const ext = EXT[result.mimeType] ?? path.extname(flags.out);
  const out = path.extname(flags.out).toLowerCase() === ext ? flags.out : flags.out.replace(/(\.[^./\\]+)?$/, ext);
  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.writeFile(out, result.bytes);
  const record = {
    out, via, model: tierOf(model), size, aspect, prompt: args.prompt, refs,
    ...(result.referenceAssetIds ? { referenceAssetIds: result.referenceAssetIds } : {}),
    ...(result.asset ? { asset: result.asset } : {}),
    cost: result.cost, usage: result.usage, ...(result.text ? { text: result.text } : {}),
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(`${out}.json`, JSON.stringify(record, null, 2) + "\n");
  const { prompt: _p, ...summary } = record;
  return summary;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case "auth": {
      const sub = positional[0];
      if (sub === "status") {
        const own = await geminiKey();
        const vigenReady = await vigenConfigured();
        return {
          gemini: own ? { configured: true, source: own.source } : { configured: false, keysUrl: GEMINI_KEYS_URL },
          vigen: { configured: vigenReady },
          default: own ? "gemini" : vigenReady ? "vigen" : null,
        };
      }
      if (sub === "set-gemini") {
        const key = String(positional[1] || "").trim();
        if (!key) throw new ImageError("BAD_ARGS", "auth set-gemini <key>");
        await checkGeminiKey(key);
        await fs.mkdir(path.dirname(GEMINI_KEY_FILE), { recursive: true, mode: 0o700 });
        await fs.writeFile(GEMINI_KEY_FILE, JSON.stringify({ apiKey: key }) + "\n", { mode: 0o600 });
        await fs.chmod(GEMINI_KEY_FILE, 0o600);
        return { saved: GEMINI_KEY_FILE };
      }
      if (sub === "clear-gemini") {
        await fs.rm(GEMINI_KEY_FILE, { force: true });
        return { cleared: GEMINI_KEY_FILE };
      }
      throw new ImageError("BAD_ARGS", "auth status | auth set-gemini <key> | auth clear-gemini");
    }
    case "generate":
      return generate(flags);
    case "estimate": {
      const model = modelOf(flags);
      return estimate(model, sizeOf(flags, model), Number(flags.refs || 0));
    }
    default:
      throw new ImageError("BAD_ARGS", `Unknown command: ${command ?? "(none)"} (auth | generate | estimate)`);
  }
}

main()
  .then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n"))
  .catch((err) => {
    const error = err instanceof ImageError ? { code: err.code, message: err.message, ...err.extra } : { code: "UNEXPECTED", message: String(err?.stack || err) };
    process.stdout.write(JSON.stringify({ error }, null, 2) + "\n");
    process.exit(2);
  });
