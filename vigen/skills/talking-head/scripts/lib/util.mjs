// Shared helpers (the same file ships in each video skill so every skill stays self-contained):
// args, logging, processes, ffprobe, JSON, downloads, and the HyperFrames project helpers
// (index.html with one marked block per layer, so each skill rewrites only its own part).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// SKILL_DIR: this skill, wherever it is installed. ROOT: the folder the scripts are run from (or $KOI_ROOT);
// project paths and .env resolve against it.
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ROOT = path.resolve(process.env.KOI_ROOT || process.cwd());

/** `node <path>/scripts/<script>.mjs …` as the agent should type it from ROOT. */
export function cmd(script, ...args) {
  const rel = path.relative(ROOT, path.join(SKILL_DIR, "scripts", `${script}.mjs`));
  return ["node", rel.startsWith("..") ? path.join(SKILL_DIR, "scripts", `${script}.mjs`) : rel, ...args].join(" ");
}

/** True when the calling module is the entry point (works with spaces/symlinks in paths). */
export function isMain(metaUrl) {
  try { return metaUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href || metaUrl === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
}

export function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const f3 = (n) => +Number(n).toFixed(3);
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Parse `--flag value` / `--flag` / positional args (a repeated flag collects into an array). */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const v = next === undefined || next.startsWith("--") ? true : (i++, next);
      out[key] = key in out ? [].concat(out[key], v) : v;
    } else out._.push(a);
  }
  return out;
}

/** Run a command; resolves with { code, stdout, stderr }; rejects on non-zero unless allowFail. */
export function run(bin, args, { cwd, allowFail = false, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => { stdout += d; if (!quiet) process.stdout.write(d); });
    p.stderr.on("data", (d) => { stderr += d; if (!quiet) process.stderr.write(d); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0 && !allowFail) reject(new Error(`${bin} ${args.join(" ")} exited ${code}\n${stderr.slice(-1500)}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

export const ffmpeg = (args, opts) => run("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], opts);

export async function probe(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const [n, d] = (v?.r_frame_rate || "0/1").split("/").map(Number);
  return {
    duration: Number(j.format.duration),
    video: v ? { width: v.width, height: v.height, fps: d ? n / d : 0, duration: Number(v.duration || j.format.duration) } : null,
    audio: a ? { sampleRate: Number(a.sample_rate), channels: a.channels, duration: Number(a.duration || j.format.duration) } : null,
  };
}

export const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
export const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
};

export async function download(url, dest, { headers = {} } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "video-skills/1.0 (media fetch)", ...headers }, signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return dest;
    } catch (e) {
      if (attempt >= 4) throw new Error(`download ${url} failed: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

export const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
export const VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v"];

// ── Missing user input ───────────────────────────────────────────────────────
// CLIs exit with code 3 and print "NEEDS INPUT:" so the agent asks the user instead of treating it as a crash.
export class NeedsInput extends Error {}

export function exitOnError(e) {
  if (e instanceof NeedsInput) {
    console.error(`NEEDS INPUT: ${e.message}`);
    process.exit(3);
  }
  console.error(e.stack || e.message);
  process.exit(1);
}

// ── HyperFrames project ──────────────────────────────────────────────────────
// A project is a folder with index.html (root composition). Each skill owns one marked block in it
// (<!-- name --> … <!-- /name -->: a layer host, the voice, the sound mix) and rewrites only that block.

/** The project folder from a CLI argument (relative to ROOT). */
export function projectDir(arg, usage) {
  if (!arg) throw new NeedsInput(`which project? usage: ${usage}`);
  return path.resolve(ROOT, arg);
}

/** talking.json written by the talking-head skill: { plate, cutout, voice, duration, width, height, seams, layout }. */
export const talkingInfo = (proj) => readJson(path.join(proj, "talking.json"), null);

/** Canvas size and length: talking.json, else the root's data-* attributes, else 1080×1920. */
export function canvas(proj) {
  const t = talkingInfo(proj);
  const idx = path.join(proj, "index.html");
  const html = fs.existsSync(idx) ? fs.readFileSync(idx, "utf8") : "";
  const attr = (k) => Number(html.match(new RegExp(`id="root"[^>]*data-${k}="([\\d.]+)"`))?.[1]) || null;
  return { width: t?.width || attr("width") || 1080, height: t?.height || attr("height") || 1920, duration: t?.duration || attr("duration") || null };
}

/** Create index.html (and the HyperFrames project files) when missing; keep the root's duration in sync. */
export function ensureIndex(proj, { width = 1080, height = 1920, duration } = {}) {
  fs.mkdirSync(proj, { recursive: true });
  const idx = path.join(proj, "index.html");
  if (!fs.existsSync(idx)) {
    fs.writeFileSync(idx, `<!doctype html>
<html lang="vi" data-resolution="${height >= width ? "portrait" : "landscape"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration ?? 10}" data-width="${width}" data-height="${height}">
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`);
    const name = path.basename(proj);
    if (!fs.existsSync(path.join(proj, "hyperframes.json")))
      writeJson(path.join(proj, "hyperframes.json"), { $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true }, authoringSkill: "hyperframes" });
    if (!fs.existsSync(path.join(proj, "meta.json"))) writeJson(path.join(proj, "meta.json"), { id: name, name, createdAt: new Date().toISOString() });
    if (!fs.existsSync(path.join(proj, "package.json")))
      writeJson(path.join(proj, "package.json"), { name, private: true, type: "module", scripts: { dev: "npx --yes hyperframes@0.9.4 preview", check: "npx --yes hyperframes@0.9.4 check", render: "npx --yes hyperframes@0.9.4 render" } });
  }
  if (duration) {
    const html = fs.readFileSync(idx, "utf8");
    fs.writeFileSync(idx, html.replace(/(id="root"[^>]*data-duration=")[\d.]+(")/, `$1${f3(duration)}$2`));
  }
  return idx;
}

/** Replace (or add, at the end of the root) the marked block `name` in index.html. Empty content removes it. */
export function setBlock(proj, name, content) {
  const idx = ensureIndex(proj, canvas(proj));
  let html = fs.readFileSync(idx, "utf8");
  const re = new RegExp(`\\n?[ \\t]*<!-- ${name} -->[\\s\\S]*?<!-- /${name} -->`);
  const block = content ? `\n      <!-- ${name} -->\n${content.replace(/^/gm, "      ")}\n      <!-- /${name} -->` : "";
  if (re.test(html)) html = html.replace(re, block);
  else if (content) {
    const close = html.search(/\n[ \t]*<\/div>\s*\n[ \t]*<script>/);
    if (close < 0) throw new Error(`${idx}: can't find the end of the root <div>; add <!-- ${name} --><!-- /${name} --> inside it by hand`);
    html = html.slice(0, close) + block + html.slice(close);
  }
  fs.writeFileSync(idx, html);
}

/** A full-canvas sub-composition host (compositions/<id>.html) as an index.html block. */
export function hostBlock(proj, id, { z, track, kind = "graphics" }) {
  const { width, height, duration } = canvas(proj);
  setBlock(proj, `layer:${id}`, `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="${f3(duration ?? 10)}" data-track-index="${track}" data-track-kind="${kind}" data-width="${width}" data-height="${height}" style="z-index:${z}"></div>`);
}

/** Copy a file into the project (assets/<sub>/) unless it is already inside it; returns the project-relative path. */
export function localize(proj, src, sub = "media") {
  if (!src) return src;
  const abs = path.isAbsolute(src) ? src : fs.existsSync(path.join(proj, src)) ? path.join(proj, src) : path.resolve(ROOT, src);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${src}`);
  const rel = path.relative(proj, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
  const dest = path.join(proj, "assets", sub, path.basename(abs));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  return `assets/${sub}/${path.basename(abs)}`;
}

/** Copy this skill's fonts (assets/fonts/*) into the project; returns @font-face rules for `family`. */
export function shipFonts(proj, family = "Be Vietnam Pro") {
  const src = path.join(SKILL_DIR, "assets", "fonts");
  if (!fs.existsSync(src)) return "";
  const dest = path.join(proj, "assets", "fonts");
  fs.mkdirSync(dest, { recursive: true });
  const faces = [];
  for (const f of fs.readdirSync(src)) {
    if (!fs.existsSync(path.join(dest, f))) fs.copyFileSync(path.join(src, f), path.join(dest, f));
    const w = { Bold: 700, ExtraBold: 800, Black: 900 }[f.match(/-(\w+)\.ttf$/)?.[1]];
    // sub-compositions are assembled into index.html, so paths resolve from the project root
    if (w) faces.push(`@font-face { font-family: "${family}"; font-weight: ${w}; src: url("assets/fonts/${f}") format("truetype"); }`);
  }
  return faces.join("\n      ");
}
