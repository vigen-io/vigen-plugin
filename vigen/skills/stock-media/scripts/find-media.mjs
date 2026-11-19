#!/usr/bin/env node
// Find card media: the user's own library first, then free commercially usable stock, before ever generating.
//
//   node <skill>/scripts/find-media.mjs <project>                 every card in media_queries.json
//   node <skill>/scripts/find-media.mjs <project> --card <id>     one card again (after editing its queries)
//   node <skill>/scripts/find-media.mjs <project> --card <id> --q "a" --q2 "b" [--kind image|video|any]
//   node <skill>/scripts/find-media.mjs <project> --card <id> --only library,press   only those sources
//        (library | press | youtube | stock); the default is every source, on one numbered sheet
//   node <skill>/scripts/find-media.mjs <project> --pick <id> <n>  install candidate n as assets/media/<id>.<ext>
//        [--as <name>]   save as assets/media/<name>.* instead (several picks for one viz card)
//        [--from <s>] [--dur <s>]   a YouTube pick: the section to take (default 0 and 8 s)
//        [--owner-ok]    a YouTube pick: the channel was checked to be the footage's maker (required)
//        [--still]       a video candidate as a photo: the frame at --from (default for an image card)
//   node <skill>/scripts/find-media.mjs <project> --peek <id> <n> [--every <s>] [--from <s> --dur <s>]
//        a video candidate's frames, timestamped -> work/media/<id>/peek_<n>.jpg: the whole video first, then
//        zoom into a stretch (--from 560 --dur 30) to find a clean section (no burned-in text, no cut)
//
// <project>/media_queries.json (written by the agent while planning the edit):
//   [{ "id": "prompt-box", "need": "someone typing a prompt into a chatbot",
//      "queries": ["hands typing laptop", "person at computer night"], "kind": "any" },
//    { "id": "launch", "need": "a rocket launch", "queries": ["rocket launch"], "kind": "video", "pd": true },
//    { "id": "galaxy", "need": "the Galaxy S25 product shot", "press": ["https://news.samsung.com/…"],
//      "pressTerms": "https://…/terms", "kind": "image" }]
// "press": pages of the brand's OWN newsroom / press kit: every image and video on them becomes a candidate,
// licensed for editorial use only (reviews, rankings, news). A project whose meta.json has "sponsored": true
// (an ad, a paid post, a brand deal) refuses to install one.
// Every card also searches YouTube for Creative Commons (CC BY) videos (lib/youtube.mjs, needs yt-dlp);
// "youtube": false (or "sources": [...] on the card) leaves it out, e.g. for an abstract card.
// Queries must be things a camera can film ("Hugging Face" -> "programmers office"): stock search has no
// idea what brands, people or numbers are. Those go on viz cards (logos / chart / stat) instead.
// Every source runs, listed in this order on one sheet: library/ matches (labelled items only), the card's press
// pages, YouTube CC, then stock. The user's own files still come first: judge them before the rest.
// Output per card: work/media/<id>/candidates.json + sheet.jpg (numbered contact sheet: look at it).
// Picks are recorded with their source/license in assets/media/CREDITS.json and CREDITS.txt.
// Exit 4 = the library has unlabelled items: run library.mjs scan, label them, then search.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, download, ffmpeg, probe, NeedsInput, exitOnError } from "./lib/util.mjs";
import { searchStock, activeProviders } from "./lib/stock.mjs";
import { searchPress } from "./lib/press.mjs";
import { searchYouTube, downloadPeek, downloadSection } from "./lib/youtube.mjs";
import { contactSheet } from "./lib/sheet.mjs";
import { LIB_DIR, libraryExists, scanLibrary, searchLibrary, isLabeled, thumbOf } from "./lib/library.mjs";

const extOf = (url, kind) => {
  const e = path.extname(/^https?:/.test(url) ? new URL(url).pathname : url).toLowerCase();
  if (kind === "video") return [".mp4", ".webm", ".ogv", ".mov"].includes(e) ? e : ".mp4";
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"].includes(e) ? e : ".jpg";
};

const hms = (t) => `${Math.floor(t / 60)}m${String(Math.round(t % 60)).padStart(2, "0")}`;
const sheetLabel = (it) => it.provider === "youtube"
  ? `${it.n}  YT ${it.author}  ${hms(it.duration)}  ${it.height}p${it.risks?.length ? "  !" : ""}`
  : it.provider === "library"
  ? `${it.n}  LIBRARY ${it.libId}  ${it.kind}${it.duration ? ` ${Math.round(it.duration)}s` : ""}  ${it.score}`
  : `${it.n}  ${it.provider.startsWith("press/") ? it.provider.toUpperCase() : it.provider.split("/")[0]}  ${it.kind}${it.duration ? ` ${Math.round(it.duration)}s` : ""}  ${it.width || "?"}w${it.relevance === 0 ? "  ?" : ""}`;

// Sources a person browses, never automated (Destockd's robots.txt disallows its API; WikiFlix is whole
// films): suggest them so the user can download a shot into library/, where it is labelled and searched.
function manualHint(card) {
  log(`  ↳ ${card.id}: weak/no stock match. Manual sources the user can browse (download into library/):` +
    `\n      Destockd (public-domain US government shots): https://www.destockd.com  — search "${card.queries[0]}"` +
    `\n      Wikimedia Commons public domain: add "pd": true to this card and search again`);
}

const SOURCES = ["library", "press", "youtube", "stock"];
async function searchCard(proj, card, { perProvider, only }) {
  const on = new Set(only || card.sources || SOURCES.filter((s) => !(s === "youtube" && card.youtube === false)));
  // a sponsored project (an ad, a paid post, Vigen's own marketing) can't use editorial-only press media
  if (readJson(path.join(proj, "meta.json"), {}).sponsored) on.delete("press");
  const dir = path.join(proj, "work/media", card.id);
  fs.mkdirSync(dir, { recursive: true });
  const items = [];

  // 1. the user's library
  if (on.has("library")) for (const h of searchLibrary(card.queries, { kind: card.kind || "any", need: card.need })) {
    items.push({ n: items.length + 1, provider: "library", libId: h.id, kind: h.kind, title: h.desc, author: "user library",
      license: "user-supplied", attribution: false, url: path.join(LIB_DIR, h.rel), local: true, page: path.join("library", h.rel),
      width: h.width, height: h.height, duration: h.duration, score: h.score, query: h.query, previewFile: thumbOf(h) });
  }
  const libCount = items.length;

  // 2. the brand's own press pages, when the card names them (editorial use)
  if (card.press && on.has("press")) {
    const { results, errors } = await searchPress(card, dir);
    for (const e of errors) log(`  ! ${e}`);
    for (const r of results) items.push({ n: items.length + 1, ...r });
  }
  const pressCount = items.length - libCount;

  // 3. YouTube Creative Commons (real footage of named products and places, which stock rarely has)
  if (on.has("youtube")) {
    const { results, errors } = await searchYouTube(card, dir, { perQuery: perProvider });
    for (const e of errors) log(`  ! ${e}`);
    for (const r of results) items.push({ n: items.length + 1, ...r });
    for (const r of results.filter((r) => r.risks.length)) log(`  ! #${r.n} ${r.author}: ${r.risks.join(", ")}`);
  }
  const ytCount = items.length - libCount - pressCount;

  // 4. free stock
  if (on.has("stock")) {
    const { results, errors } = await searchStock(card.queries, { kind: card.kind || "any", perProvider, pd: !!card.pd, need: card.need });
    for (const e of errors) log(`  ! ${e}`);
    for (const r of results) {
      const n = items.length + 1;
      const previewFile = path.join(dir, `p_${String(n).padStart(2, "0")}${extOf(r.preview, "image")}`);
      try { await download(r.preview, previewFile); } catch { continue; }
      items.push({ n, ...r, previewFile });
    }
  }
  writeJson(path.join(dir, "candidates.json"), { id: card.id, need: card.need, queries: card.queries, kind: card.kind || "any", items });
  if (!items.length) { log(`${card.id}: nothing found for ${JSON.stringify(card.queries)} — rewrite the queries (filmable terms), or make it a viz card`); manualHint(card); return null; }
  const sheet = await contactSheet(path.join(dir, "sheet.jpg"), items.map((it) => ({ previewFile: it.previewFile, label: sheetLabel(it), contain: it.provider === "library" && it.kind === "video" })));
  const stockCount = items.length - libCount - pressCount - ytCount;
  const src = `${libCount} library + ${pressCount} press + ${ytCount} youtube + ${stockCount} stock${card.press || !on.has("press") ? "" : " (no press pages on the card: add the brand's newsroom page for a named product)"}`;
  log(`${card.id}: ${items.length} candidates, ${src} -> ${sheet}`);
  if (items.every((it) => it.provider !== "library" && it.relevance === 0)) manualHint(card);
  return sheet;
}

// a video candidate's frames every few seconds, timestamped: where to take the section from
async function peek(proj, id, n, { every, from, dur: span } = {}) {
  const dir = path.join(proj, "work/media", id);
  const it = readJson(path.join(dir, "candidates.json"))?.items.find((x) => x.n === Number(n));
  if (!it || it.kind !== "video") throw new Error(`${id} has no video candidate ${n}`);
  let src = it.local ? it.url : path.join(dir, `peek_${n}.mp4`);
  if (!it.local && !fs.existsSync(src)) {
    log(`downloading a 360p copy of ${it.url}`);
    if (it.provider === "youtube") await downloadPeek(it.url, src); else await download(it.url, src);
  }
  const total = (await probe(src)).duration, a = Number(from) || 0, dur = Math.min(Number(span) || total - a, total - a);
  const step = Number(every) || Math.max(span ? 0.5 : 2, +(dur / 32).toFixed(1));
  const fdir = path.join(dir, `peek_${n}.frames`);
  fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
  // the first frame at or after each step (the fps filter would show each interval's last frame: labels half a
  // step early, 15 s at a 30 s step)
  await ffmpeg(["-ss", String(a), "-t", String(dur), "-i", src, "-vf", `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${step - 0.02})',scale=480:-2`,
    "-fps_mode", "vfr", "-q:v", "4", path.join(fdir, "f_%03d.jpg")]);
  const frames = fs.readdirSync(fdir).sort().map((f, i) => { const t = +(a + i * step).toFixed(1);
    return { previewFile: path.join(fdir, f), label: `${hms(t)}  (${t}s)`, contain: true }; });
  const sheet = await contactSheet(path.join(dir, `peek_${n}.jpg`), frames, { cols: 6 });
  fs.rmSync(fdir, { recursive: true, force: true });
  log(`${id} #${n}: ${frames.length} frames, one every ${step}s, ${a}–${Math.round(a + dur)}s of ${Math.round(total)}s -> ${sheet}`);
  return sheet;
}

async function pick(proj, id, n, { as, from, dur, ownerOk, still } = {}) {
  const dir = path.join(proj, "work/media", id);
  const cands = readJson(path.join(dir, "candidates.json"));
  if (!cands) throw new Error(`no candidates for ${id}; search first`);
  const it = cands.items.find((x) => x.n === Number(n));
  if (!it) throw new Error(`${id} has no candidate ${n}`);
  // a video on an image card gives a still: the frame at --from
  const asStill = it.kind === "video" && (still || cands.kind === "image");
  if (it.editorial && readJson(path.join(proj, "meta.json"), {}).sponsored)
    throw new Error(`${id} #${n} is a press-kit image (editorial use only) and this project is marked "sponsored" in meta.json: pick stock or the user's own photo`);
  let raw = it.url;
  if (it.provider === "youtube") {
    if (!ownerOk) throw new Error(`${id} #${n} is a YouTube CC video by "${it.author}" (${it.channel?.url}): CC BY only counts from the footage's maker. Check the channel (its own uploads, not re-posts; the section is the channel's own filming, not a brand ad cut in), then pick again with --owner-ok`);
    const a = Number(from) || 0, d = asStill ? 1 : Number(dur) || 8;
    if (a + d > it.duration + 0.5) throw new Error(`${id} #${n} is ${Math.round(it.duration)}s long: --from ${a} --dur ${d} runs past the end`);
    raw = path.join(dir, `full_${n}_${a}.mp4`);
    log(`downloading ${it.url} ${a}–${a + d}s`);
    await downloadSection(it.url, raw, a, d);
    it.section = [a, a + d];
  } else if (!it.local) {
    raw = path.join(dir, `full_${n}${extOf(it.url, it.kind)}`);
    const url = it.url.replace(/^(https:\/\/upload\.wikimedia\.org\/[^?]*)\?utm_.*$/, "$1");   // 429s with the utm query
    log(`downloading ${it.provider} ${it.kind} ${url}`);
    await download(url, raw);
  }
  const media = path.join(proj, "assets/media");
  fs.mkdirSync(media, { recursive: true });
  const name = as || id; // --as: several picks for one card (e.g. both robots of a compose card)
  for (const old of fs.readdirSync(media).filter((f) => f.startsWith(`${name}.`))) fs.rmSync(path.join(media, old));
  let dest;
  if (asStill) {
    // one frame, from the section (YouTube: its first frame) or at --from in a whole file
    dest = path.join(media, `${name}.jpg`);
    await ffmpeg([...(it.provider === "youtube" ? [] : ["-ss", String(Number(from) || 0)]), "-i", raw, "-frames:v", "1", "-vf", "scale='min(2560,iw)':-2,format=yuvj420p", "-q:v", "2", dest]);
  } else if (it.kind === "video") {
    // H.264 CFR with a keyframe every second so HyperFrames can seek; no audio (cards are muted).
    // Stock is cut to 30 s; library clips stay whole (pick the moment with the card's mediaStart).
    dest = path.join(media, `${name}.mp4`);
    await ffmpeg(["-i", raw, ...(it.local ? [] : ["-t", "30"]), "-an", "-vf", "scale='min(1920,iw)':-2,fps=30", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "20", "-g", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest]);
  } else {
    dest = path.join(media, `${name}.jpg`);
    // 10-bit, alpha (PNG) or CMYK sources: JPEG takes 8-bit 4:2:0 only
    await ffmpeg(["-i", raw, "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2,format=yuvj420p", "-q:v", "2", dest]);
  }
  const rel = path.relative(proj, dest);
  const credits = readJson(path.join(media, "CREDITS.json"), {});
  credits[name] = { file: rel, card: id, provider: it.provider, title: it.title, author: it.author, license: it.license,
    licenseUrl: it.licenseUrl, page: it.page, attributionRequired: !!it.attribution, attributionText: it.attributionText || null,
    ...(it.editorial ? { editorialOnly: true } : {}),
    ...(it.provider === "youtube" ? { section: it.section, channelUrl: it.channel?.url, ownerChecked: true } : {}) };
  writeJson(path.join(media, "CREDITS.json"), credits);
  const lines = Object.entries(credits).filter(([, c]) => c.attributionRequired)
    .map(([, c]) => c.attributionText || `${c.title} by ${c.author} (${c.license}) ${c.page}`);
  const editorial = Object.values(credits).some((c) => c.editorialOnly)
    ? "\nPress-kit media above is for editorial use only: not for ads, paid posts or brand deals.\n" : "";
  fs.writeFileSync(path.join(media, "CREDITS.txt"), (lines.length ? `Media credits\n${lines.join("\n")}\n` : "No attribution required.\n") + editorial);
  const info = it.kind === "video" && !asStill ? ` ${(await probe(dest)).duration.toFixed(1)}s` : asStill ? ` (still at ${Number(from) || 0}s)` : "";
  if (it.provider === "youtube" && !asStill) {
    // the section itself, a frame every 0.5 s: burned-in titles, a cut or someone else's footage show here
    const d = (await probe(dest)).duration, fdir = path.join(dir, `picked_${name}.frames`);
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
    await ffmpeg(["-i", dest, "-vf", "select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,0.48)',scale=480:-2", "-fps_mode", "vfr", "-q:v", "4", path.join(fdir, "f_%03d.jpg")]);
    const frames = fs.readdirSync(fdir).sort().map((f, i) => ({ previewFile: path.join(fdir, f), label: `+${(i * 0.5).toFixed(1)}s  (${(it.section[0] + i * 0.5).toFixed(1)}s)`, contain: true }));
    const sheet = await contactSheet(path.join(dir, `picked_${name}.jpg`), frames, { cols: 6 });
    fs.rmSync(fdir, { recursive: true, force: true });
    log(`  look at ${path.relative(ROOT, sheet)} (${d.toFixed(1)}s): no burned-in text, no cut, the channel's own footage; else pick another --from`);
  }
  log(`${name} <- ${id} #${n} (${it.provider}, ${it.license}${it.attribution ? ", attribution required" : ""}) -> ${rel}${info}`);
  if (it.editorial) log(`  editorial use only: fine for a review / ranking / news video, not for an ad or a paid post${it.licenseUrl === it.page ? "; add the brand's terms page as \"pressTerms\" to record it" : ""}`);
  return rel;
}

async function main() {
  const args = parseArgs();
  const proj = path.resolve(ROOT, args._[0] || "");
  if (!args._[0] || !fs.existsSync(proj)) throw new NeedsInput(`no project ${args._[0] || ""} — usage: find-media.mjs <project> [--card id] [--pick id n]. Ask the user which video it is for.`);
  if (args.pick) return pick(proj, args.pick, args._[1], { as: args.as, from: args.from, dur: args.dur, ownerOk: !!args["owner-ok"], still: !!args.still });
  if (args.peek) return peek(proj, args.peek, args._[1], { every: args.every, from: args.from, dur: args.dur });

  const qfile = path.join(proj, "media_queries.json");
  let cards = readJson(qfile, []);
  if (args.card && args.q) {
    const card = { id: args.card, queries: [args.q, args.q2, args.q3].filter(Boolean), kind: args.kind || "any", need: args.need,
      ...(args.press ? { press: [].concat(args.press) } : {}) };
    cards = [...cards.filter((c) => c.id !== card.id), card];
    writeJson(qfile, cards);
  }
  const todo = args.card ? cards.filter((c) => c.id === args.card) : cards;
  if (!todo.length) throw new Error(`no cards to search; write ${path.relative(ROOT, qfile)} first (SKILL.md)`);

  // The library is searched by its labels, so unlabelled items would be silently missed: label first.
  if (libraryExists()) {
    const { idx } = await scanLibrary();
    const unl = Object.values(idx.items).filter((it) => !isLabeled(it)).length;
    if (unl && !args["skip-unlabeled"]) {
      console.error(`LABEL LIBRARY FIRST: ${unl} item(s) in library/ have no labels. Run library.mjs scan, look at the sheets, label them (library.mjs label --json …), then search again. (--skip-unlabeled to ignore them.)`);
      process.exit(4);
    }
    log(`library: ${Object.keys(idx.items).length} labelled item(s) searched first`);
  }
  const missing = ["PEXELS_API_KEY", "PIXABAY_API_KEY"].filter((k) => !process.env[k]);
  log(`online providers: ${activeProviders().join(", ")}${missing.length ? `  (add ${missing.join(" / ")} to .env for more stock photos + video)` : ""}`);
  const only = args.only ? String(args.only).split(",").map((x) => x.trim()) : null;
  if (only?.some((x) => !SOURCES.includes(x))) throw new Error(`--only takes ${SOURCES.join(", ")}`);
  for (const c of todo) await searchCard(proj, c, { perProvider: Number(args.per || 4), only });
}

main().catch(exitOnError);
