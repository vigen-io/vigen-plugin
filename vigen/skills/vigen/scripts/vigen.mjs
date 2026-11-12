#!/usr/bin/env node
// Vigen API helper for the vigen skill. Node 18+, no dependencies.
//
//   node vigen.mjs auth status | auth set <key> | auth clear
//   node vigen.mjs rpc <method> [inputJson] [mappingsJson]
//   node vigen.mjs upload <file> [--type image|audio]
//   node vigen.mjs isolate <audioFile> --out <file>
//   node vigen.mjs transcribe <audioFile> [--language xx]
//   node vigen.mjs koi list [--dir vigen-koi]
//   node vigen.mjs koi create --name N --frame IMG --clip WAV --language xx
//                  --transcription T [--clip-asset ID] [--isolated] [--source F]
//                  [--description D] [--dir vigen-koi]
//   node vigen.mjs koi set-avatar <koiDir> [--frame IMG]
//   node vigen.mjs koi set-voice <koiDir> --clip WAV --language xx
//                  --transcription T [--clip-asset ID] [--isolated] [--source F]
//   node vigen.mjs koi add-look <koiDir> --look NAME [--template T] (--frame IMG | --avatar ID)
//     (another avatar of the same koi: a different set, pose or angle; with --template it is named
//     T-NAME and lipsynced with --look T-NAME; --avatar adopts an avatar already on the account)
//   node vigen.mjs koi looks <koiDir> [--template T]
//     (a template's looks of this koi: saved here, and on the account but not in this folder)
//   node vigen.mjs lipsync --koi <koiDir> [--look NAME] (--text T | --audio FILE) [--name N]
//                  [--prompt T | --prompt-file F] [--instructions-file F] [--transcript-file F]
//                  [--seed N] [--language xx] [--no-wait]
//   node vigen.mjs lipsync --koi <koiDir> --plan <plan.json> [--seed N] [--no-wait]
//     (segmented video: see references/directing.md for the plan format)
//   node vigen.mjs timeline <audioFile> [--language xx]
//   node vigen.mjs tts --koi <koiDir> --text T --out <file.mp3> [--language xx]
//     (the koi's voice only: time gestures on it, then lipsync with --audio)
//     (without --prompt/--prompt-file, <koiDir>/prompt.txt is used if present,
//     else Vigen's default prompt)
//   node vigen.mjs handoff <handoffId> [--dir vigen-koi]
//     (a vigen.io template's "Recreate": template or a reference video, script, and the koi made from the
//     picked avatar + voice)
//   node vigen.mjs job <jobId> [--koi <koiDir>]
//   node vigen.mjs checkout credits
//
// Results are printed as JSON on stdout. Failures print
// {"error":{"code","message",...}} on stdout and exit with status 2; see
// references/errors.md for what each code means and how to fix it.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL =
  process.env.VIGEN_API_URL || "https://server-api.vigen.io/json-rpc";
const WEB_URL = process.env.VIGEN_WEB_URL || "https://vigen.io";
const CREDENTIALS = path.join(os.homedir(), ".config", "vigen", "credentials.json");
const DEFAULT_KOI_DIR = "vigen-koi";
const POLL_MS = 5000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

class VigenError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

// ── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else flags[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function need(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || value === "") {
    throw new VigenError("BAD_ARGS", `Missing --${name}`);
  }
  return value;
}

// ── credentials ─────────────────────────────────────────────────────────────

async function readCredentials() {
  try {
    return JSON.parse(await fs.readFile(CREDENTIALS, "utf8"));
  } catch {
    return {};
  }
}

async function getApiKey() {
  if (process.env.VIGEN_API_KEY) {
    return { key: process.env.VIGEN_API_KEY, source: "env VIGEN_API_KEY" };
  }
  const { apiKey } = await readCredentials();
  if (apiKey) return { key: apiKey, source: CREDENTIALS };
  throw new VigenError(
    "NO_API_KEY",
    "No Vigen API key configured",
    { apiKeysUrl: `${WEB_URL}/api-keys` },
  );
}

// ── rpc ─────────────────────────────────────────────────────────────────────

// Server errors arrive as { error: { message, code: <class>, data } }; the
// stable code is usually a prefix of the message ("INSUFFICIENT_CREDITS: …").
function toVigenError(error) {
  const message = String(error?.message ?? "Unknown error");
  // A bad key is rejected inside the RPC handler, so it arrives as an
  // UnauthorizedError with a generic message rather than an HTTP 401.
  if (error?.code === "UnauthorizedError") {
    return new VigenError("INVALID_API_KEY", "Invalid or revoked API key", {
      apiKeysUrl: `${WEB_URL}/api-keys`,
    });
  }
  const prefixed = message.match(/^([A-Z][A-Z0-9_]{3,}):\s*(.*)$/s);
  if (prefixed) {
    return new VigenError(prefixed[1], prefixed[2], { data: error?.data });
  }
  return new VigenError(error?.code || "SERVER_ERROR", message, {
    data: error?.data,
  });
}

// The server runs one TTS or image generation per account at a time; another
// one already running (a parallel command, or the web app) is waited out
const BUSY_WAIT_MS = 10_000;
const BUSY_MAX_WAIT_MS = 15 * 60 * 1000;

async function rpc(method, input = {}, mappings, apiKey) {
  const started = Date.now();
  for (;;) {
    try {
      return await rpcOnce(method, input, mappings, apiKey);
    } catch (err) {
      if (err.code !== "GENERATION_IN_PROGRESS" || Date.now() - started > BUSY_MAX_WAIT_MS) throw err;
      process.stderr.write(`[vigen] ${method}: another generation is running on this account; waiting\n`);
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT_MS));
    }
  }
}

async function rpcOnce(method, input = {}, mappings, apiKey) {
  const key = apiKey ?? (await getApiKey()).key;
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mappings ? { method, input, mappings } : { method, input }),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  } catch (err) {
    throw new VigenError("NETWORK_ERROR", `Cannot reach Vigen API: ${err.message}`);
  }
  if (res.status === 401) {
    throw new VigenError("INVALID_API_KEY", (await res.text()) || "Invalid or revoked API key", {
      apiKeysUrl: `${WEB_URL}/api-keys`,
    });
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new VigenError("SERVER_ERROR", `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (body.error) throw toVigenError(body.error);
  return body.result;
}

// ── files ───────────────────────────────────────────────────────────────────

function contentTypeOf(file) {
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!type) {
    throw new VigenError(
      "UNSUPPORTED_FILE",
      `Unsupported file type: ${path.extname(file) || file}`,
      { supported: Object.keys(CONTENT_TYPES) },
    );
  }
  return type;
}

async function upload(file, type) {
  if (!existsSync(file)) throw new VigenError("FILE_NOT_FOUND", `File not found: ${file}`);
  const contentType = contentTypeOf(file);
  const assetType = type || contentType.split("/")[0];
  const body = await fs.readFile(file);
  const { uploadUrl, asset } = await rpc("createUpload", {
    type: assetType,
    fileName: path.basename(file),
    metadata: { type: contentType, size: body.length, originalName: path.basename(file) },
  });
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!put.ok) {
    throw new VigenError("UPLOAD_FAILED", `Upload failed: HTTP ${put.status}`);
  }
  const { asset: ready } = await rpc("finalizeUpload", { assetId: asset.id });
  return ready;
}

// The CDN occasionally stalls; retry downloads with a per-attempt timeout.
async function download(url, out) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
      return out;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new VigenError("DOWNLOAD_FAILED", `Download failed: ${lastError?.message} (${url})`);
}

// ── koi ─────────────────────────────────────────────────────────────────────

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "koi";

async function readKoi(koiDir) {
  const file = path.join(koiDir, "koi.json");
  if (!existsSync(file)) throw new VigenError("KOI_NOT_FOUND", `No koi.json in ${koiDir}`);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeKoi(koiDir, koi) {
  await fs.mkdir(koiDir, { recursive: true });
  await fs.writeFile(path.join(koiDir, "koi.json"), JSON.stringify(koi, null, 2) + "\n");
}

async function listKoi(dir) {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const koi = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const koiDir = path.join(dir, entry.name);
    try {
      const data = await readKoi(koiDir);
      koi.push({
        dir: koiDir,
        name: data.name,
        createdAt: data.createdAt,
        avatarId: data.avatar?.id ?? null,
        voiceId: data.voice?.id ?? null,
        language: data.voice?.language ?? null,
        videos: data.videos?.length ?? 0,
        looks: Object.keys(data.looks ?? {}),
        ready: Boolean(data.avatar?.id && data.voice?.id),
      });
    } catch {
      // not a koi folder
    }
  }
  return koi.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function createAvatar(name, frame) {
  const image = await upload(frame, "image");
  const avatar = await rpc("createAvatar", { name, imageAssetId: image.id });
  return { id: avatar.id, name: avatar.name, imageUrl: image.cdnUrl };
}

async function cloneVoice(name, flags, description) {
  const clip = need(flags, "clip");
  const assetId = flags["clip-asset"] || (await upload(clip, "audio")).id;
  const voice = await rpc("cloneVoice", {
    name,
    assetId,
    language: need(flags, "language"),
    transcription: need(flags, "transcription"),
    ...(description ? { description } : {}),
  });
  return {
    id: voice.id,
    name: voice.name,
    language: voice.language ?? flags.language,
    transcription: voice.modelInfo?.transcription ?? flags.transcription,
    isolated: Boolean(flags.isolated),
    source: flags.source ? path.basename(String(flags.source)) : path.basename(clip),
  };
}

async function copyInto(koiDir, file, baseName) {
  const target = path.join(koiDir, baseName + path.extname(file).toLowerCase());
  await fs.mkdir(koiDir, { recursive: true });
  await fs.copyFile(file, target);
  return path.basename(target);
}

async function koiCreate(flags) {
  const name = need(flags, "name");
  const frame = need(flags, "frame");
  const clip = need(flags, "clip");
  need(flags, "language");
  need(flags, "transcription");
  const dir = flags.dir || DEFAULT_KOI_DIR;

  let slug = slugify(name);
  for (let n = 2; existsSync(path.join(dir, slug)); n++) slug = `${slugify(name)}-${n}`;
  const koiDir = path.join(dir, slug);

  const koi = {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    avatar: null,
    voice: null,
    videos: [],
  };
  const avatar = await createAvatar(name, frame);
  koi.avatar = { ...avatar, frame: await copyInto(koiDir, frame, "frame") };
  await writeKoi(koiDir, koi);

  try {
    const voice = await cloneVoice(name, flags, flags.description);
    koi.voice = { ...voice, clip: await copyInto(koiDir, clip, "voice-sample") };
    await writeKoi(koiDir, koi);
  } catch (err) {
    // Keep the avatar; the voice can be added with `koi set-voice`
    err.extra = { ...(err.extra || {}), koiDir, savedWithoutVoice: true };
    throw err;
  }
  return { koiDir, koi };
}

async function koiSetAvatar(koiDir, flags) {
  const koi = await readKoi(koiDir);
  const frame = flags.frame || (koi.avatar?.frame && path.join(koiDir, koi.avatar.frame));
  if (!frame) throw new VigenError("BAD_ARGS", "Missing --frame");
  const avatar = await createAvatar(koi.name, frame);
  const savedFrame =
    path.resolve(frame) === path.resolve(koiDir, koi.avatar?.frame ?? "")
      ? koi.avatar.frame
      : await copyInto(koiDir, frame, "frame");
  koi.avatar = { ...avatar, frame: savedFrame };
  await writeKoi(koiDir, koi);
  return { koiDir, koi };
}

// A look is another avatar of the koi (same voice): the person in another set, pose or framing, e.g. one
// per camera setup of a template. Its frame is kept as looks/<name>.<ext>.
// A look made for a template is named with the template first, "<template>-<look>" ("garden-storytime-overhead"):
// its koi.json key, its frame file and its avatar ("garden-storytime-overhead (Linh)"), so `koi looks --template`
// finds a template's looks again, in koi.json and among the account's avatars, before any image is generated.
const sha256 = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");

function lookKey(look, template) {
  const name = slugify(look);
  if (!template) return name;
  const prefix = `${template}-`;
  return name.startsWith(prefix) ? name : prefix + name;
}

async function koiAddLook(koiDir, flags) {
  const koi = await readKoi(koiDir);
  const template = typeof flags.template === "string" ? slugify(flags.template) : null;
  const look = lookKey(need(flags, "look"), template);
  const tag = template ? { template, look: look.slice(template.length + 1) } : {};
  const prev = koi.looks?.[look];

  let avatar = null, frame;
  if (flags.avatar) {
    // an avatar already on the account (`koi looks` → onAccount): adopt it instead of making one
    const id = String(flags.avatar);
    if (prev?.id === id) return { koiDir, look, avatar: prev, reused: true };
    const found = await rpc("getAvatar", { avatarId: id }, { image: 1 });
    if (!found?.image?.cdnUrl) throw new VigenError("BAD_ARGS", `Avatar ${id} has no image`);
    avatar = { id: found.id, name: found.name, imageUrl: found.image.cdnUrl };
    const ext = path.extname(new URL(found.image.cdnUrl).pathname).toLowerCase() || ".jpg";
    frame = await download(found.image.cdnUrl, path.join(koiDir, "looks", look + ext));
  } else {
    frame = need(flags, "frame");
  }
  const frameHash = await sha256(frame);
  // the same frame already saved as this look: reuse its avatar instead of making a duplicate (--force remakes it)
  if (!avatar && prev?.id && !flags.force) {
    const prevFile = prev.frame && path.join(koiDir, prev.frame);
    const prevHash = prev.frameHash ?? (prevFile && existsSync(prevFile) ? await sha256(prevFile) : null);
    if (prevHash === frameHash) return { koiDir, look, avatar: prev, reused: true };
  }
  avatar ??= await createAvatar(`${look} (${koi.name})`, frame);
  const saved = path.join("looks", look + path.extname(frame).toLowerCase());
  if (path.resolve(frame) !== path.resolve(koiDir, saved)) {
    await fs.mkdir(path.join(koiDir, "looks"), { recursive: true });
    await fs.copyFile(frame, path.join(koiDir, saved));
  }
  // re-read just before writing: another add-look may have saved its look while this avatar was being made
  const fresh = await readKoi(koiDir);
  const replaced = fresh.looks?.[look];
  fresh.looks = { ...(fresh.looks ?? {}), [look]: { ...avatar, ...tag, frame: saved, frameHash, createdAt: new Date().toISOString() } };
  await writeKoi(koiDir, fresh);
  // the look's old avatar stays on the account: deleting an avatar also deletes every lipsync job made with it
  return { koiDir, look, avatar: fresh.looks[look], ...(replaced?.id && replaced.id !== avatar.id ? { replacedAvatar: replaced.id } : {}) };
}

// The looks of this koi there are for a template, before generating any:
//   saved      in koi.json (made for the template), ready for lipsync --look
//   onAccount  avatars on the account named "<template>-<look> (<koi name>)" that this folder lacks (made from
//              another project folder): `koi add-look --template T --look <look> --avatar <id>` brings one in
//   untagged   looks saved before they carried their template ("<koi name> (<look>)" avatars too): maybe the
//              template's, judge by the frame
async function koiLooks(koiDir, flags) {
  const koi = await readKoi(koiDir);
  const template = typeof flags.template === "string" ? slugify(flags.template) : null;
  const prefix = template ? `${template}-` : "";
  const mine = (key, l) => !template || l.template === template || key.startsWith(prefix);
  const entries = Object.entries(koi.looks ?? {});
  const saved = entries.filter(([key, l]) => mine(key, l))
    .map(([key, l]) => ({ look: key, avatarId: l.id, frame: l.frame && path.join(koiDir, l.frame), createdAt: l.createdAt ?? null }));
  const savedIds = new Set(saved.map((l) => l.avatarId));
  const untagged = template
    ? entries.filter(([key, l]) => !l.template && !mine(key, l) && !savedIds.has(l.id))
      .map(([key, l]) => ({ look: key, avatarId: l.id, frame: l.frame && path.join(koiDir, l.frame) }))
    : [];

  const known = new Set([koi.avatar?.id, ...entries.map(([, l]) => l.id)]);
  const newStyle = ` (${koi.name})`, oldStyle = `${koi.name} (`;
  const onAccount = [];
  for (let page = 1; page <= 20; page++) {
    const list = await rpc("listAvatars", { limit: 100, page }, { items: { image: 1 } });
    for (const a of list.items ?? []) {
      if (known.has(a.id) || !a.name) continue;
      const found = { avatarId: a.id, imageUrl: a.image?.cdnUrl ?? null, createdAt: a.createdAt };
      if (a.name.endsWith(newStyle)) {
        const key = a.name.slice(0, -newStyle.length);
        if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) && mine(key, {})) onAccount.push({ look: key, ...found });
      } else if (template && a.name.startsWith(oldStyle) && a.name.endsWith(")")) {
        untagged.push({ look: a.name.slice(oldStyle.length, -1), ...found });
      }
    }
    if (!list.hasNext) break;
  }
  return { koiDir, koi: koi.name, ...(template ? { template } : {}), saved, onAccount, ...(untagged.length ? { untagged } : {}) };
}

function avatarFor(koi, koiDir, look) {
  if (look === undefined) {
    if (!koi.avatar?.id) throw new VigenError("KOI_INCOMPLETE", "This koi has no avatar", { koiDir });
    return koi.avatar.id;
  }
  const found = typeof look === "string" && koi.looks?.[slugify(look)];
  if (!found?.id) {
    throw new VigenError("LOOK_NOT_FOUND", `This koi has no look "${look}"`, {
      koiDir,
      looks: Object.keys(koi.looks ?? {}),
    });
  }
  return found.id;
}

async function koiSetVoice(koiDir, flags) {
  const koi = await readKoi(koiDir);
  const voice = await cloneVoice(koi.name, flags);
  koi.voice = { ...voice, clip: await copyInto(koiDir, need(flags, "clip"), "voice-sample") };
  await writeKoi(koiDir, koi);
  return { koiDir, koi };
}

// ── handoff ─────────────────────────────────────────────────────────────────

const extOf = (url, fallback) => {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
};

// "Recreate" on vigen.io/templates saves the user's picks on their account; the prompt only carries the id.
// The avatar becomes a koi (or the koi already made from it), a picked voice is set on it, and a voice
// sample is downloaded for the skill to clone (references in SKILL.md, "From a vigen.io template").
async function handoff(handoffId, flags) {
  const h = await rpc(
    "getTemplateHandoff",
    { handoffId },
    { avatar: { image: 1 }, voice: 1, voiceSample: 1, reference: 1 },
  );
  const dir = flags.dir || DEFAULT_KOI_DIR;

  const existing = (await listKoi(dir)).find((k) => k.avatarId === h.avatarId);
  let koiDir;
  let koi;
  if (existing) {
    koiDir = existing.dir;
    koi = await readKoi(koiDir);
  } else {
    const imageUrl = h.avatar?.image?.cdnUrl;
    if (!imageUrl) throw new VigenError("HANDOFF_INCOMPLETE", "The picked avatar has no image", { handoffId });
    const name = h.avatar.name || "koi";
    let slug = slugify(name);
    for (let n = 2; existsSync(path.join(dir, slug)); n++) slug = `${slugify(name)}-${n}`;
    koiDir = path.join(dir, slug);
    const frame = "frame" + extOf(imageUrl, ".jpg");
    await download(imageUrl, path.join(koiDir, frame));
    koi = {
      version: 1,
      name,
      createdAt: new Date().toISOString(),
      avatar: { id: h.avatarId, name, imageUrl, frame },
      voice: null,
      videos: [],
    };
  }

  if (h.voiceId && koi.voice?.id !== h.voiceId) {
    koi.voice = {
      id: h.voiceId,
      name: h.voice?.name ?? null,
      language: h.voice?.language ?? h.language,
      transcription: h.voice?.modelInfo?.transcription ?? null,
      source: "vigen.io",
    };
  }
  let voiceSample = null;
  if (h.voiceSampleAssetId) {
    const url = h.voiceSample?.cdnUrl;
    if (!url) throw new VigenError("HANDOFF_INCOMPLETE", "The voice sample isn't ready", { handoffId });
    voiceSample = path.join(koiDir, "handoff-voice" + extOf(url, ".mp3"));
    await download(url, voiceSample);
  }
  await writeKoi(koiDir, koi);

  // no template: the user uploaded a video for a new template to be learned from (video-format § A)
  let reference = null;
  if (h.referenceAssetId) {
    const url = h.reference?.cdnUrl;
    if (!url) throw new VigenError("HANDOFF_INCOMPLETE", "The reference video isn't ready", { handoffId });
    reference = path.join("formats", `handoff-${handoffId.slice(0, 8)}`, "reference" + extOf(url, ".mp4"));
    if (!existsSync(reference)) await download(url, reference);
  }

  return {
    handoffId,
    template: h.template ?? null,
    reference,
    language: h.language,
    koiDir,
    koi: koi.name,
    voice: koi.voice && !voiceSample ? { id: koi.voice.id, name: koi.voice.name, language: koi.voice.language } : null,
    voiceSample,
    // what the user typed: a finished script or just an idea (video-format SKILL.md, "From vigen.io")
    text: h.text,
  };
}

// ── lipsync ─────────────────────────────────────────────────────────────────

// Same rules the server and Vigen's lipsync engine apply; checked before TTS so a
// bad template doesn't cost TTS credits.
function validatePrompt(prompt) {
  if (prompt.length > 6000) {
    throw new VigenError("INVALID_PROMPT", `Prompt is ${prompt.length} characters; the limit is 6000`);
  }
  const variables = [...prompt.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]);
  if (!variables.includes("text")) {
    throw new VigenError("INVALID_PROMPT", "Prompt must contain {{text}}");
  }
  const unknown = variables.find((name) => name !== "text" && name !== "language");
  if (unknown !== undefined) {
    throw new VigenError("INVALID_PROMPT", `Unknown variable {{${unknown}}}; only {{text}} and {{language}} exist`);
  }
}

async function resolvePrompt(flags, koiDir) {
  let source = null;
  let prompt = null;
  if (typeof flags.prompt === "string") {
    prompt = flags.prompt;
    source = "--prompt";
  } else if (typeof flags["prompt-file"] === "string") {
    prompt = await fs.readFile(flags["prompt-file"], "utf8");
    source = path.basename(flags["prompt-file"]);
  } else if (existsSync(path.join(koiDir, "prompt.txt"))) {
    prompt = await fs.readFile(path.join(koiDir, "prompt.txt"), "utf8");
    source = "prompt.txt";
  }
  prompt = prompt?.trim() || null;
  if (prompt) validatePrompt(prompt);
  return { prompt, source: prompt ? source : "default" };
}

async function waitForJob(jobId) {
  const started = Date.now();
  let lastProgress = -1;
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const job = await rpc("getLipSyncJob", { jobId }, { output: 1 });
    if (job.status === "completed") return job;
    if (job.status === "error") {
      const code = String(job.error ?? "").match(/\(Error code: ([A-Z_]+)\)/)?.[1];
      throw new VigenError(code || "JOB_FAILED", job.error || "Lipsync job failed", {
        jobId,
      });
    }
    if (job.progress !== lastProgress) {
      lastProgress = job.progress;
      process.stderr.write(`[vigen] ${job.status} ${job.progress ?? 0}%\n`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new VigenError("JOB_WAIT_TIMEOUT", "Still processing after 30 minutes", {
    jobId,
    videosUrl: `${WEB_URL}/videos`,
  });
}

async function saveVideo(job, koiDir, meta = {}) {
  const url = job.output?.cdnUrl;
  if (!url) throw new VigenError("JOB_FAILED", "Job completed without a video", { jobId: job.id });
  const result = { jobId: job.id, url };
  if (!koiDir) return result;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join("videos", `${stamp}-${job.id.slice(0, 8)}.mp4`);
  await download(url, path.join(koiDir, file));
  const koi = await readKoi(koiDir);
  koi.videos = [
    ...(koi.videos || []),
    { jobId: job.id, file, url, createdAt: new Date().toISOString(), ...meta },
  ];
  await writeKoi(koiDir, koi);
  return { ...result, file: path.join(koiDir, file) };
}

// ── audio tools (ffmpeg) ────────────────────────────────────────────────────

function runTool(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err) =>
      reject(
        err.code === "ENOENT"
          ? new VigenError("FFMPEG_MISSING", `${cmd} is not installed`, {
              install: "macOS: brew install ffmpeg · Ubuntu/Debian: sudo apt install ffmpeg · Windows: winget install ffmpeg",
            })
          : err,
      ),
    );
    child.on("close", (status) => {
      if (status === 0) return resolve(stdout);
      // audio.mjs reports its errors as JSON on stdout
      try {
        const { error } = JSON.parse(stdout);
        if (error?.code) return reject(new VigenError(error.code, error.message, error));
      } catch {}
      reject(new VigenError("AUDIO_ERROR", stderr.trim().split("\n").slice(-2).join(" ") || `${cmd} exited ${status}`));
    });
  });
}

async function probeDuration(file) {
  const out = await runTool("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]);
  return parseFloat(out);
}

// Joins clips with a pause after each (except the last) into one MP3.
async function concatClips(clips, out) {
  const chains = clips.map(
    ({ pauseAfter }, i) =>
      `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono` +
      (i < clips.length - 1 && pauseAfter > 0 ? `,apad=pad_dur=${pauseAfter}` : "") +
      `[a${i}]`,
  );
  const labels = clips.map((_, i) => `[a${i}]`).join("");
  await runTool("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    ...clips.flatMap(({ file }) => ["-i", file]),
    "-filter_complex", `${chains.join(";")};${labels}concat=n=${clips.length}:v=0:a=1[out]`,
    "-map", "[out]", "-codec:a", "libmp3lame", "-qscale:a", "2", out,
  ]);
}

// ── plans and timed instructions ────────────────────────────────────────────

function validateInstructions(items, duration) {
  items.forEach((item, i) => {
    const where = `customInstructions[${i}]`;
    if (!item.instruction?.trim()) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: missing instruction`);
    if (item.instruction.length > 1000) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: instruction over 1000 characters`);
    if (item.textHint && item.textHint.length > 1000) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: textHint over 1000 characters`);
    const begin = item.timestamp ?? item.start;
    const isMoment = item.timestamp != null;
    if (begin == null || (isMoment && item.start != null) || (!isMoment && item.end == null)) {
      throw new VigenError("INVALID_INSTRUCTIONS", `${where}: needs timestamp, or start and end`);
    }
    if (!isMoment && item.end <= item.start) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: end must be after start`);
    if (begin < 0 || (duration && begin >= duration)) {
      throw new VigenError("INVALID_INSTRUCTIONS", `${where}: starts at ${begin}s, outside the audio (0–${duration}s)`);
    }
    // a pinned chunk (pinChunk): its own chunk, cut at start/end, 1–9.375 s, start+end only (references/gestures.md)
    if (item.pinChunk) {
      if (isMoment) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: a pinned chunk takes start and end, not timestamp`);
      const len = item.end - item.start;
      if (len < 1 || len > 9.375) throw new VigenError("INVALID_INSTRUCTIONS", `${where}: a pinned chunk lasts 1–9.375 s (this one ${len.toFixed(2)} s)`);
    }
  });
  const pins = items.filter((x) => x.pinChunk).sort((a, b) => a.start - b.start);
  pins.slice(1).forEach((p, k) => {
    const prev = pins[k];
    if (p.start < prev.end) throw new VigenError("INVALID_INSTRUCTIONS", `pinned chunks overlap: ${prev.start}–${prev.end} and ${p.start}–${p.end}`);
    if (p.start === prev.end && (p.pinImageUrl ?? null) !== (prev.pinImageUrl ?? null))
      throw new VigenError("INVALID_INSTRUCTIONS", `touching pinned chunks at ${p.start}s must pin the same image`);
  });
}

const normalizeWords = (text) => String(text).normalize("NFC").toLowerCase();

// The spoken words with timing (--transcript-file): skips the model's own transcription, so every chunk gets exactly
// these words. In order, not overlapping; {{language}} is empty then, so say the language in the prompt.
function validateTranscript(items) {
  if (!Array.isArray(items) || !items.length) throw new VigenError("INVALID_TRANSCRIPT", "The transcript must be a non-empty list");
  let prevEnd = 0;
  items.forEach((item, i) => {
    const where = `transcript[${i}]`;
    if (!item.text?.trim()) throw new VigenError("INVALID_TRANSCRIPT", `${where}: missing text`);
    if (!(Number.isFinite(item.start) && Number.isFinite(item.end)) || item.start < 0 || item.end <= item.start) {
      throw new VigenError("INVALID_TRANSCRIPT", `${where}: needs start < end, in seconds`);
    }
    if (item.start < prevEnd - 1e-6) throw new VigenError("INVALID_TRANSCRIPT", `${where}: starts at ${item.start}s, before the previous item ends (${prevEnd}s)`);
    prevEnd = item.end;
  });
}

// Where `words` falls inside a segment, estimated from its position in the
// segment's text (the model aims for the time but doesn't hit it to the frame).
function momentTime(segment, words) {
  const text = normalizeWords(segment.text);
  const index = text.indexOf(normalizeWords(words));
  return segment.start + (index / text.length) * (segment.end - segment.start);
}

// Checked before any TTS or upload, so a typo in the plan costs nothing.
function checkPlanMoments(segments) {
  segments.forEach((segment, i) =>
    (segment.moments || []).forEach((moment, j) => {
      const where = `segments[${i}].moments[${j}]`;
      if (!moment.instruction?.trim()) throw new VigenError("BAD_PLAN", `${where} has no instruction`);
      if (moment.at != null) return;
      if (!moment.words) throw new VigenError("BAD_PLAN", `${where} needs "words" (or "at" in seconds)`);
      if (!segment.text || !normalizeWords(segment.text).includes(normalizeWords(moment.words))) {
        throw new VigenError("BAD_PLAN", `${where}: "${moment.words}" is not in that segment's text`);
      }
    }),
  );
}

// A plan splits the video into segments with their own direction:
//   { prompt?, seed?, pauseMs?, audio?, instructions?: [...raw API items],
//     segments: [{ text?, start?, end?, pauseAfterMs?, direction?,
//                  moments?: [{ words? | at?, instruction }] }] }
// Without `audio`, each segment's text is rendered with TTS separately and
// joined, so the segment times are exact. With `audio`, segments carry the
// `start`/`end` seconds from `vigen.mjs timeline`.
async function audioFromPlan(plan, koi, flags, tmp, planDir) {
  const segments = plan.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new VigenError("BAD_PLAN", "The plan needs a non-empty `segments` array");
  }
  checkPlanMoments(segments);
  let audio;
  let timed;
  let duration;

  if (plan.audio) {
    const file = path.resolve(planDir, plan.audio);
    segments.forEach((s, i) => {
      if (!(Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)) {
        throw new VigenError("BAD_PLAN", `segments[${i}] needs start < end (seconds) when the plan uses audio`);
      }
    });
    duration = await probeDuration(file);
    audio = await upload(file, "audio");
    timed = segments.map((s) => ({ ...s }));
  } else {
    if (!koi.voice?.id) throw new VigenError("KOI_INCOMPLETE", "This koi has no voice");
    const clips = [];
    for (const [i, segment] of segments.entries()) {
      if (!segment.text?.trim()) throw new VigenError("BAD_PLAN", `segments[${i}] has no text`);
      const { asset } = await rpc("createTtsAudio", {
        text: segment.text,
        voiceId: koi.voice.id,
        ...(flags.language || plan.language ? { language: flags.language || plan.language } : {}),
      });
      const mp3 = path.join(tmp, `segment-${i}.mp3`);
      await download(asset.cdnUrl, mp3);
      // Decoded WAV lengths are exact; MP3 durations include encoder padding,
      // which would drift the timeline over many segments.
      const file = path.join(tmp, `segment-${i}.wav`);
      await runTool("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", file]);
      const pauseMs = segment.pauseAfterMs ?? plan.pauseMs ?? 350;
      clips.push({ file, length: await probeDuration(file), pauseAfter: pauseMs / 1000 });
      process.stderr.write(`[vigen] TTS ${i + 1}/${segments.length}\n`);
    }
    let t = 0;
    timed = segments.map((segment, i) => {
      const start = t;
      const end = t + clips[i].length;
      t = end + (i < clips.length - 1 ? clips[i].pauseAfter : 0);
      return { ...segment, start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 };
    });
    const joined = path.join(tmp, "speech.mp3");
    await concatClips(clips, joined);
    duration = await probeDuration(joined);
    audio = await upload(joined, "audio");
  }

  const customInstructions = [];
  for (const segment of timed) {
    if (segment.direction?.trim()) {
      customInstructions.push({ start: segment.start, end: segment.end, instruction: segment.direction.trim() });
    }
    for (const moment of segment.moments || []) {
      const time = moment.at ?? momentTime(segment, moment.words);
      customInstructions.push({
        timestamp: Math.round(Math.min(time, duration - 0.05) * 100) / 100,
        instruction: moment.instruction.trim(),
        ...(moment.words ? { textHint: String(moment.words) } : {}),
      });
    }
  }
  customInstructions.push(...(plan.instructions || []));
  validateInstructions(customInstructions, duration);
  return {
    audio,
    duration,
    customInstructions,
    segments: timed.map(({ text, start, end }) => ({ start, end, ...(text ? { text } : {}) })),
  };
}

async function lipsync(flags) {
  const koiDir = need(flags, "koi");
  const koi = await readKoi(koiDir);
  const avatarId = avatarFor(koi, koiDir, flags.look);

  const planFile = typeof flags.plan === "string" ? flags.plan : null;
  const plan = planFile ? JSON.parse(await fs.readFile(planFile, "utf8")) : null;
  const { prompt, source: promptSource } = await resolvePrompt(
    plan?.prompt ? { prompt: plan.prompt } : flags,
    koiDir,
  );
  if (flags.seed === true) throw new VigenError("INVALID_SEED", "--seed needs a number");
  const seedValue = flags.seed ?? plan?.seed;
  const seed = seedValue == null ? undefined : Number(seedValue);
  if (seed != null && !(Number.isInteger(seed) && seed >= 0 && seed <= 2 ** 31 - 1)) {
    throw new VigenError("INVALID_SEED", "Seed must be an integer from 0 to 2147483647");
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vigen-"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const meta = {
    promptSource,
    ...(prompt ? { prompt } : {}),
    ...(seed != null ? { seed } : {}),
    ...(flags.look !== undefined ? { look: slugify(String(flags.look)) } : {}),
  };
  let audio;
  let customInstructions;
  let transcript;
  if (typeof flags["transcript-file"] === "string") {
    transcript = JSON.parse(await fs.readFile(flags["transcript-file"], "utf8"));
    validateTranscript(transcript);
  }
  try {
    if (plan) {
      const built = await audioFromPlan(plan, koi, flags, tmp, path.dirname(planFile));
      audio = built.audio;
      customInstructions = built.customInstructions;
      const record = path.join("videos", `${stamp}.plan.json`);
      await fs.mkdir(path.join(koiDir, "videos"), { recursive: true });
      await fs.writeFile(
        path.join(koiDir, record),
        JSON.stringify({ plan, resolved: { duration: built.duration, segments: built.segments, customInstructions, prompt: prompt ?? "default" } }, null, 2) + "\n",
      );
      meta.plan = record;
    } else {
      if (typeof flags["instructions-file"] === "string") {
        customInstructions = JSON.parse(await fs.readFile(flags["instructions-file"], "utf8"));
        validateInstructions(customInstructions);
      }
      if (flags.text) {
        if (!koi.voice?.id) throw new VigenError("KOI_INCOMPLETE", "This koi has no voice", { koiDir });
        ({ asset: audio } = await rpc("createTtsAudio", {
          text: String(flags.text),
          voiceId: koi.voice.id,
          ...(flags.language ? { language: flags.language } : {}),
        }));
        meta.text = String(flags.text);
      } else if (flags.audio) {
        audio = await upload(String(flags.audio), "audio");
        meta.audio = path.basename(String(flags.audio));
      } else {
        throw new VigenError("BAD_ARGS", "Pass --plan, --text or --audio");
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  if (customInstructions?.length) meta.customInstructions = customInstructions.length;

  const job = await rpc("createLipSyncJob", {
    id: crypto.randomUUID(),
    avatarId,
    audioId: audio.id,
    name: flags.name ? String(flags.name) : `${koi.name} ${new Date().toISOString().slice(0, 16)}`,
    ...(prompt ? { prompt } : {}),
    ...(customInstructions?.length ? { customInstructions } : {}),
    ...(transcript?.length ? { transcript } : {}),
    ...(seed != null ? { seed } : {}),
  });
  if (flags["no-wait"]) {
    return { jobId: job.id, status: job.status, audioUrl: audio.cdnUrl, ...meta };
  }
  const done = await waitForJob(job.id);
  return saveVideo(done, koiDir, meta);
}

// Timed text for a recording: split at natural pauses (audio.mjs phrases),
// then transcribe each phrase. Feeds the segments of a plan that uses audio.
async function timeline(file, language) {
  if (!existsSync(file)) throw new VigenError("FILE_NOT_FOUND", `File not found: ${file}`);
  const audioScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "audio.mjs");
  const { duration, phrases } = JSON.parse(
    await runTool(process.execPath, [audioScript, "phrases", file]),
  );
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vigen-"));
  try {
    const results = new Array(phrases.length);
    let next = 0;
    const worker = async () => {
      while (next < phrases.length) {
        const i = next++;
        const { start, end } = phrases[i];
        const piece = path.join(tmp, `phrase-${i}.wav`);
        await runTool("ffmpeg", [
          "-v", "error", "-y", "-ss", String(start), "-t", String(end - start),
          "-i", file, "-ac", "1", "-c:a", "pcm_s16le", piece,
        ]);
        const asset = await upload(piece, "audio");
        const { text } = await rpc("transcribeAudio", {
          assetId: asset.id,
          ...(language ? { language } : {}),
        });
        results[i] = { start, end, text: text.trim() };
        process.stderr.write(`[vigen] transcribed ${results.filter(Boolean).length}/${phrases.length}\n`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return { file, duration, phrases: results };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ── commands ────────────────────────────────────────────────────────────────

async function accountSummary(apiKey) {
  const { user } = await rpc("getUserInfo", {}, undefined, apiKey);
  return {
    email: user.email ?? null,
    plan: user.subscriptionTier,
    planExpires: user.subscriptionExpiration ?? null,
    credits: user.credits,
  };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "auth": {
      const sub = positional[0];
      if (sub === "status") {
        let key;
        try {
          key = await getApiKey();
        } catch (err) {
          if (err.code === "NO_API_KEY") return { configured: false, apiKeysUrl: `${WEB_URL}/api-keys` };
          throw err;
        }
        return { configured: true, source: key.source, account: await accountSummary(key.key) };
      }
      if (sub === "set") {
        const key = String(positional[1] || "").trim();
        if (!key.startsWith("lk_")) {
          throw new VigenError("INVALID_API_KEY", "Vigen API keys start with lk_", {
            apiKeysUrl: `${WEB_URL}/api-keys`,
          });
        }
        const account = await accountSummary(key);
        await fs.mkdir(path.dirname(CREDENTIALS), { recursive: true, mode: 0o700 });
        await fs.writeFile(CREDENTIALS, JSON.stringify({ apiKey: key }) + "\n", { mode: 0o600 });
        await fs.chmod(CREDENTIALS, 0o600);
        return { saved: CREDENTIALS, account };
      }
      if (sub === "clear") {
        await fs.rm(CREDENTIALS, { force: true });
        return { cleared: CREDENTIALS };
      }
      throw new VigenError("BAD_ARGS", "auth status | auth set <key> | auth clear");
    }
    case "rpc": {
      const [method, input, mappings] = positional;
      if (!method) throw new VigenError("BAD_ARGS", "rpc <method> [inputJson] [mappingsJson]");
      return rpc(method, input ? JSON.parse(input) : {}, mappings ? JSON.parse(mappings) : undefined);
    }
    case "upload": {
      if (!positional[0]) throw new VigenError("BAD_ARGS", "upload <file> [--type image|audio]");
      return upload(positional[0], flags.type);
    }
    case "isolate": {
      const file = positional[0];
      if (!file) throw new VigenError("BAD_ARGS", "isolate <audioFile> --out <file>");
      const out = need(flags, "out");
      const source = await upload(file, "audio");
      const { asset } = await rpc("isolateVoice", { assetId: source.id });
      await download(asset.cdnUrl, out);
      return { out, asset: { id: asset.id, cdnUrl: asset.cdnUrl } };
    }
    case "transcribe": {
      const file = positional[0];
      if (!file) throw new VigenError("BAD_ARGS", "transcribe <audioFile> [--language xx]");
      const asset = await upload(file, "audio");
      const { text } = await rpc("transcribeAudio", {
        assetId: asset.id,
        ...(flags.language ? { language: flags.language } : {}),
      });
      return { assetId: asset.id, text };
    }
    case "koi": {
      const sub = positional[0];
      if (sub === "list") return listKoi(flags.dir || DEFAULT_KOI_DIR);
      if (sub === "show") return readKoi(positional[1] || need(flags, "koi"));
      if (sub === "create") return koiCreate(flags);
      if (sub === "set-avatar") return koiSetAvatar(positional[1] || need(flags, "koi"), flags);
      if (sub === "set-voice") return koiSetVoice(positional[1] || need(flags, "koi"), flags);
      if (sub === "add-look") return koiAddLook(positional[1] || need(flags, "koi"), flags);
      if (sub === "looks") return koiLooks(positional[1] || need(flags, "koi"), flags);
      throw new VigenError("BAD_ARGS", "koi list | show | create | set-avatar | set-voice | add-look | looks");
    }
    case "lipsync":
      return lipsync(flags);
    case "tts": {
      const koiDir = need(flags, "koi");
      const out = need(flags, "out");
      if (typeof flags.text !== "string") throw new VigenError("BAD_ARGS", 'tts --koi <koiDir> --text "…" --out <file.mp3>');
      const koi = await readKoi(koiDir);
      if (!koi.voice?.id) throw new VigenError("KOI_INCOMPLETE", "This koi has no voice", { koiDir });
      const { asset } = await rpc("createTtsAudio", {
        text: flags.text,
        voiceId: koi.voice.id,
        ...(flags.language ? { language: flags.language } : {}),
      });
      await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
      await download(asset.cdnUrl, out);
      return { out, duration: await probeDuration(out), chars: flags.text.length };
    }
    case "timeline": {
      const file = positional[0];
      if (!file) throw new VigenError("BAD_ARGS", "timeline <audioFile> [--language xx]");
      return timeline(file, flags.language);
    }
    case "handoff": {
      const id = positional[0];
      if (!id) throw new VigenError("BAD_ARGS", "handoff <handoffId> [--dir vigen-koi]");
      return handoff(id, flags);
    }
    case "job": {
      const jobId = positional[0];
      if (!jobId) throw new VigenError("BAD_ARGS", "job <jobId> [--koi <koiDir>]");
      return saveVideo(await waitForJob(jobId), flags.koi);
    }
    case "checkout": {
      if (positional[0] !== "credits") throw new VigenError("BAD_ARGS", "checkout credits");
      const { plans } = await rpc("listSubscriptionPlans", {});
      const plan = plans[0];
      const { payment } = await rpc("createSubscriptionCheckout", { subscriptionPlanId: plan.id });
      return { checkoutUrl: payment.checkoutUrl, pack: `${plan.credits} credits / ${plan.price} VND` };
    }
    default:
      throw new VigenError("BAD_ARGS", `Unknown command: ${command ?? "(none)"}`);
  }
}

main()
  .then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  })
  .catch((err) => {
    const error =
      err instanceof VigenError
        ? { code: err.code, message: err.message, ...err.extra }
        : { code: "UNEXPECTED", message: err?.message ?? String(err) };
    process.stdout.write(JSON.stringify({ error }, null, 2) + "\n");
    process.exit(2);
  });
