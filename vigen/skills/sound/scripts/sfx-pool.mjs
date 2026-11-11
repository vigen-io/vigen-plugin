#!/usr/bin/env node
// Pull a varied sound palette for one video from HeyGen's sound-effects catalog (retrieval, not generation).
//
//   node <skill>/scripts/sfx-pool.mjs <project> [--per 3] [--fresh] [--ban "Name|Other name"]
//
// --ban: the user rejected these sounds by ear. Each is replaced in its own slot (so every other card keeps
// its sound) and kept on pool.json's `banned` list so no later pull brings it back.
//
// A good edit rarely repeats a sound. Each role is searched with several descriptions; the top distinct hits go
// to assets/sfx/pool/<role>/ and assets/sfx/pool.json ({ role: [{ file, name, description, duration, peak, hi }] }),
// which mix.mjs steps through so neighbours differ.
// Needs the HeyGen sign-in (`npx hyperframes auth login`) and the /media-use skill. Caption sounds are not
// pulled: the user picks those by ear (sound.json captionSfx).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, parseArgs, log, writeJson, run, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";
import { rmsFrames } from "./lib/audio.mjs";
import { GLOBAL_BANS, readGlobalBans, isGloballyBanned } from "./lib/bans.mjs";

// role -> catalog descriptions (each returns its own ranked hits; the mix gives the variety)
export const ROLES = {
  slide: ["fast airy whoosh", "quick swoosh", "fast swish", "breathy whoosh", "short synth whoosh", "quick swipe whoosh with a click"],
  riser: ["short riser into impact", "shimmering riser swell", "glitchy synthetic riser"],
  // card slides get two sounds: `slide` = the old card whooshing away, `swoop` = the new one swooping in
  swoop: ["short reverse whoosh", "rising swoosh", "air swoop", "swoop in whoosh"],
  // the intro hook (references/intro-hook.md): click on frame 1, sub drop as the music enters,
  // a noise build that bursts on the first leak
  click: ["single mouse click", "short click"],
  sweep: ["deep sub bass drop", "sub bass sweep down"],
  build: ["noisy riser to pop", "white noise riser", "breathy whoosh riser into impact"],
  // accents the author places by judgement (sound.json accents), never by a rule
  pop: ["soft pop", "bubble pop", "playful ui pop"],
  hit: ["punchy cinematic hit", "deep thud impact", "short boom hit"],
  tick: ["soft ui tick", "light tap click", "soft wooden tick"], // not "notification": chimes read as a horror sting
  // a real computer mouse on every click of a screen walkthrough (sound.json "uiClicks"): press and release of a
  // physical mouse button, close-miked; never a synth blip or a UI tick
  mouse: ["computer mouse click", "mouse button click close up", "single computer mouse click", "pc mouse click press"],
  // the shots paper pass (panel in "paper"): one sheet of paper swept past, soft and dry, never a book slam
  paper: ["paper page flip", "single page turn", "paper sheet swipe", "paper slide swish"],
};
// wider descriptions for replacing a banned sound once the role's own searches are used up
const ALT = {
  slide: ["soft whoosh", "gentle swoosh", "cloth swish", "paper swipe", "air whoosh pass by"],
  swoop: ["soft whoosh", "gentle swoosh", "air whoosh pass by"],
  hit: ["soft impact", "punchy kick drum hit", "deep tom hit", "muted thump"],
  pop: ["bubble pop", "cork pop", "soft click pop"],
  tick: ["soft tick", "wood tap", "pen click"],
  riser: ["soft riser", "gentle swell"],
};
const MAX_DUR = { slide: 2, swoop: 1.5, riser: 6, click: 1, sweep: 4, build: 5, pop: 1, hit: 2.5, tick: 0.8, mouse: 0.8 }; // long sweeps smear across the next line
const MIN_DUR = { sweep: 1, build: 1.5 }; // a build has to carry ~2 s from the sweep to the flash
const ONE_OFF = new Set(["click", "sweep", "build"]); // played once per video: bright is fine (a click and noise are bright)
const HI_MAX = { pop: 45, tick: 45, mouse: 95 }; // % of energy above 4 kHz allowed (default 30): pops and ticks are brighter by nature

function mediaUseLib() {
  const dirs = [process.env.MEDIA_USE_DIR, path.join(ROOT, ".claude/skills/media-use"), path.join(os.homedir(), ".claude/skills/media-use")];
  for (const d of dirs.filter(Boolean)) {
    const f = path.join(d, "audio/scripts/lib/heygen.mjs");
    if (fs.existsSync(f)) return f;
  }
  throw new NeedsInput("the /media-use skill is not installed (needed for the HeyGen sound catalog): install it with `npx hyperframes skills update media-use`.");
}

/** Share of the sound's energy above 4 kHz, in %. Shrill sounds (> 30 %) are dropped. */
async function brightness(file) {
  const total = (await rmsFrames(file, 0.05)).reduce((a, f) => a + 10 ** (f.db / 10), 0);
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-ac", "1", "-ar", "16000", "-af",
    "highpass=f=4000,asetnsamples=n=800:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"]);
  const hi = [...stderr.matchAll(/RMS_level=(-?[\d.]+)/g)].reduce((a, m) => a + 10 ** (+m[1] / 10), 0);
  return total ? Math.round((100 * hi) / total) : 0;
}

/** Seconds from file start to its loudest 20 ms (where the "hit" of the sound is). */
async function peakOf(file) {
  const fr = await rmsFrames(file, 0.02);
  let best = fr[0];
  for (const f of fr) if (f.db > best.db) best = f;
  return +best.t.toFixed(3);
}

/** Seconds until the sound first comes within 6 dB of its loudest 50 ms. Sub drops are timed by this:
 *  a 20 ms window can't measure a 30 Hz tone, so their "peak" lands anywhere in the tail. */
async function onsetOf(file) {
  const fr = await rmsFrames(file, 0.05);
  const max = Math.max(...fr.map((f) => f.db));
  return +(fr.find((f) => f.db > max - 6)?.t ?? 0).toFixed(3);
}

async function main() {
  const args = parseArgs();
  const projArg = args._[0];
  if (!projArg) throw new NeedsInput("which project? usage: sfx-pool.mjs <project> [--per 3] [--ban \"Name\"] [--ban-forever \"Name\"]");
  const proj = path.resolve(ROOT, projArg);
  const per = Number(args.per || 3);
  const poolDir = path.join(proj, "assets", "sfx", "pool");
  const poolJson = path.join(proj, "assets", "sfx", "pool.json");
  const old = fs.existsSync(poolJson) && !args.fresh ? JSON.parse(fs.readFileSync(poolJson, "utf8")) : null;
  const pool = old ? Object.fromEntries(Object.entries(old).filter(([k]) => Array.isArray(old[k]) && k !== "banned")) : {};
  // sounds the user rejected by ear: never pulled again for this video (--ban "Name|Other name"), or for any
  // video (--ban-forever "Name": written to the skill's banned.json, which every pull and every mix obeys)
  const forever = String(args["ban-forever"] || "").split("|").map((s) => s.trim()).filter(Boolean);
  if (forever.length) {
    const g = readGlobalBans();
    for (const name of forever) if (!g.names.some((x) => x.name.toLowerCase() === name.toLowerCase())) g.names.push({ name, said: `banned forever ${new Date().toISOString().slice(0, 10)}` });
    fs.writeFileSync(GLOBAL_BANS, JSON.stringify(g, null, 2) + "\n");
  }
  const banned = new Set([...(old?.banned || []), ...String(args.ban || "").split("|").map((s) => s.trim()).filter(Boolean), ...forever]);
  // anything already in this pool that the global list forbids is replaced in its slot too
  const globallyBanned = Object.values(pool).flat().filter((x) => isGloballyBanned(x)).map((x) => x.name);
  for (const n of globallyBanned) { banned.add(n); log(`banned.json forbids "${n}": replacing it`); }
  const toBan = [...new Set([...String(args.ban || "").split("|").map((s) => s.trim()).filter(Boolean), ...forever, ...globallyBanned])];
  const roles = Object.keys(ROLES).filter((r) => !pool[r]?.length);
  if (!roles.length && !toBan.length) {
    log(`pool exists: ${path.relative(ROOT, poolJson)} (use --fresh to pull again, --ban "<name>" to replace a sound)`);
    return;
  }
  if (old && roles.length) log(`pool exists, pulling the missing role(s): ${roles.join(", ")}`);
  const { heygenAuthHeaders, searchSounds, downloadTo } = await import(pathToFileURL(mediaUseLib()).href);
  let headers;
  try {
    headers = heygenAuthHeaders();
  } catch (e) {
    throw new NeedsInput(`HeyGen sign-in needed for the sound catalog: ask the user to run \`! npx hyperframes auth login\`. (${e.message})`);
  }
  const seen = new Set([...Object.values(pool).flat().map((x) => x.name), ...banned]);
  let fileNo = 100; // replacement files get fresh numbers so a slot's old file is never overwritten

  /** Up to `want` new sounds for a role, from its catalog descriptions (`per` from each). */
  async function pull(role, want, perQuery = per, slotNo = null, wide = false) {
    const out = [];
    for (const q of [...ROLES[role], ...(wide ? ALT[role] || [] : [])]) {
      const hits = await searchSounds(q, "sound_effects", headers, { limit: 8, minScore: 0.4 });
      let took = 0;
      for (const h of hits) {
        const key = h.name || h.audio_url;
        if (out.length >= want || took >= perQuery || seen.has(key) || !h.audio_url) continue;
        if (isGloballyBanned(h)) { log(`  skip ${h.name}: on banned.json (the user rejected it)`); continue; }
        if (+h.duration > MAX_DUR[role] || +h.duration < (MIN_DUR[role] ?? 0)) continue;
        if (role === "click" && /double|two |twice/i.test(`${h.name} ${h.description}`)) continue; // the hook opens on one click
        // a real mouse only; its press and release read as "two clicks in quick succession", which is right here
        if (role === "mouse" && (!/mouse/i.test(`${h.name} ${h.description}`) || /keyboard|typing|scroll wheel/i.test(`${h.name} ${h.description}`))) continue;
        seen.add(key);
        const ext = (new URL(h.audio_url).pathname.match(/\.(mp3|wav|m4a|ogg)$/i) || [, "mp3"])[1].toLowerCase();
        const slug = String(h.name || "sfx").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
        const no = slotNo ?? (pool[role]?.length ?? 0) + out.length + 1;
        const file = path.join(poolDir, role, `${String(no).padStart(2, "0")}-${slug}.${ext}`);
        await downloadTo(h.audio_url, file);
        const hi = await brightness(file);
        if (hi > (HI_MAX[role] ?? 30) && !ONE_OFF.has(role)) { fs.rmSync(file); log(`  skip ${h.name}: ${hi}% of its energy above 4 kHz (shrill)`); continue; }
        out.push({
          file: path.relative(proj, file).split(path.sep).join("/"),
          name: h.name, description: h.description, query: q,
          duration: +(+h.duration).toFixed(2), peak: await peakOf(file), onset: await onsetOf(file), hi, score: +(+h.score).toFixed(2),
        });
        took++;
      }
      if (out.length >= want) break;
    }
    return out;
  }

  for (const role of roles) {
    pool[role] = await pull(role, Infinity);
    log(`${role}: ${pool[role].length} sounds`);
  }
  // a banned sound is replaced in its own slot, so every other card keeps the sound it had
  for (const name of toBan) {
    const role = Object.keys(pool).find((r) => pool[r].some((x) => x.name === name));
    if (!role) { log(`ban: "${name}" is not in the pool (kept on the banned list)`); continue; }
    const i = pool[role].findIndex((x) => x.name === name);
    fs.rmSync(path.join(proj, pool[role][i].file), { force: true });
    const [rep] = await pull(role, 1, 8, fileNo++, true);
    if (rep) { pool[role][i] = rep; log(`ban: ${role} "${name}" -> "${rep.name}" (${rep.duration}s)`); }
    else { pool[role].splice(i, 1); log(`ban: ${role} "${name}" removed, no replacement found`); }
  }
  writeJson(poolJson, { source: "HeyGen sound-effects catalog via /media-use (retrieval)", banned: [...banned], ...pool });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.map((x) => `${x.name} (${x.duration}s)`)])), null, 2));
}

if (isMain(import.meta.url)) main().catch(exitOnError);
