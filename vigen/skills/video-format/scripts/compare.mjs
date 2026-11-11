#!/usr/bin/env node
// A render's dissect vs a format's targets: what's in, what's off.
//
//   node compare.mjs <dissect dir of the render> --format formats/<name>/format.json [--project videos/<slug>]
//
// From the render: cuts/min, median and longest shot, flashes/min, the bed under the voice (levels.json).
// From the project (optional): the layout share (shots.json panels) and subtitle coverage (captions.json vs
// the spoken time in transcript.json), which a render can't show by itself.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const flag = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
if (!dir || !flag("format")) { console.error("compare.mjs <dissect dir> --format <format.json> [--project <dir>]"); process.exit(2); }
const T = JSON.parse(fs.readFileSync(flag("format"), "utf8")).targets || {};
const j = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const meta = j("meta.json"), { cuts, flashes } = j("cuts.json");
const lv = fs.existsSync(path.join(dir, "levels.json")) ? j("levels.json") : null;
const min = meta.duration / 60;
const shots = [0, ...cuts.map((c) => c.t), meta.duration].map((t, i, a) => (i ? t - a[i - 1] : null)).filter((x) => x != null);
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
const check = (name, value, [lo, hi], unit = "") => rows.push({ name, value: +value.toFixed(2), target: `${lo}–${hi}${unit}`, ok: value >= lo && value <= hi });
if (T.cutsPerMin) check("cuts per minute", cuts.length / min, T.cutsPerMin);
if (T.medianShot) check("median shot (s)", med(shots), T.medianShot);
if (T.maxShot) check("longest shot (s)", Math.max(...shots), [0, T.maxShot]);
if (T.flashesPerMin) check("flashes per minute", flashes.length / min, T.flashesPerMin);
if (T.bedBelowVoice && lv) check("bed under voice (dB, upper bound)", lv.rmsMedian - lv.rmsP08, T.bedBelowVoice);

const proj = flag("project");
if (proj) {
  const rd = (f) => (fs.existsSync(path.join(proj, f)) ? JSON.parse(fs.readFileSync(path.join(proj, f), "utf8")) : null);
  const sh = rd("shots.json"), cap = rd("captions.json"), words = rd("transcript.json");
  if (sh && T.presenterShare != null) {
    // presenter alone = no panel, or a "behind" panel (he stays the subject); card, split and full show media
    const covered = (sh.panels || []).filter((p) => !["behind", "over"].includes(p.layout || "behind")).reduce((s, p) => s + (p.end - p.start), 0);
    check("presenter alone (no media on screen)", 1 - covered / meta.duration, Array.isArray(T.presenterShare) ? T.presenterShare : [0, T.presenterShare]);
  }
  if (cap && words && T.subtitleCoverage != null) {
    const shown = (t) => (cap.groups || []).some((g) => g.note !== "title" && t >= g.start && t <= g.end);
    const ws = words.filter((w) => shown((w.start + w.end) / 2)).length;
    check("words with a subtitle on screen", ws / words.length, [T.subtitleCoverage, 1]);
  }
}
for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(34)} ${String(r.value).padStart(7)}   target ${r.target}`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
