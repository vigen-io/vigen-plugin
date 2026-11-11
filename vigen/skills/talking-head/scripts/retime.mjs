#!/usr/bin/env node
// Move a timed edit onto a new take of the same script (a part was redone, the voice changed).
//
//   node <skill>/scripts/retime.mjs <project> --from <old transcript.json> [--specs shots.json,captions.json,…]
//
// prep.mjs keeps the old transcript (and specs) in work/prev-<time>/ when the plate changes and prints this
// command. Old and new words are paired; every time in the specs (default: shots.json, captions.json,
// cards.json, sound.json, whichever exist) moves through the piecewise-linear map of those pairs. Times are
// the values of the keys below, at any depth, plus the numbers in the arrays below; in shots.json, cuts and
// panel changes within 0.25 s of a seam snap onto it. Each spec's previous version goes to work/<name>.before-retime.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, projectDir, talkingInfo, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";
import { alignWords } from "./lib/align.mjs";

const TIME_KEYS = new Set(["t", "start", "end", "at", "until", "countAt", "sweep"]);
const TIME_ARRAYS = new Set(["leaks", "breathe"]);
const f2 = (x) => Math.round(x * 100) / 100;

/** old time -> new time, from the words both transcripts share. */
export function timeMap(oldWords, newWords) {
  const paired = alignWords(oldWords.map((w) => w.text), newWords);
  const pts = [[0, 0]];
  paired.forEach((p, i) => p.matched && pts.push([oldWords[i].start, p.start], [oldWords[i].end, p.end]));
  pts.sort((a, b) => a[0] - b[0]);
  const mono = [pts[0]];
  for (const p of pts.slice(1)) if (p[0] > mono[mono.length - 1][0] && p[1] >= mono[mono.length - 1][1]) mono.push(p);
  const unmatched = paired.filter((p) => !p.matched).length;
  const map = (t) => {
    if (t <= mono[0][0]) return f2(t);
    const last = mono[mono.length - 1];
    if (t >= last[0]) return f2(last[1] + (t - last[0]));
    let i = 0;
    while (mono[i + 1][0] < t) i++;
    const [x0, y0] = mono[i], [x1, y1] = mono[i + 1];
    return f2(y0 + ((y1 - y0) * (t - x0)) / (x1 - x0));
  };
  return { map, unmatched };
}

/** Every time in a spec through `map`, clamped to the new duration; `snap` (shots.json) pulls cuts onto seams. */
export function retimeSpec(spec, map, { duration, seams = [], snap = false } = {}) {
  const fix = (t) => {
    let v = Math.min(map(t), duration);
    if (snap) v = seams.find((s) => Math.abs(v - s) < 0.25) ?? v;
    return v;
  };
  const walk = (o, key) => {
    if (Array.isArray(o)) return o.map((x) => (TIME_ARRAYS.has(key) && typeof x === "number" ? fix(x) : walk(x, TIME_ARRAYS.has(key) ? key : null)));
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "number" && TIME_KEYS.has(k)) o[k] = fix(v);
        else o[k] = walk(v, k);
      }
    }
    return o;
  };
  return walk(spec, null);
}

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "retime.mjs <project> --from <old transcript.json>");
  if (!args.from) throw new NeedsInput("pass --from <old transcript.json> (prep.mjs prints the command when the plate changes).");
  const oldWords = readJson(path.resolve(ROOT, args.from), null), newWords = readJson(path.join(proj, "transcript.json"), null);
  if (!oldWords || !newWords) throw new NeedsInput("need the old transcript (--from) and the project's new transcript.json: run prep.mjs first.");
  const info = talkingInfo(proj) || {};
  const { map, unmatched } = timeMap(oldWords, newWords);
  const names = args.specs ? String(args.specs).split(",") : ["shots.json", "captions.json", "cards.json", "sound.json"];
  const done = [];
  for (const name of names) {
    const file = path.join(proj, name);
    if (!fs.existsSync(file)) continue;
    const spec = readJson(file);
    writeJson(path.join(proj, "work", `${path.basename(name, ".json")}.before-retime.json`), spec);
    writeJson(file, retimeSpec(structuredClone(spec), map, { duration: info.duration ?? Infinity, seams: info.seams, snap: name === "shots.json" }));
    done.push(name);
  }
  log(`retimed ${done.join(", ") || "nothing (no specs found)"} onto ${info.duration}s, seams ${JSON.stringify(info.seams || [])}` +
    (unmatched ? `; ${unmatched} old word(s) had no partner (times there are interpolated: check them)` : "; every word paired") +
    ". Rerun each skill's generator (shots, captions, viz-cards, sound).");
}

if (isMain(import.meta.url)) main().catch(exitOnError);
