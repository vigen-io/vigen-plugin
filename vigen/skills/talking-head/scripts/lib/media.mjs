// Media helpers built on ffmpeg + the HyperFrames CLI (transcribe, remove-background).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { run, SKILL_DIR } from "./util.mjs";

const HF = ["--yes", "hyperframes@0.9.4"];

/** A written script as it is spoken: drop markdown, headings, [notes], `---` part breaks. */
export function speakable(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && !/^\s*(?:-{3,}|={3,})\s*$/.test(l))
    .join("\n")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[*_`>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Word-level transcript via `hyperframes transcribe` (whisper.cpp). Non-English needs a multilingual model
 * (small/medium/large-v3) + --language; the default small.en would translate. Returns [{ text, start, end }].
 */
export async function transcribe(file, { language = "vi", model = "medium", outJson } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "th-tx-"));
  const args = [...HF, "transcribe", path.resolve(file), "-d", dir, "--json"];
  if (language) args.push("--language", language);
  if (language && language !== "en") args.push("--model", model.replace(/\.en$/, ""));
  else args.push("--model", model.endsWith(".en") ? model : `${model}.en`);
  const { stdout } = await run("npx", args);
  let words = null;
  const candidates = [];
  try {
    const j = JSON.parse(stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop());
    for (const k of ["transcriptPath", "outputPath", "path", "output"]) if (j[k]) candidates.push(j[k]);
    if (Array.isArray(j.words)) words = j.words;
  } catch {}
  candidates.push(path.join(dir, "assets", "transcript.json"), path.join(dir, "transcript.json"));
  if (!words)
    for (const c of candidates) {
      const p = path.isAbsolute(c) ? c : path.join(dir, c);
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        words = Array.isArray(j) ? j : j.words || j.segments?.flatMap((s) => s.words || []) || null;
        if (words) break;
      }
    }
  if (!words) throw new Error(`transcribe produced no words for ${file}\n${stdout.slice(-800)}`);
  words = words
    .map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: +w.start, end: +w.end, ...(w.probability != null ? { p: +w.probability } : {}) }))
    .filter((w) => w.text && !/^[♪�\[\(]/.test(w.text) && Number.isFinite(w.start) && w.end >= w.start);
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(words, null, 1));
  return words;
}

/** AI matte -> transparent WebM/PNG via `hyperframes remove-background` (CoreML on Apple silicon). */
export async function removeBackground(input, output, { quality = "best" } = {}) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = [...HF, "remove-background", path.resolve(input), "-o", path.resolve(output), "--json"];
  if (output.endsWith(".webm")) args.push("--quality", quality);
  await run("npx", args);
  return output;
}

/** Subject geometry from an RGBA cutout PNG (fractions of width/height): headTop, faceY, headCenterX, body box. */
export async function measureCutout(png) {
  const { stdout } = await run("python3", ["-I", path.join(SKILL_DIR, "scripts", "lib", "measure_alpha.py"), png]);
  return JSON.parse(stdout);
}
