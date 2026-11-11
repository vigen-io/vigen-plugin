#!/usr/bin/env node
// A reference video -> everything needed to read its format: measured numbers plus pictures to look at.
//
//   node dissect.mjs <video.mp4> --out formats/<name>/ref-<n> [--lang vi] [--model medium] [--fps 2] [--motion-fps 6]
//
// Writes, each step cached (delete a file to redo it):
//   meta.json          size, fps, duration, audio
//   frames.json        per frame: scene score (0..1, how different from the previous frame) and mean luma
//   cuts.json          hard cuts (scene score peaks) and flashes (luma jumps up then back), with times
//   loudness.json      momentary loudness every 0.1 s (LUFS)
//   onsets.json        sharp energy rises that are NOT a word start: likely sound effects
//   words.json         whisper word timings (the spoken script, for lining visuals up with lines)
//   sheets/sheet-NN.jpg   a frame every 1/fps s, 6×5 per sheet, time-stamped (30 frames = 15 s at fps 2)
//   cuts/cut-NN.jpg       9 consecutive frames around each cut (-4…+4 at the source fps): the transition itself
//   motion/motion-NN.jpg  --motion-fps frames per second, one row per second, 5 s per sheet, absolute time
//                         stamps: the motion inside a shot (pops, slides, wipes, text entrances, camera moves)
//   stills/shot-NN.jpg    one 540 px frame per shot (its middle): type, colours, small marks to copy exactly
//   report.md          the numbers in one page + per shot its length, how much moves inside it, and the words
// Then read the sheets and cut strips (references/reading.md) and write the guidebook.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const input = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!input || !fs.existsSync(input)) { console.error("dissect.mjs <video> --out <dir> [--lang vi] [--fps 2]"); process.exit(2); }
const out = flag("out"); if (!out) { console.error("--out <dir> is required"); process.exit(2); }
const lang = flag("lang", "vi"), model = flag("model", "medium"), sheetFps = Number(flag("fps", 2));
const motionFps = Number(flag("motion-fps", 6));
for (const d of ["sheets", "cuts", "motion", "stills"]) fs.mkdirSync(path.join(out, d), { recursive: true });
const log = (m) => process.stderr.write(`[dissect] ${m}\n`);
const P = (f) => path.join(out, f);
const has = (f) => fs.existsSync(P(f));
const save = (f, j) => fs.writeFileSync(P(f), JSON.stringify(j, null, 1));
const load = (f) => JSON.parse(fs.readFileSync(P(f), "utf8"));

function run(cmd, a, { quiet = true } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, a, { stdio: ["ignore", "pipe", "pipe"] });
    let so = "", se = "";
    p.stdout.on("data", (d) => (so += d)); p.stderr.on("data", (d) => { se += d; if (!quiet) process.stderr.write(d); });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res({ so, se }) : rej(new Error(`${cmd} exited ${c}: ${se.slice(-600)}`))));
  });
}
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

// ── meta ────────────────────────────────────────────────────────────────────
if (!has("meta.json")) {
  const { so } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", input]);
  const j = JSON.parse(so), v = j.streams.find((s) => s.codec_type === "video");
  const [n, d] = v.r_frame_rate.split("/").map(Number);
  save("meta.json", { file: path.resolve(input), width: v.width, height: v.height, fps: +(n / d).toFixed(3), duration: +(+j.format.duration).toFixed(3), audio: j.streams.some((s) => s.codec_type === "audio") });
}
const meta = load("meta.json");

// ── per-frame scene score + luma ────────────────────────────────────────────
if (!has("frames.json")) {
  log("scene scores + luma per frame");
  const tmp = path.join(os.tmpdir(), `dissect-${process.pid}.txt`);
  await run("ffmpeg", ["-v", "error", "-i", input, "-vf", `scale=160:-2,select='gte(scene\\,0)',signalstats,metadata=print:file=${tmp}`, "-an", "-f", "null", "-"]);
  const frames = []; let cur = null;
  for (const line of fs.readFileSync(tmp, "utf8").split("\n")) {
    const m = line.match(/pts_time:([\d.]+)/); if (m) { cur = { t: +(+m[1]).toFixed(3) }; frames.push(cur); continue; }
    const s = line.match(/lavfi\.scene_score=([\d.]+)/); if (s && cur) cur.scene = +(+s[1]).toFixed(4);
    const y = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/); if (y && cur) cur.luma = +(+y[1]).toFixed(1);
  }
  fs.rmSync(tmp, { force: true });
  save("frames.json", frames);
}
const frames = load("frames.json");

// ── cuts and flashes ────────────────────────────────────────────────────────
if (!has("cuts.json")) {
  const cuts = [], flashes = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const f = frames[i];
    // a cut: a scene-score spike well above its neighbours
    const around = frames.slice(Math.max(0, i - 6), i + 7).filter((x, k) => x !== f).map((x) => x.scene || 0);
    const base = around.sort((a, b) => a - b)[Math.floor(around.length / 2)] || 0;
    if ((f.scene || 0) > 0.18 && f.scene > base * 3 + 0.08 && f.scene >= (frames[i - 1].scene || 0) && f.scene >= (frames[i + 1].scene || 0))
      cuts.push({ t: f.t, score: f.scene });
  }
  // a flash: luma rises ≥ 35 within 0.25 s and comes back within 1 s
  for (let i = 3; i < frames.length - 30; i++) {
    const before = frames[i - 3].luma, peak = frames[i].luma;
    if (peak - before >= 35 && peak >= Math.max(...frames.slice(i - 3, i + 4).map((x) => x.luma))) {
      const back = frames.slice(i, i + 30).find((x) => x.luma <= before + 12);
      if (back && !flashes.some((x) => Math.abs(x.t - frames[i].t) < 0.6)) flashes.push({ t: frames[i].t, rise: +(peak - before).toFixed(1), lasts: +(back.t - frames[i].t).toFixed(2) });
    }
  }
  save("cuts.json", { cuts, flashes });
}
const { cuts, flashes } = load("cuts.json");

// ── loudness + onsets ───────────────────────────────────────────────────────
if (meta.audio && !has("loudness.json")) {
  log("loudness");
  // momentary loudness (400 ms window) from the filter's per-frame metadata, every 0.1 s
  const { se } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M", "-f", "null", "-"]);
  const pts = []; let t = null;
  for (const line of se.split("\n")) {
    const m = line.match(/pts_time:([\d.]+)/); if (m) t = +m[1];
    const v = line.match(/lavfi\.r128\.M=(-?[\d.]+|-inf|nan)/);
    if (v && t != null && (!pts.length || t - pts.at(-1).t >= 0.099)) pts.push({ t: +t.toFixed(1), M: /inf|nan/.test(v[1]) ? -70 : +(+v[1]).toFixed(1) });
  }
  save("loudness.json", pts);
}
if (meta.audio && !has("words.json")) {
  log("transcribing (whisper)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dissect-tx-"));
  const a = ["--yes", "hyperframes@0.9.4", "transcribe", path.resolve(input), "-d", dir, "--json", "--language", lang, "--model", model];
  const { so } = await run("npx", a);
  let words = null;
  try { const j = JSON.parse(so.trim().split("\n").filter((l) => l.startsWith("{")).pop()); if (Array.isArray(j.words)) words = j.words;
    else for (const k of ["transcriptPath", "outputPath", "path"]) if (j[k] && fs.existsSync(j[k])) { const t = JSON.parse(fs.readFileSync(j[k], "utf8")); words = Array.isArray(t) ? t : t.words; } } catch {}
  for (const c of [path.join(dir, "transcript.json"), path.join(dir, "assets", "transcript.json")]) if (!words && fs.existsSync(c)) { const t = JSON.parse(fs.readFileSync(c, "utf8")); words = Array.isArray(t) ? t : t.words; }
  save("words.json", (words || []).map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: +(+w.start).toFixed(2), end: +(+w.end).toFixed(2) })).filter((w) => w.text));
}
const words = has("words.json") ? load("words.json") : [];
if (meta.audio && !has("onsets.json")) {
  // energy (RMS) every 20 ms; an onset is a ≥ 9 dB jump over the previous 150 ms, not within 0.12 s of a word start
  const { se } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-af", "aresample=16000,asetnsamples=320,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"]);
  const rms = []; let t = null;
  for (const line of se.split("\n")) { const m = line.match(/pts_time:([\d.]+)/); if (m) t = +m[1]; const r = line.match(/RMS_level=(-?[\d.]+|-inf)/); if (r && t != null) rms.push({ t, db: r[1] === "-inf" ? -90 : +r[1] }); }
  const onsets = [];
  for (let i = 8; i < rms.length; i++) {
    const prev = Math.max(...rms.slice(i - 8, i - 1).map((x) => x.db));
    if (rms[i].db - prev >= 9 && rms[i].db > -40 && !onsets.some((o) => rms[i].t - o.t < 0.25)) {
      const nearWord = words.some((w) => Math.abs(w.start - rms[i].t) < 0.08);
      const nearEdit = [...cuts, ...flashes].some((c) => Math.abs(c.t - rms[i].t) < 0.2);
      onsets.push({ t: +rms[i].t.toFixed(2), jump: +(rms[i].db - prev).toFixed(1), level: +rms[i].db.toFixed(1), nearWord, nearEdit });
    }
  }
  save("onsets.json", onsets);
  // the bed under fast, gapless speech: the quietest 20 ms frames (between syllables) are mostly music
  const lv = rms.map((x) => x.db).filter((d) => d > -70).sort((a, b) => a - b);
  save("levels.json", { rmsMedian: lv[Math.floor(lv.length / 2)], rmsP08: lv[Math.floor(lv.length * 0.08)], rmsP03: lv[Math.floor(lv.length * 0.03)] });
}

// ── pictures: sheets every 1/fps s, and 9 frames around each cut ────────────
const sheetSpan = 30 / sheetFps;
const nSheets = Math.ceil(meta.duration / sheetSpan);
for (let k = 0; k < nSheets; k++) {
  const f = `sheets/sheet-${String(k + 1).padStart(2, "0")}.jpg`;
  if (has(f)) continue;
  await run("ffmpeg", ["-v", "error", "-y", "-ss", String(k * sheetSpan), "-t", String(sheetSpan), "-i", input, "-vf",
    `fps=${sheetFps},scale=200:-2,drawtext=text='%{pts\\:hms}':x=3:y=3:fontsize=12:fontcolor=white:box=1:boxcolor=black@0.7,tile=6x5:padding=2`,
    "-frames:v", "1", "-update", "1", P(f)]);
  // drawtext's pts restarts at 0 per sheet: the first frame of sheet k is at k*sheetSpan s
}
log(`${nSheets} sheet(s): sheet k starts at (k-1)×${sheetSpan}s, frames every ${1 / sheetFps}s, stamps are relative to the sheet`);
const fps = meta.fps;
for (const [i, c] of cuts.entries()) {
  const f = `cuts/cut-${String(i + 1).padStart(2, "0")}.jpg`;
  if (has(f)) continue;
  const start = Math.max(0, c.t - 4 / fps);
  await run("ffmpeg", ["-v", "error", "-y", "-ss", start.toFixed(3), "-i", input, "-vf", `scale=180:-2,tile=9x1:padding=2`, "-frames:v", "1", P(f)]).catch(() => {});
}
// motion sheets in one pass (no seeking, so the stamps are the video's own time): row = 1 s, 5 rows a sheet
const motionSpan = 5;
if (!has("motion/motion-01.jpg")) {
  log(`motion sheets: ${motionFps} frames a second`);
  await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-vf",
    `fps=${motionFps},scale=180:-2,drawtext=text='%{pts\\:hms}':x=3:y=3:fontsize=12:fontcolor=white:box=1:boxcolor=black@0.7,tile=${motionFps}x${motionSpan}:padding=2`,
    "-an", "-q:v", "3", P("motion/motion-%02d.jpg")]);
}
// shots: [start, end) between cuts; a still from the middle of each at a size where text and marks read
const shots = [0, ...cuts.map((c) => c.t)].map((t, i, a) => ({ start: t, end: a[i + 1] ?? meta.duration }));
for (const [i, s] of shots.entries()) {
  const f = `stills/shot-${String(i + 1).padStart(2, "0")}.jpg`;
  if (has(f)) continue;
  await run("ffmpeg", ["-v", "error", "-y", "-ss", ((s.start + s.end) / 2).toFixed(3), "-i", input, "-vf",
    `scale=540:-2,drawtext=text='${fmt((s.start + s.end) / 2).replace(":", "\\:")}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7`,
    "-frames:v", "1", "-q:v", "2", P(f)]).catch(() => {});
}
// motion inside a shot: the mean scene score of its frames (the cut frames left out), and the moments where
// something changes a lot at once without a cut (a pop, a wipe, a card flying in)
for (const s of shots) {
  const inside = frames.filter((f) => f.t > s.start + 0.07 && f.t < s.end - 0.04);
  s.motion = inside.length ? inside.reduce((a, f) => a + (f.scene || 0), 0) / inside.length : 0;
  s.events = inside.filter((f, k) => (f.scene || 0) > 0.035 && (f.scene || 0) >= (inside[k - 1]?.scene || 0) && (f.scene || 0) >= (inside[k + 1]?.scene || 0)).map((f) => f.t);
}

// ── report ──────────────────────────────────────────────────────────────────
const shotLens = [0, ...cuts.map((c) => c.t), meta.duration].map((t, i, a) => (i ? t - a[i - 1] : null)).filter((x) => x != null);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const loud = has("loudness.json") ? load("loudness.json") : [];
const onsets = has("onsets.json") ? load("onsets.json") : [];
const speaking = loud.filter((p) => words.some((w) => p.t >= w.start && p.t <= w.end)).map((p) => p.M);
const gaps = loud.filter((p) => p.t > 1 && !words.some((w) => p.t >= w.start - 0.15 && p.t <= w.end + 0.15)).map((p) => p.M).filter((m) => m > -60);
const wpm = words.length ? Math.round(words.length / ((words.at(-1).end - words[0].start) / 60)) : 0;
const between = (a, b) => words.filter((w) => w.start >= a && w.start < b).map((w) => w.text).join(" ");
const lines = [
  `# Dissect: ${path.basename(input)}`, "",
  `${meta.width}×${meta.height} @ ${meta.fps} fps, ${meta.duration} s. Sheets: ${nSheets} (every ${1 / sheetFps} s, sheet k starts at (k−1)×${sheetSpan} s).`, "",
  "## Numbers", "",
  `- Cuts: ${cuts.length} → median shot ${med(shotLens).toFixed(2)} s (min ${Math.min(...shotLens).toFixed(2)}, max ${Math.max(...shotLens).toFixed(2)})`,
  `- Flashes (luma jump ≥ 35): ${flashes.length}${flashes.length ? " at " + flashes.map((f) => `${fmt(f.t)} (+${f.rise}, ${f.lasts}s)`).join(", ") : ""}`,
  `- Speech: ${words.length} words, ~${wpm} words/min; first word at ${words[0]?.start ?? "-"} s`,
  `- Loudness: speech median ${med(speaking).toFixed(1)} LUFS-M` + (gaps.length > 20 ? `, gaps median ${med(gaps).toFixed(1)} → bed ≈ ${(med(speaking) - med(gaps)).toFixed(1)} dB under the voice` : ", no real gaps between words") +
    (has("levels.json") ? `; 20 ms energy: median ${load("levels.json").rmsMedian.toFixed(1)} dB, quietest 8 % ${load("levels.json").rmsP08.toFixed(1)} dB → bed roughly ${(load("levels.json").rmsMedian - load("levels.json").rmsP08).toFixed(0)} dB under the voice (upper bound; listen)` : ""),
  `- Likely sound effects (an energy jump off a word start, or on a cut/flash): ${onsets.filter((o) => !o.nearWord || o.nearEdit).length}: ` +
    onsets.filter((o) => !o.nearWord || o.nearEdit).map((o) => `${fmt(o.t)}${o.nearEdit ? "✂" : ""}`).join(", ") + "  (✂ = on an edit). Listen to confirm.",
  `- Motion inside shots (mean scene score between cuts; < 0.004 still, 0.004–0.012 talking/drifting, > 0.012 moving): median ${med(shots.map((s) => s.motion)).toFixed(4)}; ${shots.reduce((a, s) => a + s.events.length, 0)} changes without a cut (pops, wipes, fly-ins, small punch-ins)`,
  "", `Pictures: \`sheets/\` (every ${1 / sheetFps} s), \`motion/\` (${motionFps} frames a second, a row per second, sheet k = ${motionSpan}(k−1)…${motionSpan}k s), \`cuts/\` (the frames around cut NN), \`stills/shot-NN.jpg\` (shot NN at 540 px).`,
  "", "## Shots (cut → cut): motion inside, changes without a cut, what is said", "",
  ...shots.map((s, i) => `- shot-${String(i + 1).padStart(2, "0")} ${fmt(s.start)}–${fmt(s.end)} (${(s.end - s.start).toFixed(2)} s)${i ? ` [cut-${String(i).padStart(2, "0")}]` : ""} motion ${s.motion.toFixed(4)}` +
    (s.events.length ? `, changes at ${s.events.map((t) => fmt(t)).join(" ")}` : "") + `: ${between(s.start, s.end) || "—"}`),
];
fs.writeFileSync(P("report.md"), lines.join("\n") + "\n");
console.log(JSON.stringify({ out, cuts: cuts.length, flashes: flashes.length, words: words.length, sheets: nSheets, report: P("report.md") }));
