#!/usr/bin/env node
// Local audio analysis for preparing a voice-clone sample. Needs ffmpeg.
//
//   node audio.mjs analyze <file>
//     → duration, speech/pause segments, noise floor vs speech level, whether
//       background removal (isolation) looks needed, and the best 5–15s
//       windows that start and end in pauses.
//   node audio.mjs phrases <file>
//     → phrase-sized pieces of the speech (split at natural pauses), for
//       timed transcription of a recording (see `vigen.mjs timeline`).
//   node audio.mjs cut <file> --start <s> --len <s> --out <file.wav>
//     → mono 16-bit WAV of that range with 10ms fades (no clicks).
//
// Same approach as the Vigen clone page: RMS energy per 20ms frame, speech =
// frames well above the noise floor, windows snapped to pauses.
import { spawn } from "node:child_process";

const SAMPLE_RATE = 16000;
const FRAME_S = 0.02;
const FRAME = SAMPLE_RATE * FRAME_S;
const MIN_LEN = 5;
const MAX_LEN = 15;
const IDEAL_LEN = 10;
const MAX_ANALYZE_S = 600;

function fail(code, message, extra = {}) {
  process.stdout.write(JSON.stringify({ error: { code, message, ...extra } }, null, 2) + "\n");
  process.exit(2);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err) =>
      err.code === "ENOENT"
        ? reject(Object.assign(new Error(`${cmd} not found`), { code: "FFMPEG_MISSING" }))
        : reject(err),
    );
    child.on("close", (status) =>
      status === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(stderr.trim().split("\n").slice(-3).join(" ") || `${cmd} exited ${status}`)),
    );
  });
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function detectSpeech(file) {
  const pcm = await run("ffmpeg", [
    "-v", "error", "-i", file, "-t", String(MAX_ANALYZE_S),
    "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-",
  ]);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const frameCount = Math.floor(samples.length / FRAME);
  const duration = samples.length / SAMPLE_RATE;
  if (frameCount < 10) fail("AUDIO_TOO_SHORT", "Audio is shorter than a fraction of a second");

  const db = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) sum += samples[i] * samples[i];
    db[f] = 20 * Math.log10(Math.sqrt(sum / FRAME) / 32768 + 1e-9);
  }

  const sorted = Array.from(db).sort((a, b) => a - b);
  const noiseFloor = percentile(sorted, 0.1);
  const speechLevel = percentile(sorted, 0.9);
  const range = speechLevel - noiseFloor;
  const threshold = noiseFloor + Math.max(6, 0.35 * range);

  // Speech mask, then close short gaps (<0.2s) and drop short blips (<0.1s)
  const speech = Array.from(db, (v) => v > threshold);
  const fillRuns = (value, maxFrames, replacement) => {
    let i = 0;
    while (i < speech.length) {
      if (speech[i] !== value) { i++; continue; }
      let j = i;
      while (j < speech.length && speech[j] === value) j++;
      const inner = i > 0 && j < speech.length;
      if (j - i < maxFrames && (inner || value === true)) speech.fill(replacement, i, j);
      i = j;
    }
  };
  fillRuns(false, Math.round(0.2 / FRAME_S), true);
  fillRuns(true, Math.round(0.1 / FRAME_S), false);

  const segments = [];
  for (let i = 0; i < speech.length; ) {
    if (!speech[i]) { i++; continue; }
    let j = i;
    while (j < speech.length && speech[j]) j++;
    segments.push({ start: i * FRAME_S, end: j * FRAME_S });
    i = j;
  }
  return { duration, frameCount, db, noiseFloor, speechLevel, range, segments };
}

// Phrase-sized pieces for timed transcription: a new phrase starts at a pause
// of 0.35s+, or 0.2s+ once the phrase is 8s long; pieces under 1.2s join the
// previous one. Padded slightly into the pauses so cuts don't clip words.
async function phrases(file) {
  const { duration, segments } = await detectSpeech(file);
  const split = [];
  let current = null;
  for (const seg of segments) {
    if (!current) {
      current = { ...seg };
      continue;
    }
    const gap = seg.start - current.end;
    if (gap >= 0.35 || (current.end - current.start >= 8 && gap >= 0.15)) {
      split.push(current);
      current = { ...seg };
    } else {
      current.end = seg.end;
    }
  }
  if (current) split.push(current);
  const merged = [];
  for (const piece of split) {
    const prev = merged[merged.length - 1];
    if (prev && piece.end - piece.start < 1.2) prev.end = piece.end;
    else merged.push({ ...piece });
  }
  return {
    duration: round(duration),
    phrases: merged.map((p) => ({
      start: round(Math.max(0, p.start - 0.05)),
      end: round(Math.min(duration, p.end + 0.1)),
    })),
  };
}

async function analyze(file) {
  const { duration, frameCount, db, noiseFloor, speechLevel, range, segments } =
    await detectSpeech(file);
  const speechTime = segments.reduce((s, x) => s + (x.end - x.start), 0);
  const silenceRatio = 1 - speechTime / duration;

  // Background music/noise keeps the "pauses" loud: low dynamic range, a
  // high noise floor, or almost no pauses in a long clip.
  const reasons = [];
  if (range < 20) reasons.push(`low dynamic range (${round(range, 1)} dB between pauses and speech)`);
  if (noiseFloor > -40) reasons.push(`loud background between words (${round(noiseFloor, 1)} dBFS)`);
  if (duration > 8 && silenceRatio < 0.08) reasons.push("almost no pauses, possibly continuous music");
  const notes = [];
  if (!reasons.length && noiseFloor > -48) {
    notes.push(`mild background noise (${round(noiseFloor, 1)} dBFS); isolation optional`);
  }

  const windows = [];
  for (let i = 0; i < segments.length; i++) {
    const start = Math.max(0, segments[i].start - 0.08);
    for (let j = i; j < segments.length; j++) {
      const end = Math.min(duration, segments[j].end + 0.12);
      const len = end - start;
      if (len < MIN_LEN) continue;
      if (len > MAX_LEN) break;
      let voiced = 0;
      let maxGap = 0;
      for (let k = i; k <= j; k++) {
        voiced += segments[k].end - segments[k].start;
        if (k > i) maxGap = Math.max(maxGap, segments[k].start - segments[k - 1].end);
      }
      const speechRatio = voiced / len;
      const score = speechRatio - 0.02 * Math.abs(len - IDEAL_LEN) - (maxGap > 1 ? 0.2 : 0);
      windows.push({ start: round(start), len: round(len), speechRatio: round(speechRatio), longestPause: round(maxGap), score });
    }
  }

  // No pause-bounded window (continuous speech): cut at the quietest frame
  // 7–15s after speech starts.
  let fallback = null;
  if (windows.length === 0 && duration >= MIN_LEN && segments.length) {
    const start = Math.max(0, segments[0].start - 0.08);
    const from = Math.floor((start + 7) / FRAME_S);
    const to = Math.min(frameCount - 1, Math.floor((start + MAX_LEN) / FRAME_S));
    let best = to;
    for (let f = from; f <= to; f++) if (db[f] < db[best]) best = f;
    const len = Math.max(MIN_LEN, Math.min(MAX_LEN, best * FRAME_S - start));
    fallback = { start: round(start), len: round(len), note: "no pause-bounded 5–15s window; cut at the quietest point" };
  }

  windows.sort((a, b) => b.score - a.score);
  return {
    file,
    duration: round(duration),
    analyzedSeconds: round(Math.min(duration, MAX_ANALYZE_S)),
    levels: {
      noiseFloorDb: round(noiseFloor, 1),
      speechLevelDb: round(speechLevel, 1),
      dynamicRangeDb: round(range, 1),
      silenceRatio: round(silenceRatio),
    },
    isolation: { suggested: reasons.length > 0, reasons, notes },
    speechSeconds: round(speechTime),
    segments: segments.length > 60 ? `${segments.length} segments` : segments.map((s) => ({ start: round(s.start), end: round(s.end) })),
    windows: windows.slice(0, 5).map(({ score, ...w }) => w),
    fallback,
    tooShort: duration < MIN_LEN,
  };
}

async function cut(file, start, len, out) {
  const fade = 0.01;
  await run("ffmpeg", [
    "-v", "error", "-y", "-ss", String(start), "-t", String(len), "-i", file,
    "-ac", "1", "-c:a", "pcm_s16le",
    "-af", `afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade)}:d=${fade}`,
    out,
  ]);
  return { out, start, len };
}

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!command || !file) fail("BAD_ARGS", "analyze <file> | phrases <file> | cut <file> --start s --len s --out f.wav");
  if (command === "analyze") return analyze(file);
  if (command === "phrases") return phrases(file);
  if (command === "cut") {
    const start = Number(flag("start"));
    const len = Number(flag("len"));
    const out = flag("out");
    if (!Number.isFinite(start) || !Number.isFinite(len) || !out) fail("BAD_ARGS", "cut needs --start, --len and --out");
    return cut(file, start, len, out);
  }
  fail("BAD_ARGS", `Unknown command: ${command}`);
}

main()
  .then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n"))
  .catch((err) =>
    err.code === "FFMPEG_MISSING"
      ? fail("FFMPEG_MISSING", "ffmpeg is not installed", {
          install: "macOS: brew install ffmpeg · Ubuntu/Debian: sudo apt install ffmpeg · Windows: winget install ffmpeg",
        })
      : fail("AUDIO_ERROR", err.message),
  );
