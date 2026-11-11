#!/usr/bin/env node
// Find card media: the user's own library first, then free commercially usable stock, before ever generating.
//
//   node <skill>/scripts/find-media.mjs <project>                 every card in media_queries.json
//   node <skill>/scripts/find-media.mjs <project> --card <id>     one card again (after editing its queries)
//   node <skill>/scripts/find-media.mjs <project> --card <id> --q "a" --q2 "b" [--kind image|video|any]
//   node <skill>/scripts/find-media.mjs <project> --card <id> --online   also search online (library had nothing good)
//   node <skill>/scripts/find-media.mjs <project> --pick <id> <n>  install candidate n as assets/media/<id>.<ext>
//        [--as <name>]   save as assets/media/<name>.* instead (several picks for one viz card)
//
// <project>/media_queries.json (written by the agent while planning the edit):
//   [{ "id": "prompt-box", "need": "someone typing a prompt into a chatbot",
//      "queries": ["hands typing laptop", "person at computer night"], "kind": "any" },
//    { "id": "launch", "need": "a rocket launch", "queries": ["rocket launch"], "kind": "video", "pd": true }]
// Queries must be things a camera can film ("Hugging Face" -> "programmers office"): stock search has no
// idea what brands, people or numbers are. Those go on viz cards (logos / chart / stat) instead.
// Order per card: library/ matches (labelled items only). When the library has matches, online search is
// skipped unless --online; with no library match it goes online automatically.
// Output per card: work/media/<id>/candidates.json + sheet.jpg (numbered contact sheet: look at it).
// Picks are recorded with their source/license in assets/media/CREDITS.json and CREDITS.txt.
// Exit 4 = the library has unlabelled items: run library.mjs scan, label them, then search.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, download, ffmpeg, probe, NeedsInput, exitOnError } from "./lib/util.mjs";
import { searchStock, activeProviders } from "./lib/stock.mjs";
import { contactSheet } from "./lib/sheet.mjs";
import { LIB_DIR, libraryExists, scanLibrary, searchLibrary, isLabeled, thumbOf } from "./lib/library.mjs";

const extOf = (url, kind) => {
  const e = path.extname(/^https?:/.test(url) ? new URL(url).pathname : url).toLowerCase();
  if (kind === "video") return [".mp4", ".webm", ".ogv", ".mov"].includes(e) ? e : ".mp4";
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"].includes(e) ? e : ".jpg";
};

const sheetLabel = (it) => it.provider === "library"
  ? `${it.n}  LIBRARY ${it.libId}  ${it.kind}${it.duration ? ` ${Math.round(it.duration)}s` : ""}  ${it.score}`
  : `${it.n}  ${it.provider.split("/")[0]}  ${it.kind}${it.duration ? ` ${Math.round(it.duration)}s` : ""}  ${it.width || "?"}w${it.relevance === 0 ? "  ?" : ""}`;

// Sources a person browses, never automated (Destockd's robots.txt disallows its API; WikiFlix is whole
// films): suggest them so the user can download a shot into library/, where it is labelled and searched.
function manualHint(card) {
  log(`  ↳ ${card.id}: weak/no stock match. Manual sources the user can browse (download into library/):` +
    `\n      Destockd (public-domain US government shots): https://www.destockd.com  — search "${card.queries[0]}"` +
    `\n      Wikimedia Commons public domain: add "pd": true to this card and search again`);
}

async function searchCard(proj, card, { perProvider, online }) {
  const dir = path.join(proj, "work/media", card.id);
  fs.mkdirSync(dir, { recursive: true });
  const items = [];

  // 1. the user's library
  for (const h of searchLibrary(card.queries, { kind: card.kind || "any", need: card.need })) {
    items.push({ n: items.length + 1, provider: "library", libId: h.id, kind: h.kind, title: h.desc, author: "user library",
      license: "user-supplied", attribution: false, url: path.join(LIB_DIR, h.rel), local: true, page: path.join("library", h.rel),
      width: h.width, height: h.height, duration: h.duration, score: h.score, query: h.query, previewFile: thumbOf(h) });
  }
  const libCount = items.length;

  // 2. online stock — only when the library had nothing, or when asked
  if (!libCount || online) {
    const { results, errors } = await searchStock(card.queries, { kind: card.kind || "any", perProvider, pd: !!card.pd, need: card.need });
    for (const e of errors) log(`  ! ${e}`);
    for (const r of results) {
      const n = items.length + 1;
      const previewFile = path.join(dir, `p_${String(n).padStart(2, "0")}${extOf(r.preview, "image")}`);
      try { await download(r.preview, previewFile); } catch { continue; }
      items.push({ n, ...r, previewFile });
    }
  }
  writeJson(path.join(dir, "candidates.json"), { id: card.id, need: card.need, queries: card.queries, items });
  if (!items.length) { log(`${card.id}: nothing found for ${JSON.stringify(card.queries)} — rewrite the queries (filmable terms), or make it a viz card`); manualHint(card); return null; }
  const sheet = await contactSheet(path.join(dir, "sheet.jpg"), items.map((it) => ({ previewFile: it.previewFile, label: sheetLabel(it), contain: it.provider === "library" && it.kind === "video" })));
  const src = libCount && !online ? `${libCount} from the library (online skipped; add --online if none fit)`
    : `${libCount} library + ${items.length - libCount} online`;
  log(`${card.id}: ${items.length} candidates, ${src} -> ${sheet}`);
  if (items.every((it) => it.provider !== "library" && it.relevance === 0)) manualHint(card);
  return sheet;
}

async function pick(proj, id, n, { as } = {}) {
  const dir = path.join(proj, "work/media", id);
  const cands = readJson(path.join(dir, "candidates.json"));
  if (!cands) throw new Error(`no candidates for ${id}; search first`);
  const it = cands.items.find((x) => x.n === Number(n));
  if (!it) throw new Error(`${id} has no candidate ${n}`);
  let raw = it.url;
  if (!it.local) {
    raw = path.join(dir, `full_${n}${extOf(it.url, it.kind)}`);
    log(`downloading ${it.provider} ${it.kind} ${it.url}`);
    await download(it.url, raw);
  }
  const media = path.join(proj, "assets/media");
  fs.mkdirSync(media, { recursive: true });
  const name = as || id; // --as: several picks for one card (e.g. both robots of a compose card)
  for (const old of fs.readdirSync(media).filter((f) => f.startsWith(`${name}.`))) fs.rmSync(path.join(media, old));
  let dest;
  if (it.kind === "video") {
    // H.264 CFR with a keyframe every second so HyperFrames can seek; no audio (cards are muted).
    // Stock is cut to 30 s; library clips stay whole (pick the moment with the card's mediaStart).
    dest = path.join(media, `${name}.mp4`);
    await ffmpeg(["-i", raw, ...(it.local ? [] : ["-t", "30"]), "-an", "-vf", "scale='min(1920,iw)':-2,fps=30", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "20", "-g", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest]);
  } else {
    dest = path.join(media, `${name}.jpg`);
    await ffmpeg(["-i", raw, "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2", "-q:v", "2", dest]);
  }
  const rel = path.relative(proj, dest);
  const credits = readJson(path.join(media, "CREDITS.json"), {});
  credits[name] = { file: rel, card: id, provider: it.provider, title: it.title, author: it.author, license: it.license,
    licenseUrl: it.licenseUrl, page: it.page, attributionRequired: !!it.attribution, attributionText: it.attributionText || null };
  writeJson(path.join(media, "CREDITS.json"), credits);
  const lines = Object.entries(credits).filter(([, c]) => c.attributionRequired)
    .map(([, c]) => c.attributionText || `${c.title} by ${c.author} (${c.license}) ${c.page}`);
  fs.writeFileSync(path.join(media, "CREDITS.txt"), lines.length ? `Media credits\n${lines.join("\n")}\n` : "No attribution required.\n");
  const info = it.kind === "video" ? ` ${(await probe(dest)).duration.toFixed(1)}s` : "";
  log(`${name} <- ${id} #${n} (${it.provider}, ${it.license}${it.attribution ? ", attribution required" : ""}) -> ${rel}${info}`);
  return rel;
}

async function main() {
  const args = parseArgs();
  const proj = path.resolve(ROOT, args._[0] || "");
  if (!args._[0] || !fs.existsSync(proj)) throw new NeedsInput(`no project ${args._[0] || ""} — usage: find-media.mjs <project> [--card id] [--pick id n]. Ask the user which video it is for.`);
  if (args.pick) return pick(proj, args.pick, args._[1], { as: args.as });

  const qfile = path.join(proj, "media_queries.json");
  let cards = readJson(qfile, []);
  if (args.card && args.q) {
    const card = { id: args.card, queries: [args.q, args.q2, args.q3].filter(Boolean), kind: args.kind || "any", need: args.need };
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
  for (const c of todo) await searchCard(proj, c, { perProvider: Number(args.per || 4), online: !!args.online });
}

main().catch(exitOnError);
