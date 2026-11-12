#!/usr/bin/env node
// Long scripts: split into ~20 s parts, lipsync each with the koi, join them into one video. Node 18+,
// ffmpeg, no dependencies; every Vigen call goes through vigen.mjs next to this file.
//
//   node parts.mjs plan <script.txt> [--max 400]
//       the split, free: { reason, parts: [{ index, text, chars, estSeconds }] }
//   node parts.mjs voice --koi <koiDir> --script <script.txt> --out <dir> [--max 400] [--language xx] [--redo N[,M]]
//       per part, before any lipsync: the voice (<out>/part-NN.mp3, voiced line by line: one TTS call per line, the
//       takes in <out>/lines/, each line's time in part-NN.lines.json) and its timed phrases (part-NN.timeline.json),
//       so a gesture plan can be timed on the real audio and saved as part-NN.gestures.json; also <out>/voice-preview.mp3
//       (all parts back to back) for the user to listen to before any lipsync. --redo N[,M] makes a new TTS take of
//       those parts (their gesture plans are listed in retimeGestures: re-time them on the new audio).
//       Every voice ends on --tail seconds of silence (default 0.4, padded once): the presenter settles before the cut.
//   node parts.mjs review --koi <koiDir> --script <script.txt> --out <dir> [--ui vi|en] [--port N] [--open]
//       the voices on a local page (127.0.0.1, behind a random token): every part as its lines (each its own TTS
//       call, see blocksOf), each with its text (editable), a play button and "Tạo lại": a new TTS take of that line,
//       played in place and joined into the part's voice only when the user keeps it ("Dùng"); the whole part can be
//       re-taken too. An edited text is written back to the script. Runs until the user clicks Done (or
//       SIGINT/SIGTERM), then prints { preview, parts, redone, edited, lines, retimeGestures }.
//       The page's URL is printed on stderr; --open also opens it in the default browser.
//   node parts.mjs run --koi <koiDir> --script <script.txt> --out <dir> [--max 400] [--language xx]
//                      [--prompt-file F] [--seed N] [--redo N] [--look NAME]
//       per part: TTS + lipsync (or --audio when <out>/part-NN.mp3 exists, plus --instructions-file when
//       part-NN.gestures.json exists, --transcript-file when part-NN.transcript.json exists, the koi look named
//       for the part in <out>/looks.json { "<index>": "<look>" } or else --look, else the koi's avatar), downloaded to
//       <out>/part-NN.mp4 with the render report in part-NN.render.json; then <out>/talking.mp4 (CFR 30 fps) and
//       <out>/parts.json { parts (each with the prompt, seed and gestures of its take), seams }. Resumable: rerun
//       after a crash and it picks up the saved job ids; --redo N makes a new take of part N (new TTS + lipsync).
//
// Interviews (`voice … --interviewer <koiDir>`): a script sentence starting with "Q:" is asked by an off-screen
// interviewer in that koi's voice (a voice-only koi works), every other sentence is the koi's answer. Each turn is
// voiced on its own and joined with exact gaps (--q-pause 0.7 s after a question, --turn-gap 0.45 s before one).
// part-NN.mp3 then holds the koi's turns only, with silence where the questions are: the lipsync audio, so the koi
// listens instead of mouthing the question. part-NN.full.mp3 holds both voices: the preview and the joined
// talking.mp4 use it. part-NN.turns.json gives every turn's { speaker: "q" | "koi", text, start, end }.
//
// Why parts: short lipsync jobs fail less often (PROCESSING_FAILED hit 20–60 s jobs mid-way) and a bad take
// costs only its own part. The head pose resets at every join (a "seam"): the edit hides each with a cut.
// Split rules: `---` / `===` lines always split; a script within --max chars (≈ 17 chars/s of Vietnamese
// speech, 400 ≈ 20–25 s) is one part; longer ones are packed with whole sentences up to --max, closing a part
// at a paragraph end once it is ≥ 40 % full.
// Output JSON on stdout; failures print {"error":{"code","message"}} and exit 2 (codes: references/errors.md).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, readdirSync, statSync, createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(DIR, "vigen.mjs");
const CHARS_PER_SEC = 17;
const DEFAULT_MAX = 400;
// the silence every part's voice ends on: TTS stops on the last syllable, so without it each seam cuts the
// instant the word ends. With it the presenter finishes the line and settles before the cut
const DEFAULT_TAIL = 0.4;
// Vigen fails a job on its side now and then; the same audio succeeds on a fresh job
const RETRY = new Set(["PROCESSING_FAILED", "JOB_TRACKING_LOST", "JOB_TIMEOUT", "PROVIDER_ERROR", "ASSET_DOWNLOAD_FAILED"]);
// another job holds the account's only slot (free plan): wait for it
const BUSY = new Set(["LIPSYNC_JOB_IN_PROGRESS", "CONCURRENCY_LIMIT"]);

class PartsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const say = (m) => process.stderr.write(`[parts] ${m}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const positional = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      flags[a.slice(2)] = next === undefined || next.startsWith("--") ? true : argv[++i];
    } else positional.push(a);
  }
  return { positional, flags };
}

/** A written script as it is spoken: drop markdown, headings, [notes]. */
function speakable(text) {
  return text.replace(/\r/g, "").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n")
    .replace(/\[[^\]]*\]/g, "").replace(/[*_`>]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function planParts(raw, maxChars = DEFAULT_MAX) {
  const blocks = raw.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map(speakable).filter(Boolean);
  const total = blocks.join(" ").length;
  const reason = blocks.length > 1 ? `script has ${blocks.length} explicit sections (---)`
    : total <= maxChars ? `${total} chars ≈ ${Math.round(total / CHARS_PER_SEC)} s fits one part (limit ${maxChars})`
    : `${total} chars ≈ ${Math.round(total / CHARS_PER_SEC)} s > ${maxChars}; packed by sentence`;
  const parts = [];
  for (const block of blocks) {
    if (block.length <= maxChars) { parts.push(block); continue; }
    const paras = block.split(/\n\s*\n/);
    let cur = "";
    for (let pi = 0; pi < paras.length; pi++) {
      // a line break stays one (each line is its own TTS block, see blocksOf)
      for (const line of paras[pi].split("\n")) {
        const sentences = line.match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g) || [line];
        for (const [si, s] of sentences.map((x) => x.trim()).filter(Boolean).entries()) {
          if (cur && (cur + " " + s).length > maxChars) (parts.push(cur.trim()), (cur = ""));
          cur += (!cur || cur.endsWith("\n") ? "" : si === 0 ? "\n" : " ") + s;
        }
      }
      if (cur.length >= 0.4 * maxChars && pi < paras.length - 1) (parts.push(cur.trim()), (cur = ""));
      else if (cur) cur += "\n\n";
    }
    if (cur.trim()) parts.push(cur.trim());
  }
  return { reason, parts: parts.map((text, i) => ({ index: i + 1, text, chars: text.length, estSeconds: +(text.length / CHARS_PER_SEC).toFixed(1) })) };
}

function runTool(bin, args, { inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", inherit ? "inherit" : "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new PartsError(e.code === "ENOENT" ? "FFMPEG_MISSING" : "UNEXPECTED", e.message)));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function vigen(...args) {
  const { out } = await runTool(process.execPath, [CLI, ...args], { inherit: true });
  const result = JSON.parse(out);
  if (result?.error) throw new PartsError(result.error.code, result.error.message);
  return result;
}

async function ffmpeg(args) {
  const { code, err } = await runTool("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
  if (code !== 0) throw new PartsError("FFMPEG_FAILED", err.slice(-800));
}

async function duration(file) {
  const { out } = await runTool("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.trim());
}

async function download(url, dest) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return;
    } catch (e) {
      if (attempt >= 4) throw new PartsError("DOWNLOAD_FAILED", `${url}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

function loadState(flags) {
  for (const k of ["koi", "script", "out"]) if (typeof flags[k] !== "string") throw new PartsError("BAD_ARGS", `Missing --${k}`);
  if (!existsSync(flags.script)) throw new PartsError("FILE_NOT_FOUND", `File not found: ${flags.script}`);
  const out = flags.out, statePath = path.join(out, "parts.json");
  mkdirSync(out, { recursive: true });
  const raw = readFileSync(flags.script, "utf8");
  const max = Number(flags.max || DEFAULT_MAX);
  let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  if (!state || state.script !== raw || state.max !== max) state = { script: raw, max, ...planParts(raw, max) };
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  save();
  say(`${state.parts.length} part(s): ${state.reason}`);
  const files = (p) => {
    const id = String(p.index).padStart(2, "0");
    return { mp3: path.join(out, `part-${id}.mp3`), mp4: path.join(out, `part-${id}.mp4`),
      timeline: path.join(out, `part-${id}.timeline.json`), gestures: path.join(out, `part-${id}.gestures.json`),
      transcript: path.join(out, `part-${id}.transcript.json`), render: path.join(out, `part-${id}.render.json`),
      full: path.join(out, `part-${id}.full.mp3`), turns: path.join(out, `part-${id}.turns.json`),
      lines: path.join(out, `part-${id}.lines.json`) };
  };
  // the interviewer koi is remembered, so `run` (and a --redo) voices the questions the same way
  if (typeof flags.interviewer === "string") state.interviewer = flags.interviewer;
  return { out, state, save, files, statePath };
}

// An interview part's turns: each "Q:" sentence is the interviewer's, the sentences between are the koi's answer
const SENTENCE = /[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g;
export function turnsOf(text) {
  const turns = [];
  for (const raw of text.replace(/\n/g, " ").match(SENTENCE) || []) {
    const s = raw.trim();
    if (!s) continue;
    const q = /^Q:\s*/.test(s), said = s.replace(/^Q:\s*/, "");
    const last = turns[turns.length - 1];
    if (last && !q && last.speaker === "koi") last.text += " " + said;
    else turns.push({ speaker: q ? "q" : "koi", text: said });
  }
  return turns;
}
const isInterview = (text) => /(^|[\s.!?…])Q:/.test(text);
// a voice's silence cut off both ends (one end, then reversed), keeping 20 ms before the first sound
const TRIM = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02";

// An interview part: every turn voiced on its own (the question in the interviewer's voice), trimmed, and laid on
// one clock with exact gaps. Writes the koi-only lipsync audio (f.mp3), both voices (f.full) and the turn times.
async function interviewVoice(p, f, flags, state) {
  const interviewer = state.interviewer;
  if (!interviewer) throw new PartsError("BAD_ARGS", `part ${p.index} has "Q:" questions: pass --interviewer <koiDir> (the voice that asks them)`);
  const qPause = flags["q-pause"] != null ? Number(flags["q-pause"]) : 0.7, gap = flags["turn-gap"] != null ? Number(flags["turn-gap"]) : 0.45;
  const tail = flags.tail != null ? Number(flags.tail) : DEFAULT_TAIL, lead = 0.1;
  const dir = path.join(path.dirname(f.mp3), "turns");
  mkdirSync(dir, { recursive: true });
  const id = path.basename(f.mp3, ".mp3");
  const turns = turnsOf(p.text);
  const pieces = [];
  for (const [k, t] of turns.entries()) {
    const raw = path.join(dir, `${id}-t${k + 1}-${t.speaker}.mp3`), wav = raw.replace(/\.mp3$/, ".wav");
    if (!existsSync(raw)) {
      say(`part ${p.index}: TTS turn ${k + 1} (${t.speaker === "q" ? "interviewer" : "koi"}, ${t.text.length} chars)`);
      await vigen("tts", "--koi", t.speaker === "q" ? interviewer : flags.koi, "--text", t.text, "--out", raw, ...(flags.language ? ["--language", flags.language] : []));
    }
    // two cloned voices come out at different levels (one interviewer read 8 dB under the koi): every turn is
    // levelled, the off-screen question 2 dB under the answer
    const level = `loudnorm=I=${t.speaker === "q" ? -18 : -16}:TP=-1.5:LRA=11`;
    await ffmpeg(["-i", raw, "-af", `${TRIM},areverse,${TRIM},areverse,${level},aresample=48000`, "-ac", "1", wav]);
    pieces.push({ ...t, wav, seconds: await duration(wav) });
  }
  // one clock: a silence before each turn (lead, the pause after a question, the gap before the next question)
  let t = lead;
  const placed = pieces.map((x, k) => {
    if (k > 0) t += pieces[k - 1].speaker === "q" ? qPause : gap;
    const start = t;
    t += x.seconds;
    return { ...x, start, end: t };
  });
  const total = t + tail;
  const mix = async (out, keep) => {
    const inputs = placed.filter(keep);
    const chains = inputs.map((x, i) => `[${i}:a]adelay=${Math.round(x.start * 1000)}:all=1[d${i}]`).join(";");
    const sum = inputs.map((_, i) => `[d${i}]`).join("") + `amix=inputs=${inputs.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[a]`;
    await ffmpeg([...inputs.flatMap((x) => ["-i", x.wav]), "-filter_complex", `${chains};${sum}`, "-map", "[a]", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", out]);
  };
  await mix(f.full, () => true);
  await mix(f.mp3, (x) => x.speaker === "koi");
  writeFileSync(f.turns, JSON.stringify(placed.map(({ speaker, text, start, end }) => ({ speaker, text, start: +start.toFixed(3), end: +end.toFixed(3) })), null, 1) + "\n");
  p.tail = tail;
}

// The pauses in a voice: { start, end } of every stretch quieter than -40 dB for `min` seconds or more (the last one
// runs to the end of the file when nothing follows it)
async function pauses(file, min = 0.03) {
  const { err } = await runTool("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=noise=-40dB:d=${min}`, "-f", "null", "-"]);
  const found = [];
  for (const m of err.matchAll(/silence_(start|end): (-?[0-9.]+)/g)) {
    if (m[1] === "start") found.push({ start: Math.max(0, Number(m[2])), end: Infinity });
    else if (found.length) found[found.length - 1].end = Number(m[2]);
  }
  return found;
}

// Seconds of silence at the end of a file (nothing quieter than -40 dB for 30 ms runs to the end: 0)
async function trailingSilence(file) {
  const total = await duration(file);
  const last = (await pauses(file)).at(-1);
  // an mp3's container runs ~50 ms past its last decoded sample (encoder padding): a silence ending there ran to the end
  return last && last.end >= total - 0.08 ? total - last.start : 0;
}

// A part's voice: voiced line by line when it has none (ending on `tail` seconds of silence); a voice made before
// (one TTS call for the whole part) is padded to end on it once (`p.tail` records it)
async function voiceOf(p, f, flags, state) {
  if (!existsSync(f.mp3) && isInterview(p.text)) await interviewVoice(p, f, flags, state);
  if (!existsSync(f.mp3)) await voiceLines(p, f, flags);
  if (p.tail == null) {
    const want = flags.tail != null ? Number(flags.tail) : DEFAULT_TAIL;
    const have = await trailingSilence(f.mp3);
    if (want > have + 0.02) {
      const tmp = f.mp3.replace(/\.mp3$/, ".tail.mp3");
      await ffmpeg(["-i", f.mp3, "-af", `apad=pad_dur=${(want - have).toFixed(3)}`, "-c:a", "libmp3lame", "-q:a", "2", tmp]);
      renameSync(tmp, f.mp3);
      say(`part ${p.index}: ${(want - have).toFixed(2)} s of silence added at the end (${want} s before the cut)`);
    }
    p.tail = +Math.max(want, have).toFixed(3);
  }
}

// Everything timed on a part's voice is dropped (its voice changed). Returns the part's gesture plan when it has one:
// that plan has to be re-timed on the new audio
function dropTimed(p, f) {
  for (const x of [f.timeline, f.transcript, f.mp4]) rmSync(x, { force: true });
  delete p.jobId;
  return existsSync(f.gestures) ? f.gestures : null;
}

// A part's voice and everything timed on it are dropped, so the next voiceOf makes a new TTS take
function dropVoice(p, f, out) {
  for (const x of [f.mp3, f.full, f.turns, f.lines]) rmSync(x, { force: true });
  // this part's voiced turns and lines too, so it gets a new take of every one
  for (const [sub, stem] of [["turns", "-t"], ["lines", "-l"]]) {
    const dir = path.join(out, sub), start = path.basename(f.mp3, ".mp3") + stem;
    if (existsSync(dir)) for (const x of readdirSync(dir)) if (x.startsWith(start)) rmSync(path.join(dir, x), { force: true });
  }
  delete p.tail;
  delete p.lines;
  return dropTimed(p, f);
}

// A part's lines, each voiced by its own TTS call and re-takeable on its own: the server's TTS split
// (packages/server/src/utils/split.ts, lucyai's "auto" mode), which voices every block of a text on its own and joins
// them with 300 ms pauses, so the joined lines sound as one TTS call of the whole part does. Every line break makes
// its own block (how a script asks for a line to stand alone); within a line, sentences (split at ".") are packed
// into blocks of up to 200 chars, and a sentence over 200 is cut at its last comma within 200. Run on a copy where
// "3." / ",." / ".." are masked the way the server rewrites them (no split there), so every block is { text, from,
// to } of the part's own text (a block's length can differ from the server's by a character where it rewrites those)
const BLOCK_MIN = 20, BLOCK_MAX = 200, LINE_PAUSE = 0.3;
export function blocksOf(text) {
  const masked = text.replace(/(\d+)\./g, (_, d) => d + ",").replace(/,\./g, ",\u0001").replace(/\.{2,}/g, (m) => "," + "\u0001".repeat(m.length - 1));
  const blocks = [];
  const push = (a, b) => {
    // a ".," leaves its comma at the start of the next block (the server drops it): not part of the line
    const piece = text.slice(a, b), lead = piece.length - piece.replace(/^[\s,]+/, "").length, said = text.slice(a + lead, b).trim();
    if (said) blocks.push({ text: said, from: a + lead, to: a + lead + said.length });
  };
  let at = 0;
  for (const line of masked.split("\n")) {
    const L = at;
    at += line.length + 1;
    if (!line.trim()) continue;
    const sentences = [];
    let start = 0;
    for (const m of line.matchAll(/[.]+/g)) (sentences.push([start, m.index + m[0].length]), (start = m.index + m[0].length));
    if (start < line.length) sentences.push([start, line.length]);
    let buffer = null; // [a, b) of the line
    for (const [a, b] of sentences) {
      if (!line.slice(a, b).trim()) continue;
      const held = buffer ? buffer[1] - buffer[0] : 0, combined = held + (b - a);
      if (combined > BLOCK_MAX && held >= BLOCK_MIN) (push(L + buffer[0], L + buffer[1]), (buffer = [a, b]));
      else if (combined <= BLOCK_MAX) buffer = buffer ? [buffer[0], b] : [a, b];
      else {
        if (buffer) push(L + buffer[0], L + buffer[1]);
        buffer = null;
        if (b - a <= BLOCK_MAX) { buffer = [a, b]; continue; }
        // a sentence too long for one block: cut at the last comma within the limit (else at the limit)
        for (let r = a; r < b; ) {
          if (b - r <= BLOCK_MAX) { buffer = [r, b]; break; }
          const comma = line.slice(r, r + BLOCK_MAX).lastIndexOf(",");
          const end = comma > 0 ? r + comma + 1 : r + BLOCK_MAX;
          push(L + r, L + end);
          for (r = end; r < b && /\s/.test(line[r]); r++);
        }
      }
    }
    if (buffer) push(L + buffer[0], L + buffer[1]);
  }
  return blocks;
}

// A part's lines with the take each one uses: the ones saved on the part while they still match its text, else its
// blocks, not yet voiced (take 0)
function linesOf(p) {
  const kept = p.lines?.length && p.lines.every((l) => p.text.slice(l.from, l.to) === l.text);
  return kept ? p.lines : blocksOf(p.text).map((b) => ({ ...b, take: 0 }));
}

// One take of a line: the TTS file (lines/part-NN-lK-tN.mp3) and the same trimmed to its sound (.wav)
function lineTake(f, k, take) {
  const mp3 = path.join(path.dirname(f.mp3), "lines", `${path.basename(f.mp3, ".mp3")}-l${k}-t${take}.mp3`);
  return { mp3, wav: mp3.replace(/\.mp3$/, ".wav") };
}

async function voiceLine(f, k, take, text, flags) {
  const x = lineTake(f, k, take);
  mkdirSync(path.dirname(x.mp3), { recursive: true });
  await vigen("tts", "--koi", flags.koi, "--text", text, "--out", x.mp3, ...(flags.language ? ["--language", flags.language] : []));
  await ffmpeg(["-i", x.mp3, "-af", `${TRIM},areverse,${TRIM},areverse,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono`, x.wav]);
  return x;
}

// A part's voice from its line takes: each line, a 300 ms pause (the server's, counting the 20 ms of quiet each
// trimmed take keeps at both ends), then the part's tail of silence. Writes `dest`; returns every line's time in it
async function joinLines(f, lines, dest, tail) {
  const takes = lines.map((l, k) => l.wav ?? lineTake(f, k + 1, l.take).wav);
  const lengths = [];
  for (const w of takes) lengths.push(await duration(w));
  const gap = LINE_PAUSE - 0.04;
  const chains = takes.map((_, i) => `[${i}:a]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono,apad=pad_dur=${(i < takes.length - 1 ? gap : Math.max(0, tail - 0.02)).toFixed(3)}[a${i}]`);
  await ffmpeg([...takes.flatMap((w) => ["-i", w]), "-filter_complex", `${chains.join(";")};${takes.map((_, i) => `[a${i}]`).join("")}concat=n=${takes.length}:v=0:a=1[o]`,
    "-map", "[o]", "-c:a", "libmp3lame", "-q:a", "2", dest]);
  let t = 0;
  return lines.map((l, i) => {
    const start = t;
    t += lengths[i] + gap;
    return { text: l.text, from: l.from, to: l.to, take: l.take, start: +start.toFixed(3), end: +(start + lengths[i]).toFixed(3) };
  });
}

// A part's voice line by line: every line without a take is voiced (one TTS call each, one at a time: the account
// runs one TTS at a time), then all joined into part-NN.mp3 and their times written to part-NN.lines.json
async function voiceLines(p, f, flags) {
  const lines = linesOf(p);
  for (const [i, l] of lines.entries()) {
    if (l.take && existsSync(lineTake(f, i + 1, l.take).wav)) continue;
    say(`part ${p.index}: TTS line ${i + 1}/${lines.length} (${l.text.length} chars)`);
    l.take = (l.take || 0) + 1;
    await voiceLine(f, i + 1, l.take, l.text, flags);
  }
  p.lines = lines.map(({ text, from, to, take }) => ({ text, from, to, take }));
  p.tail = flags.tail != null ? Number(flags.tail) : DEFAULT_TAIL;
  writeFileSync(f.lines, JSON.stringify(await joinLines(f, p.lines, f.mp3, p.tail), null, 1) + "\n");
}

// The voice of every part, before any lipsync: <out>/part-NN.mp3 and its timed phrases in part-NN.timeline.json.
// The gesture plan is written against these times (references/gestures.md), then `run` lipsyncs from this audio.
async function voiceAll({ out, state, save, files }, flags) {
  const parts = [];
  for (const p of state.parts) {
    const f = files(p);
    await voiceOf(p, f, flags, state);
    // what is heard: both voices in an interview, else the koi's voice
    const heard = existsSync(f.full) ? f.full : f.mp3;
    if (!existsSync(f.timeline)) {
      say(`part ${p.index}: timeline`);
      writeFileSync(f.timeline, JSON.stringify(await vigen("timeline", heard, ...(flags.language ? ["--language", flags.language] : [])), null, 2) + "\n");
    }
    p.audioSeconds = +(await duration(f.mp3)).toFixed(3);
    parts.push({ index: p.index, audio: heard, seconds: p.audioSeconds, timeline: f.timeline, gestures: f.gestures,
      ...(existsSync(f.turns) ? { lipsyncAudio: f.mp3, turns: f.turns } : {}) });
  }
  save();
  // every part back to back, as the video will say it: the user listens to this before anything is lipsynced
  const preview = path.join(out, "voice-preview.mp3");
  await ffmpeg([...parts.flatMap((p) => ["-i", p.audio]), "-filter_complex",
    parts.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(";") + ";" +
      parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[a]`,
    "-map", "[a]", "-c:a", "libmp3lame", "-q:a", "2", preview]);
  const seconds = +(await duration(preview)).toFixed(3);
  return { preview, seconds, parts };
}

async function voiceParts(flags) {
  const ctx = loadState(flags);
  // --redo N[,M]: a new TTS take of those parts (the user heard a bad one); their gesture plans need re-timing
  const redo = flags.redo != null ? String(flags.redo).split(",").map(Number).filter(Boolean) : [];
  const retime = ctx.state.parts.filter((p) => redo.includes(p.index)).map((p) => dropVoice(p, ctx.files(p), ctx.out)).filter(Boolean);
  return { ...(await voiceAll(ctx, flags)), ...(retime.length ? { retimeGestures: retime } : {}) };
}

// An audio file for the page's <audio>, with byte ranges so the player can seek
function sendAudio(req, res, file) {
  const size = statSync(file).size;
  const head = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (!m || (!m[1] && !m[2])) {
    res.writeHead(200, { ...head, "Content-Length": size });
    return createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end) return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
  res.writeHead(206, { ...head, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
  createReadStream(file, { start, end }).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 64_000) reject(new PartsError("BAD_ARGS", "request too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new PartsError("BAD_ARGS", "request is not JSON")); }
    });
  });
}

// The voices on a page, for the user to listen to line by line and re-take the bad ones without opening any file.
// Served on 127.0.0.1 under a random token (another site in the browser can't spend TTS through it). A line take is
// voiced alone and played in place; only "keep" joins it into the part's voice, so a part with one bad line keeps the
// rest of its take. One job at a time; each change also rebuilds voice-preview.mp3. Ends when the user clicks Done,
// with what changed.
async function reviewParts(flags) {
  const ctx = loadState(flags);
  const { out, state, files } = ctx;
  let voices = await voiceAll(ctx, flags);
  const token = randomBytes(9).toString("hex");
  const page = readFileSync(path.join(DIR, "review.html"), "utf8");
  const takes = {}, edited = new Map(), retime = new Set(), patched = [];
  // the line takes waiting for keep or drop, by "part.line", and the last take number made of each line
  const pending = {}, made = {};
  const partOf = (index) => {
    const p = state.parts.find((x) => x.index === index);
    if (!p) throw new PartsError("BAD_ARGS", `no part ${index}`);
    return p;
  };
  // a part's lines with their times in its voice (null: an interview part, or a voice made in one TTS call before
  // parts were voiced line by line: whole-part re-takes only)
  const linesIn = (p) => {
    const f = files(p);
    if (existsSync(f.turns) || !existsSync(f.lines)) return null;
    const lines = JSON.parse(readFileSync(f.lines, "utf8"));
    return lines.every((l) => p.text.slice(l.from, l.to) === l.text) ? lines : null;
  };
  const lineOf = (index, k) => {
    const l = linesIn(partOf(index))?.[k - 1];
    if (!l) throw new PartsError("BAD_ARGS", `part ${index} has no line ${k} to re-take: re-take the whole part`);
    return l;
  };
  let queue = Promise.resolve();
  const serial = (job) => {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  };

  const view = () => ({
    ui: flags.ui === "en" ? "en" : "vi", seconds: voices.seconds,
    parts: state.parts.map((p) => {
      const v = voices.parts.find((x) => x.index === p.index);
      return { index: p.index, text: p.text, seconds: v.seconds, take: takes[p.index] ?? 0, interview: !!v.turns,
        lines: linesIn(p)?.map((l, i) => {
          const c = pending[`${p.index}.${i + 1}`];
          return { k: i + 1, text: l.text, from: l.from, to: l.to, start: l.start, end: l.end,
            ...(c ? { pending: { take: c.take, text: c.text, start: c.start, end: c.end } } : {}) };
        }) ?? null };
    }),
  });

  // a part's new text, written into the part and the script: in place when the part's text is in the script word for
  // word; else the script becomes the parts split by --- (the same split, so nothing is re-planned). state.script
  // follows the file, so loadState keeps these parts
  function setText(p, text) {
    state.script = state.script.split(p.text).length === 2 ? state.script.replace(p.text, () => text)
      : state.parts.map((x) => (x.index === p.index ? text : x.text)).join("\n\n---\n\n") + "\n";
    writeFileSync(flags.script, state.script);
    edited.set(p.index, { index: p.index, from: edited.get(p.index)?.from ?? p.text, to: text });
    Object.assign(p, { text, chars: text.length, estSeconds: +(text.length / CHARS_PER_SEC).toFixed(1) });
    say(`part ${p.index}: text edited`);
  }

  const dropPending = (index) => { for (const key of Object.keys(pending)) if (key.startsWith(`${index}.`)) delete pending[key]; };

  // a new TTS take of every line of a part, after writing an edited text into the part and the script
  async function retake(index, text) {
    const p = partOf(index);
    text = typeof text === "string" ? text.trim() : p.text;
    if (!text) throw new PartsError("BAD_ARGS", `part ${index}: the text is empty`);
    if (text !== p.text) setText(p, text);
    const plan = dropVoice(p, files(p), out);
    if (plan) retime.add(plan);
    dropPending(index);
    voices = await voiceAll(ctx, flags);
    takes[index] = (takes[index] ?? 0) + 1;
    say(`part ${index}: new take ${takes[index]}`);
  }

  // a new TTS take of one line (its edited text, if any), waiting for keep or drop; the part's voice with it in its
  // place is written beside it, for the page to play
  async function newLineTake(index, k, text) {
    const l = lineOf(index, k), f = files(partOf(index)), key = `${index}.${k}`;
    text = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : l.text;
    if (!text) throw new PartsError("BAD_ARGS", `part ${index} line ${k}: the text is empty`);
    const n = (made[key] = Math.max(made[key] ?? 0, l.take) + 1);
    say(`part ${index}: TTS line ${k} (${text.length} chars)`);
    const x = await voiceLine(f, k, n, text, flags);
    pending[key] = { take: n, text, wav: x.wav, preview: x.mp3.replace(/\.mp3$/, ".preview.mp3") };
    await previewLine(index, k);
    say(`part ${index}: line ${k} take ${n} ready`);
  }

  // the part's current lines with a waiting take in place of line k (rebuilt when another line of it is kept)
  async function previewLine(index, k) {
    const p = partOf(index), c = pending[`${index}.${k}`];
    const lines = linesIn(p).map((l, i) => (i === k - 1 ? { ...l, text: c.text, take: c.take, wav: c.wav } : l));
    const times = await joinLines(files(p), lines, c.preview, p.tail ?? DEFAULT_TAIL);
    Object.assign(c, { start: times[k - 1].start, end: times[k - 1].end });
  }

  // the waiting take becomes the line's: the part's voice is joined again with it, the text follows it, everything
  // timed on the voice is redone, the other waiting takes of the part are rebuilt on the new voice
  async function keepLine(index, k) {
    const p = partOf(index), l = lineOf(index, k), f = files(p), key = `${index}.${k}`, c = pending[key];
    if (!c) throw new PartsError("BAD_ARGS", `part ${index} line ${k} has no new take to keep`);
    const lines = linesIn(p), chars = c.text.length - (l.to - l.from);
    if (c.text !== l.text) setText(p, p.text.slice(0, l.from) + c.text + p.text.slice(l.to));
    lines[k - 1] = { ...l, text: c.text, to: l.from + c.text.length, take: c.take };
    for (const x of lines.slice(k)) (x.from += chars), (x.to += chars);
    p.lines = lines.map(({ text, from, to, take }) => ({ text, from, to, take }));
    p.tail ??= DEFAULT_TAIL;
    writeFileSync(f.lines, JSON.stringify(await joinLines(f, p.lines, f.mp3, p.tail), null, 1) + "\n");
    delete pending[key];
    const plan = dropTimed(p, f);
    if (plan) retime.add(plan);
    voices = await voiceAll(ctx, flags);
    for (const other of Object.keys(pending)) if (other.startsWith(`${index}.`)) await previewLine(index, Number(other.split(".")[1]));
    takes[index] = (takes[index] ?? 0) + 1;
    patched.push({ part: index, line: k, from: l.text, to: c.text });
    say(`part ${index}: line ${k} replaced (take ${c.take})`);
  }

  return new Promise((resolve) => {
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      await queue;
      server.closeAllConnections?.();
      server.close();
      resolve({ preview: voices.preview, seconds: voices.seconds, parts: voices.parts,
        redone: Object.keys(takes).map(Number).sort((a, b) => a - b), edited: [...edited.values()],
        ...(patched.length ? { lines: patched } : {}),
        ...(retime.size ? { retimeGestures: [...retime] } : {}) });
    };
    const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
    const server = http.createServer(async (req, res) => {
      const { pathname } = new URL(req.url, "http://127.0.0.1");
      const [, tok, ...rest] = pathname.split("/");
      if (tok !== token) return res.writeHead(404).end();
      // the page fetches relative URLs: it must sit at /<token>/
      if (!rest.length) return res.writeHead(302, { Location: `/${token}/` }).end();
      const route = rest.join("/"), audio = /^audio\/(\d+)$/.exec(route), take = /^audio\/(\d+)\/(\d+)$/.exec(route);
      const redo = /^redo\/(\d+)$/.exec(route), act = /^(redo|keep|drop)\/(\d+)\/(\d+)$/.exec(route);
      try {
        if (req.method === "GET" && route === "") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page);
        if (req.method === "GET" && route === "state") return json(res, 200, view());
        if (req.method === "GET" && route === "audio/all") return sendAudio(req, res, voices.preview);
        if (req.method === "GET" && audio) {
          const v = voices.parts.find((x) => x.index === Number(audio[1]));
          return v ? sendAudio(req, res, v.audio) : res.writeHead(404).end();
        }
        if (req.method === "GET" && take) {
          const c = pending[`${take[1]}.${take[2]}`];
          return c ? sendAudio(req, res, c.preview) : res.writeHead(404).end();
        }
        if (req.method === "POST" && (redo || act)) {
          if (finished) throw new PartsError("BAD_ARGS", "the review is closed");
          const { text } = await readBody(req);
          if (redo) await serial(() => retake(Number(redo[1]), text));
          else {
            const [, what, index, k] = act;
            await serial(() => (what === "redo" ? newLineTake(Number(index), Number(k), text)
              : what === "keep" ? keepLine(Number(index), Number(k)) : delete pending[`${index}.${k}`]));
          }
          return json(res, 200, view());
        }
        if (req.method === "POST" && route === "log") {
          const { message } = await readBody(req);
          say(`page: ${String(message).slice(0, 300)}`);
          return res.writeHead(204).end();
        }
        if (req.method === "POST" && route === "done") {
          json(res, 200, { ok: true });
          return finish();
        }
        res.writeHead(404).end();
      } catch (e) {
        json(res, 500, { error: { code: e.code || "UNEXPECTED", message: e.message } });
      }
    });
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
    server.listen(Number(flags.port) || 0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}/${token}/`;
      say(`review page: ${url}`);
      if (flags.open) {
        const [bin, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
        spawn(bin, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
      }
    });
  });
}

async function runParts(flags) {
  const { out, state, save, files: partFiles, statePath } = loadState(flags);
  const redo = flags.redo ? Number(flags.redo) : null;
  const prompt = typeof flags["prompt-file"] === "string" ? readFileSync(flags["prompt-file"], "utf8") : null;
  // every run gets a fresh seed unless one is given (the same seed reproduces a take; a new take needs a new one)
  const runSeed = flags.seed != null && flags.seed !== true ? Number(flags.seed) : 1 + Math.floor(Math.random() * 2147483646);
  say(`seed ${runSeed}${flags.seed != null && flags.seed !== true ? " (given)" : " (new)"}`);
  // which koi look (vigen.mjs koi add-look) each part is filmed in: a template with several camera setups
  const looksFile = path.join(out, "looks.json");
  const looks = existsSync(looksFile) ? JSON.parse(readFileSync(looksFile, "utf8")) : {};
  const lookOf = (p) => looks[p.index] ?? looks[String(p.index)] ?? (typeof flags.look === "string" ? flags.look : null);
  let changed = false;

  for (const p of state.parts) {
    const { mp3, mp4, gestures, transcript, render, full, turns } = partFiles(p);
    if (redo === p.index) dropVoice(p, partFiles(p), out);
    if (existsSync(mp4)) continue;
    changed = true;
    for (let attempt = 1, waits = 0; ; ) {
      try {
        if (!p.jobId) {
          // the part's own voice, ending on its silence (TTS here too when --redo removed it)
          await voiceOf(p, partFiles(p), flags, state);
          save();
          const voice = ["--audio", mp3];
          const timed = existsSync(gestures) ? ["--instructions-file", gestures] : [];
          // the script's own words with their timing: the model skips transcription, every chunk gets the right words
          const spoken = existsSync(transcript) && existsSync(mp3) ? ["--transcript-file", transcript] : [];
          const look = lookOf(p);
          say(`part ${p.index}: ${voice[0] === "--text" ? `TTS (${p.chars} chars) + ` : ""}lipsync${look ? ` as "${look}"` : ""}${timed.length ? " with its gesture plan" : ""}`);
          const job = await vigen("lipsync", "--koi", flags.koi, ...(look ? ["--look", look] : []), ...voice, "--name", `${path.basename(out)} part ${p.index}`, "--no-wait",
            ...(flags.language ? ["--language", flags.language] : []), ...(flags["prompt-file"] ? ["--prompt-file", flags["prompt-file"]] : []),
            ...timed, ...spoken, "--seed", String(runSeed));
          // saved before waiting: a crash resumes this job instead of paying for another, and a retry reuses the audio
          p.jobId = job.jobId;
          // what this take was made with, to compare takes later
          p.take = { prompt: prompt ?? "koi prompt.txt or default", seed: runSeed, ...(look ? { look } : {}),
            gestures: timed.length ? JSON.parse(readFileSync(gestures, "utf8")) : [] };
          if (!existsSync(mp3) && job.audioUrl) await download(job.audioUrl, mp3);
          save();
        }
        const done = await vigen("job", p.jobId);
        await download(done.url, mp4);
        p.url = done.url;
        save();
        // the render report on the take: which lines reached which chunk, pins, check scores, the kept take
        try {
          const j = await vigen("rpc", "getLipSyncJob", JSON.stringify({ jobId: p.jobId }));
          if (j.render) writeFileSync(render, JSON.stringify(j.render, null, 1) + "\n");
        } catch {}
        break;
      } catch (e) {
        if (BUSY.has(e.code) && ++waits <= 90) { say(`part ${p.index}: another job is running; waiting 20 s`); await sleep(20_000); }
        else if (RETRY.has(e.code) && ++attempt <= 3) say(`part ${p.index}: job failed (${e.code}), retrying on a new one (${attempt}/3)`);
        else throw e;
        if (p.jobId) (delete p.jobId, save()); // that job is dead
      }
    }
  }

  // join: one plate, CFR 30 fps, a keyframe every second (seek-safe for editing)
  const files = state.parts.map((p) => path.join(out, `part-${String(p.index).padStart(2, "0")}.mp4`));
  const video = path.join(out, "talking.mp4");
  // each part's length in whole frames of the 30 fps plate. A part's audio ends a few hundredths before its
  // video, and concat cuts a segment where its first stream ends, so every segment is held to its video length
  // (audio padded with silence): the seams below are then exactly where the picture changes.
  const frames = [];
  for (const f of files) {
    const { out: vd } = await runTool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", f]);
    frames.push(Math.round((parseFloat(vd) || (await duration(f))) * 30));
  }
  if (changed || !existsSync(video)) {
    say(`joining ${files.length} part(s)`);
    const { out: dims } = await runTool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", files[0]]);
    const [W, H] = dims.trim().split(",").map(Number);
    // the sound of each part: both voices of an interview (part-NN.full.mp3, inputs after the videos), else the take's own
    const fulls = state.parts.map((p) => partFiles(p).full);
    const extra = [];
    const audioIn = fulls.map((f, i) => (existsSync(f) ? `${files.length + extra.push(f) - 1}:a` : `${i}:a`));
    const chains = files.map((_, i) => {
      const d = (frames[i] / 30).toFixed(6);
      return `[${i}:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.2,trim=end_frame=${frames[i]},setpts=PTS-STARTPTS[v${i}];` +
        `[${audioIn[i]}]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${d},atrim=0:${d},asetpts=PTS-STARTPTS[a${i}]`;
    }).join(";");
    const cat = files.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${files.length}:v=1:a=1[v][a]`;
    await ffmpeg([...files.flatMap((f) => ["-i", f]), ...extra.flatMap((f) => ["-i", f]), "-filter_complex", `${chains};${cat}`, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-crf", "15", "-preset", "slow", "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", video]);
  }
  let t = 0;
  state.seams = [];
  for (const [i] of files.entries()) {
    state.parts[i].startsAt = +(t / 30).toFixed(3);
    t += frames[i];
    if (i < files.length - 1) state.seams.push(+(t / 30).toFixed(3));
  }
  t /= 30;
  state.video = video;
  save();
  return { video, duration: +t.toFixed(3), seams: state.seams, parts: state.parts.map(({ index, startsAt, chars }) => ({ index, startsAt, chars })), state: statePath };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  if (command === "plan") {
    if (!positional[0] || !existsSync(positional[0])) throw new PartsError("FILE_NOT_FOUND", `plan <script.txt>: file not found: ${positional[0] ?? "(none)"}`);
    return planParts(readFileSync(positional[0], "utf8"), Number(flags.max || DEFAULT_MAX));
  }
  if (command === "voice") return voiceParts(flags);
  if (command === "review") return reviewParts(flags);
  if (command === "run") return runParts(flags);
  throw new PartsError("BAD_ARGS", "parts.mjs plan <script.txt> | voice --koi <koiDir> --script <script.txt> --out <dir> | review (same) | run --koi <koiDir> --script <script.txt> --out <dir>");
}

main()
  .then((r) => process.stdout.write(JSON.stringify(r, null, 2) + "\n"))
  .catch((e) => {
    process.stdout.write(JSON.stringify({ error: { code: e.code || "UNEXPECTED", message: e.message } }, null, 2) + "\n");
    process.exit(2);
  });
