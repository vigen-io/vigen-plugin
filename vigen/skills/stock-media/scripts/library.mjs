#!/usr/bin/env node
// The user's visuals library (<workspace>/library/). Searched before any online source.
//
//   node <skill>/scripts/library.mjs scan                 index new/changed files; sheets of unlabelled items
//   node <skill>/scripts/library.mjs label L0003 --desc "…" --tags "a, b, c"
//   node <skill>/scripts/library.mjs label --json labels.json   [{ "id": "L0003", "desc": "…", "tags": ["…"] }, …]
//   node <skill>/scripts/library.mjs search "query" ["query 2" …] [--kind image|video]
//   node <skill>/scripts/library.mjs list [--unlabeled]
//
// Labelling (the agent's job): open each unlabelled sheet, and for every id write
//   desc: one plain sentence of what is visibly shown (subject, action, setting, style: photo/screenshot/
//         illustration/screen recording; for videos what happens across the 4 frames, read left-right, top-bottom)
//   tags: 5–12 short tags, English AND Vietnamese for the key subject ("sheep", "cừu"), brand/product names,
//         and the kind of shot ("close-up", "screen recording", "logo").
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, NeedsInput, exitOnError } from "./lib/util.mjs";
import { LIB_DIR, scanLibrary, loadIndex, saveIndex, isLabeled, thumbOf, searchLibrary, libraryExists } from "./lib/library.mjs";
import { contactSheet } from "./lib/sheet.mjs";

const SHEET_DIR = path.join(LIB_DIR, ".thumbs");
const PER_SHEET = 12;

const label = (rel, it) => `${it.id} ${it.kind}${it.duration ? ` ${Math.round(it.duration)}s` : ""} ${path.basename(rel)}`;

async function unlabeledSheets(idx) {
  const todo = Object.entries(idx.items).filter(([, it]) => !isLabeled(it));
  for (const f of fs.existsSync(SHEET_DIR) ? fs.readdirSync(SHEET_DIR).filter((f) => f.startsWith("unlabeled-")) : []) fs.rmSync(path.join(SHEET_DIR, f));
  const sheets = [];
  for (let i = 0; i < todo.length; i += PER_SHEET) {
    const chunk = todo.slice(i, i + PER_SHEET);
    const out = path.join(SHEET_DIR, `unlabeled-${sheets.length + 1}.jpg`);
    await contactSheet(out, chunk.map(([rel, it]) => ({ previewFile: thumbOf(it), label: label(rel, it), contain: true })));
    sheets.push({ sheet: out, items: chunk.map(([rel, it]) => ({ id: it.id, path: path.join("library", rel), kind: it.kind, duration: it.duration })) });
  }
  return sheets;
}

async function main() {
  const args = parseArgs();
  const sub = args._[0];
  if (!libraryExists())
    throw new NeedsInput(`there is no library/ folder in ${ROOT}. It is optional: the user can drop their own images/videos into library/ (any subfolders) and they are searched before online stock.`);

  if (sub === "scan" || !sub) {
    const { idx, added, changed, removed } = await scanLibrary();
    const total = Object.keys(idx.items).length;
    log(`library: ${total} item(s); ${added.length} new, ${changed.length} changed, ${removed.length} removed`);
    const sheets = await unlabeledSheets(idx);
    if (!sheets.length) return log("every item is labelled");
    log(`${sheets.reduce((n, s) => n + s.items.length, 0)} unlabelled — open each sheet, then write labels (see the header of this script):`);
    for (const s of sheets) {
      console.log(`  sheet ${s.sheet}`);
      for (const it of s.items) console.log(`    ${it.id}  ${it.kind}${it.duration ? ` ${it.duration}s` : ""}  ${it.path}`);
    }
    return;
  }

  if (sub === "label") {
    const idx = loadIndex();
    const byId = new Map(Object.entries(idx.items).map(([rel, it]) => [it.id, rel]));
    let labels;
    if (args.json) {
      const j = readJson(path.resolve(ROOT, args.json));
      labels = Array.isArray(j) ? j : Object.entries(j).map(([id, v]) => ({ id, ...v }));
    } else labels = [{ id: args._[1], desc: args.desc, tags: args.tags }];
    let n = 0;
    for (const l of labels) {
      const rel = byId.get(l.id) || (idx.items[l.id] ? l.id : null);
      if (!rel) { log(`  ! unknown id ${l.id}`); continue; }
      const tags = (Array.isArray(l.tags) ? l.tags : String(l.tags || "").split(",")).map((t) => t.trim()).filter(Boolean);
      if (!l.desc || !tags.length) { log(`  ! ${l.id}: needs both desc and tags`); continue; }
      Object.assign(idx.items[rel], { desc: String(l.desc).trim(), tags, labeledAt: new Date().toISOString() });
      n++;
    }
    saveIndex(idx);
    const left = Object.values(idx.items).filter((it) => !isLabeled(it)).length;
    return log(`labelled ${n}; ${left} still unlabelled`);
  }

  if (sub === "search") {
    const queries = args._.slice(1);
    if (!queries.length) throw new Error('usage: library.mjs search "query" ["query 2" …] [--kind image|video]');
    const hits = searchLibrary(queries, { kind: args.kind || "any", minScore: 0.01 });
    if (!hits.length) return log("no labelled item matches");
    for (const h of hits) console.log(`${h.score.toFixed(2)}  ${h.id}  ${h.kind}  library/${h.rel}  — ${h.desc}  [${h.tags.join(", ")}]`);
    return;
  }

  if (sub === "list") {
    for (const [rel, it] of Object.entries(loadIndex().items)) {
      if (args.unlabeled && isLabeled(it)) continue;
      console.log(`${it.id}  ${it.kind}${it.duration ? ` ${it.duration}s` : ""}  library/${rel}  ${isLabeled(it) ? `— ${it.desc}` : "(unlabelled)"}`);
    }
    return;
  }
  throw new Error(`unknown command ${sub}: scan | label | search | list`);
}

main().catch(exitOnError);
