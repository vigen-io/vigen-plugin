#!/usr/bin/env node
// sound.json -> the sound of an edit: music bed, effects and accents as <audio> clips in index.html (the
// "sound" block), each levelled against the voice. Rules and taste: references/*.md.
//
//   node <skill>/scripts/mix.mjs <project>
//
// sound.json:
//   "voice"      the voice track the levels are set against (default: talking.json voice)
//   "pool"       the palette from sfx-pool.mjs (default assets/sfx/pool.json)
//   "bgm"        { "src", "start"?, "mediaStart"?, "below"?: dB under the voice (11), "volume"?, "fadeIn"?, "fadeOut"? }
//                start defaults to the intro's sub drop, else the end of the hook sentence (a dry cold open);
//                a bed shorter than the video is looped on its full-level body with 2 s crossfades
//   "cues"       "auto": derived from shots.json (shots skill): on every panel slide a whoosh away (out whip|lift)
//                and a swoop in (in whip|drop); a riser peaking on every leak; with an intro push-in, a click on
//                frame 1, a sub drop (music enters) and a noise build into the flash. Omit for none.
//   "intro"      { "sweep"? } override where the sub drop lands
//   "accents"    YOUR picks: [{ "t" (where it peaks), "role" | "src" (+ "peak"), "gain"? dB, "why" }]
//   "captionSfx" files the USER picked by ear: one on each keyword line of captions.json as it enters
//   "clips"      exact placements: [{ "t" (start), "src", "volume"?, "dur"?, "mediaStart"? }]
//   "uiClicks"   true: a real mouse click (palette role "mouse") on every click of each ui-demo card placed in
//                shots.json (comp "ui-<id>" -> ui/<id>.json: click steps, and type/paste steps that click their
//                field 0.2/0.25 s before), varied through the palette. The template's sound section sets it.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, f3, ffmpeg, probe, projectDir, talkingInfo, canvas, setBlock, localize, loadFormat, underlay, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";
import { rmsFrames, levels, median, gain } from "./lib/audio.mjs";
import { isGloballyBanned } from "./lib/bans.mjs";

// Loudest 50 ms of each kind, dB relative to the voice's median 50 ms. Measured against a reference edit,
// then lowered by ear: risers and builds read loud and oppressive, the music bed sits 11 under (not 8).
export const TARGET = { slide: -5, swoop: -2, leak: -3, caption: -3, click: 6, sweep: 10, build: 7, pop: -4, hit: 0, tick: -6, mouse: -12, paper: -8 };
const LEAK_TAIL = 0.5; // s of a riser kept after the flash (faded), never past the next word
const MUFFLE = { kinds: new Set(["leak", "build"]), filter: "highpass=f=70,lowpass=f=2600,lowpass=f=2600,equalizer=f=1500:t=q:w=1.2:g=-2" };
const INTRO_CLICK_PEAK = 0.05;
const INTRO_SWEEP = { dur: 1.2, fadeOut: 0.9 }; // the sub hits and sinks into the music bass; catalog drops drone 2–3 s
const INTRO_RELEASE = 1.0; // the build's tail after the flash, gone before the next sentence
const SLIDE_AWAY_PEAK = 0.06; // the away whoosh peaks this long before the old panel is gone (exits accelerate)
const SLIDE_IN_PEAK = 0.08; // the swoop peaks this long after the new panel starts (entrances decelerate)
const CAPTION_SFX_DELAY = 0.17, CAPTION_MIN_GAP = 2.5;
const BGM_BELOW_VOICE = 11;
const ends = (w) => /[?.!…]["”’)]*$/.test(w?.text || "");

/** Where the intro's sub drop lands: the word after the best phrase break in 40–75 % of the hook, nearest 60 %. */
function introSweep(end, words) {
  let best = null;
  for (let i = 0; i < words.length - 1; i++) {
    const t = words[i + 1].start;
    if (t < 0.4 * end || t > 0.75 * end) continue;
    const score = (ends(words[i]) ? 2 : /[,;:]$/.test(words[i].text || "") ? 1 : 0) + (t - words[i].end) * 4 - Math.abs(t - 0.6 * end);
    if (!best || score > best.score) best = { t, score };
  }
  return f3(best ? best.t : 0.6 * end);
}

/** The intro of shots.json (a push-in landing on a flash) with its sound points, or null. */
function resolveIntro(spec, shots, words) {
  const end = shots?.intro?.end;
  if (!end) return null;
  if (words.some((w) => w.start < end - 0.02 && w.end > end + 0.02)) log(`intro: the flash at ${end}s lands on speech: move it into the pause where the hook ends (references/intro-hook.md)`);
  const k = words.findIndex((w) => w.end >= end - 0.3 && ends(w));
  const next = k >= 0 && words[k + 1] && words[k + 1].start - end < 2 ? words[k + 1].start : end + 1;
  return { end, next, sweep: spec.intro?.sweep ?? introSweep(end, words) };
}

function leakTimes(shots) {
  const t = [...(shots.leaks || []).map((l) => (typeof l === "number" ? l : l.t)),
    ...(shots.panels || []).flatMap((p) => [p.in === "leak" ? p.start : null, p.out === "leak" ? p.end : null])].filter((x) => x != null).sort((a, b) => a - b);
  return t.filter((x, i) => i === 0 || x - t[i - 1] > 0.3);
}

/** Panels as the shots skill shows them: with `hold` (default) each holds until the next arrives. */
function heldPanels(shots, D) {
  const ps = [...(shots?.panels || [])].map((p) => ({ ...p })).sort((a, b) => a.start - b.start);
  if (!ps.length || shots.hold === false) return ps;
  const keep = (a, b) => (shots.breathe || []).some(([s, e]) => s < b && e > a);
  for (let i = 0; i < ps.length - 1; i++) if (ps[i + 1].start - ps[i].end > 0.05 && !keep(ps[i].end, ps[i + 1].start)) ps[i].end = ps[i + 1].start;
  const last = ps[ps.length - 1];
  if (D - last.end > 0.05 && !keep(last.end, D)) (last.end = D), (last.out = "cut");
  return ps;
}

/** "cues": "auto" — the sounds every slide, leak and intro gets (see the header). */
function autoCues(shots, pool, intro, words, captions, picked, D) {
  const hits = [];
  if (intro) {
    hits.push({ at: INTRO_CLICK_PEAK, kind: "click", prio: 4 }, { at: intro.sweep, kind: "sweep", prio: 4 });
    if (!pool?.click?.length || !pool?.sweep?.length || !pool?.build?.length) log("intro: the palette has no click/sweep/build: rerun sfx-pool.mjs (it pulls only the missing roles)");
  }
  const ps = heldPanels(shots, D);
  for (let i = 1; i < ps.length; i++) {
    if (["whip", "lift"].includes(ps[i - 1].out)) hits.push({ at: ps[i - 1].end - SLIDE_AWAY_PEAK, kind: "slide", prio: 2 });
    if (["whip", "drop"].includes(ps[i].in)) hits.push({ at: ps[i].start + SLIDE_IN_PEAK, kind: "swoop", prio: 2 });
  }
  // a paper pass: the page sound peaks as the sheet covers the frame (the cut)
  for (const p of shots?.panels || []) if (p.in === "paper") hits.push({ at: p.start, kind: "paper", prio: 3 });
  for (const t of leakTimes(shots || {})) hits.push({ at: t, kind: intro && Math.abs(t - intro.end) < 0.05 && pool?.build?.length ? "build" : "leak", prio: 3 });
  if (picked.length)
    [...(captions?.groups || [])].sort((a, b) => a.start - b.start).forEach((cap, gi) => {
      const items = cap.lines || cap.words || [];
      const li = items.findIndex((l) => l.style === "b");
      if (li >= 0 || gi === 0) hits.push({ at: Math.max(cap.start, items[Math.max(0, li)]?.at ?? cap.start) + CAPTION_SFX_DELAY, kind: "caption", prio: 1 });
    });
  // two sounds of one kind closer than 0.35 s are one; different kinds only merge when they land together
  const clash = (k, h) => Math.abs(k.at - h.at) < (h.prio === 1 ? CAPTION_MIN_GAP : k.kind === h.kind ? 0.35 : 0.05);
  const kept = [];
  for (const h of [...hits].sort((a, b) => b.prio - a.prio || a.at - b.at)) if (!kept.some((k) => clash(k, h))) kept.push(h);
  if (ps.length > 1 && !pool?.slide?.length) log("sfx: no palette (assets/sfx/pool.json): slides are silent: run sfx-pool.mjs");
  if (kept.some((h) => h.kind === "paper") && !pool?.paper?.length) log("sfx: no paper sound in the palette: the paper pass is silent: run sfx-pool.mjs");
  if (kept.some((h) => h.kind === "leak") && !pool?.riser?.length) log("sfx: no riser in the palette: leak flashes are silent: run sfx-pool.mjs");
  // whooshes that end on a thud/impact land (swoop in); airy ones fade (away)
  const lands = (x) => /impact|thud|hit/i.test(x.name || "");
  const lists = { slide: (pool?.slide || []).filter((x) => !lands(x)), swoop: [...(pool?.swoop || []), ...(pool?.slide || []).filter(lands)], leak: pool?.riser, paper: pool?.paper };
  if (!lists.swoop.length) lists.swoop = pool?.slide || [];
  const step = { slide: 0, swoop: 0, leak: 0, paper: 0 };
  let n = 0;
  return kept.sort((a, b) => a.at - b.at).flatMap((h) => {
    if (h.kind === "caption") return [{ t: f3(h.at), src: picked[n++ % picked.length], kind: "caption" }];
    if (h.kind === "click" || h.kind === "sweep") {
      const x = pool?.[h.kind]?.[0];
      if (!x) return [];
      const lead = h.kind === "sweep" ? x.onset ?? 0.05 : x.peak; // a sub drop lands on its onset
      const t = f3(Math.max(0, h.at - lead));
      return [h.kind === "sweep" ? { t, src: x.file, kind: h.kind, dur: f3(lead + INTRO_SWEEP.dur), fadeOut: INTRO_SWEEP.fadeOut } : { t, src: x.file, kind: h.kind }];
    }
    if (h.kind === "build") {
      // the build whose peak best fills sweep -> flash; never before the sweep (trimmed with mediaStart)
      const span = intro.end - intro.sweep;
      const x = [...pool.build].sort((a, b) => Math.abs(a.peak - span) - Math.abs(b.peak - span))[0];
      const nominal = h.at - x.peak, start = Math.max(nominal, intro.sweep, 0);
      const release = Math.min(INTRO_RELEASE, Math.max(0.25, intro.next - h.at));
      return [{ t: f3(start), src: x.file, kind: "build", mediaStart: f3(start - nominal), dur: f3(h.at + release - start), fadeIn: f3(0.6 * (h.at - start)), fadeOut: f3(release - 0.05) }];
    }
    const list = lists[h.kind];
    const x = list?.length ? list[(step[h.kind]++ * 5) % list.length] : null;
    if (!x) return [];
    const t = f3(Math.max(0, h.at - x.peak));
    if (h.kind !== "leak") return [{ t, src: x.file, kind: h.kind }];
    // a riser's whole tail over the next words read too loud: keep LEAK_TAIL after the flash, stop before the next word
    const next = words.find((w) => w.start > h.at + 0.05)?.start ?? h.at + 1;
    const tail = Math.min(LEAK_TAIL, Math.max(0.2, next - h.at));
    return [{ t, src: x.file, kind: "leak", dur: f3(h.at - t + tail), fadeOut: f3(Math.min(tail, 0.35)) }];
  });
}

/** "uiClicks": a mouse click on every click of the ui-demo cards on screen, as their steps time them (engine.mjs). */
function uiClicks(proj, shots, pool) {
  const list = pool?.mouse || [];
  const times = [];
  for (const p of shots?.panels || []) {
    const id = /^ui-(.+)$/.exec(p.comp || "")?.[1];
    const demo = id && readJson(path.join(proj, "ui", `${id}.json`), null);
    if (!demo) continue;
    for (const st of demo.steps || []) {
      const t = st.do === "click" ? st.at : (st.do === "type" || st.do === "paste") && st.click !== false ? st.at - (st.do === "paste" ? 0.25 : 0.2) : null;
      if (t != null && t >= p.start && t < p.end) times.push(t);
    }
  }
  if (times.length && !list.length) { log(`uiClicks: ${times.length} click(s) but no "mouse" sounds in the palette: rerun sfx-pool.mjs (it pulls the missing role)`); return []; }
  return times.sort((a, b) => a - b).map((at, i) => {
    const x = list[i % list.length]; // the same click twice in a row reads as a loop
    return { t: f3(Math.max(0, at - (x.onset ?? x.peak))), src: x.file, kind: "mouse" }; // the press lands on the click; the release follows
  });
}

/** Accents: a sound on a moment you chose, never by a rule. Items of one card share one sound. */
function accents(spec, pool) {
  const step = {};
  return (spec.accents || []).flatMap((a) => {
    const list = pool?.[a.role] || [];
    const x = a.src ? { file: a.src, peak: a.peak ?? 0.05 } : list.length ? list[((step[a.role] = (step[a.role] ?? -1) + 1) * 3) % list.length] : null;
    if (!x) { log(`accent at ${a.t}s: no "${a.role}" sounds in the palette (sfx-pool.mjs pulls them)`); return []; }
    return [{ t: f3(Math.max(0, a.t - x.peak)), src: x.file, kind: a.role in TARGET ? a.role : "pop", gain: a.gain ?? 0 }];
  });
}

/** EQ'd copy for MUFFLE kinds: full-band hiss through a steep low-pass swells instead of a wall of noise. */
async function muffled(proj, rel) {
  const out = `assets/sfx/fx/${path.basename(rel).replace(/\.[^.]+$/, "")}.muffled.wav`;
  if (!fs.existsSync(path.join(proj, out))) {
    fs.mkdirSync(path.dirname(path.join(proj, out)), { recursive: true });
    await ffmpeg(["-i", path.join(proj, rel), "-af", MUFFLE.filter, "-ar", "48000", path.join(proj, out)]);
  }
  return out;
}

/** A bed shorter than `need`: loop its full-level body (skip intro/outro fades) with 2 s equal-power crossfades. */
async function loopTo(proj, src, need) {
  const abs = path.join(proj, src);
  const d = (await probe(abs)).duration;
  if (d >= need) return src;
  const fr = await rmsFrames(abs, 0.1);
  const bodyDb = median(fr.map((f) => f.db).filter((x) => x > -60));
  const loud = fr.filter((f) => f.db > bodyDb - 10);
  const head = loud.length ? loud[0].t : 0, tail = loud.length ? Math.min(d, loud[loud.length - 1].t + 0.1) : d;
  const X = 2, first = tail - X, mid = tail - head - X;
  const n = 1 + Math.max(1, Math.ceil((need - first - (d - tail)) / mid));
  const rel = src.replace(/\.[^.]+$/, `.loop${n}.m4a`);
  if (!fs.existsSync(path.join(proj, rel))) {
    const parts = Array.from({ length: n }, (_, i) => `[${i}:a]atrim=${f3(i === 0 ? 0 : head)}:${f3(i === n - 1 ? d : tail)},asetpts=PTS-STARTPTS[p${i}]`);
    const chain = [];
    let prev = "[p0]";
    for (let i = 1; i < n; i++) {
      const o = i === n - 1 ? "[out]" : `[x${i}]`;
      chain.push(`${prev}[p${i}]acrossfade=d=${X}:c1=qsin:c2=qsin${o}`);
      prev = o;
    }
    await ffmpeg([...Array.from({ length: n }, () => ["-i", abs]).flat(), "-filter_complex", [...parts, ...chain].join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", path.join(proj, rel)]);
    log(`bgm: ${src} is ${d.toFixed(1)} s, looped ×${n} on its body (${head.toFixed(1)}–${tail.toFixed(1)} s) -> ${rel}`);
  }
  return rel;
}

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "mix.mjs <project>");
  const raw = readJson(path.join(proj, "sound.json"), null);
  if (!raw) throw new NeedsInput(`${path.relative(ROOT, proj)}/sound.json is missing: write it (header of mix.mjs, references/).`);
  // the template's sound section (bed level, cues) is the default under sound.json
  const spec = underlay(loadFormat(proj, raw).sound || {}, raw);
  const D = canvas(proj).duration;
  if (!D) throw new NeedsInput("the project has no length yet (talking.json or index.html data-duration).");
  const info = talkingInfo(proj) || {};
  const voiceRel = spec.voice || info.voice;
  const voice = voiceRel && fs.existsSync(path.join(proj, voiceRel)) ? await levels(path.join(proj, voiceRel)) : null;
  if (!voice) log("! no voice track to level against: volumes fall back to fixed values");
  const pool = readJson(path.join(proj, spec.pool || "assets/sfx/pool.json"), null);
  const shots = readJson(path.join(proj, "shots.json"), null);
  const captions = readJson(path.join(proj, "captions.json"), null);
  const words = readJson(path.join(proj, "transcript.json"), []);
  const intro = spec.cues === "auto" ? resolveIntro(spec, shots, words) : null;

  // effects: auto cues + accents + exact clips, each with its real length, level and a free lane
  let list = [...(spec.cues === "auto" ? autoCues(shots, pool, intro, words, captions, [].concat(spec.captionSfx || []), D) : []),
    ...(spec.uiClicks ? uiClicks(proj, shots, pool) : []), ...accents(spec, pool),
    ...(spec.clips || []).map((c) => ({ ...c, kind: "clip" }))];
  const missing = [...new Set(list.map((s) => s.src))].filter((s) => !fs.existsSync(path.isAbsolute(s) ? s : path.join(proj, s)) && !fs.existsSync(path.resolve(ROOT, s)));
  if (missing.length) log(`! not found, skipped: ${missing.join(", ")}`);
  list = list.filter((s) => !missing.includes(s.src));
  // the blacklist wins over everything, even an exact clip someone typed in: never place a rejected sound
  const entry = (src) => Object.values(pool || {}).flat().find((x) => x?.file === src) || { file: src };
  const refused = [...new Set(list.filter((s) => isGloballyBanned(entry(s.src))).map((s) => s.src))];
  if (refused.length) log(`! banned.json: refused ${refused.join(", ")} (rerun sfx-pool.mjs to get replacements)`);
  list = list.filter((s) => !refused.includes(s.src));
  const tags = [], lanes = [], lens = {};
  for (const s of list.sort((a, b) => a.t - b.t)) {
    let src = localize(proj, s.src, "sfx");
    if (MUFFLE.kinds.has(s.kind)) src = await muffled(proj, src);
    lens[src] ??= (await probe(path.join(proj, src))).duration;
    const dur = f3(Math.min(lens[src] - (s.mediaStart || 0), s.dur ?? Infinity, D - s.t));
    if (dur <= 0.05) continue;
    let volume = s.volume;
    if (volume == null && voice && TARGET[s.kind] != null) volume = gain(voice.med + TARGET[s.kind] + (s.gain || 0) - (await levels(path.join(proj, src))).max);
    let lane = lanes.findIndex((end) => end <= s.t);
    if (lane < 0) lane = lanes.push(0) - 1;
    lanes[lane] = s.t + dur;
    const extra = [s.mediaStart ? ` data-media-start="${s.mediaStart}"` : "", s.fadeIn ? ` data-fade-in="${s.fadeIn}"` : "", s.fadeOut ? ` data-fade-out="${s.fadeOut}"` : ""].join("");
    tags.push(`<audio id="sfx-${tags.length + 1}" class="clip" src="${src}" data-start="${f3(s.t)}" data-duration="${dur}" data-track-index="${6 + lane}" data-volume="${volume ?? 0.5}"${extra}></audio>`);
  }

  // music bed
  let bed = null;
  if (spec.bgm?.src) {
    const b = spec.bgm;
    const hook = words.find((w) => ends(w));
    const start = f3(b.start ?? intro?.sweep ?? (hook && hook.end < 6 ? hook.end : 0));
    const src = await loopTo(proj, localize(proj, b.src, "music"), (b.mediaStart ?? 0) + D - start);
    let volume = b.volume;
    if (volume == null && voice) volume = gain(voice.med - (b.below ?? BGM_BELOW_VOICE) - (await levels(path.join(proj, src))).med);
    bed = { start, src, volume: volume ?? 0.12 };
    tags.unshift(`<audio id="bgm" class="clip" src="${src}" data-start="${start}" data-duration="${f3(D - start)}" data-media-start="${b.mediaStart ?? 0}" data-track-index="5" data-volume="${bed.volume}" data-fade-in="${b.fadeIn ?? 0.15}" data-fade-out="${b.fadeOut ?? 2}"></audio>`);
  } else log("NO MUSIC BED: set bgm.src to the user's track or a catalog track (references/music.md).");

  setBlock(proj, "sound", tags.join("\n"));
  log(`sound: ${bed ? `music from ${bed.start}s at ${bed.volume}` : "no music"}, ${tags.length - (bed ? 1 : 0)} effect(s)${intro ? `; intro click, sub drop at ${intro.sweep}s, build into ${intro.end}s` : ""}`);
}

if (isMain(import.meta.url)) main().catch(exitOnError);
