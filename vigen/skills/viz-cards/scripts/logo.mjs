#!/usr/bin/env node
// Brand logos for viz cards, from Simple Icons (CC0 SVG paths; the marks themselves stay trademarks of
// their owners — fine for naming/commenting on a product, never imply endorsement).
//
//   node <skill>/scripts/logo.mjs <project> openai claude googlegemini perplexity
//   node <skill>/scripts/logo.mjs <project> claude --color white       brand (default) | white | black | #hex
//   node <skill>/scripts/logo.mjs --find "gemini"                           look up slugs by brand name
//
// Writes assets/media/logos/<slug>.svg (filled with the colour) and records it in assets/media/CREDITS.json.
// Not in Simple Icons (e.g. Midjourney, Copilot, DeepSeek)? Search Wikimedia for the official mark:
//   find-media.mjs <project> --card <id> --q "<Brand> logo" --kind image   (logos there are often PD)
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, NeedsInput, exitOnError } from "./lib/util.mjs";

const VER = "15.0.0";
const CDN = `https://cdn.jsdelivr.net/npm/simple-icons@${VER}`;
const UA = { "User-Agent": "video-skills/1.0 (logo fetch)" };

// Simple Icons slug rule (the common cases): lowercase title, "+"→plus, "."→dot, "&"→and, drop the rest.
const slugOf = (title) => title.toLowerCase().replace(/\+/g, "plus").replace(/^\./, "dot-").replace(/\./g, "dot")
  .replace(/&/g, "and").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

let dataCache;
async function brands() {
  if (dataCache) return dataCache;
  const r = await fetch(`${CDN}/data/simple-icons.json`, { headers: UA });
  if (!r.ok) throw new Error(`simple-icons data HTTP ${r.status}`);
  const j = await r.json();
  const list = Array.isArray(j) ? j : j.icons;
  dataCache = new Map(list.map((x) => [x.slug || slugOf(x.title), x]));
  return dataCache;
}

async function main() {
  const args = parseArgs();
  if (args.find) {
    const q = slugOf(String(args.find));
    const hits = [...(await brands()).entries()].filter(([s, x]) => s.includes(q) || slugOf(x.title).includes(q)).slice(0, 20);
    if (!hits.length) return log(`no Simple Icons brand matches "${args.find}" — search Wikimedia for "<brand> logo" instead`);
    for (const [s, x] of hits) console.log(`${s.padEnd(22)} ${x.title}  #${x.hex}`);
    return;
  }
  const [projArg, ...slugs] = args._;
  const proj = path.resolve(ROOT, projArg || "");
  if (!projArg || !fs.existsSync(proj)) throw new NeedsInput(`which video? usage: logo.mjs <project> <brand-slug>… [--color brand|white|black|#hex]`);
  if (!slugs.length) throw new Error("name at least one brand slug (find them with --find <name>)");
  const data = await brands();
  const outDir = path.join(proj, "assets/media/logos");
  fs.mkdirSync(outDir, { recursive: true });
  const credits = readJson(path.join(proj, "assets/media/CREDITS.json"), {});
  for (const slug of slugs) {
    const meta = data.get(slug);
    const r = await fetch(`${CDN}/icons/${slug}.svg`, { headers: UA });
    if (!r.ok || !meta) {
      log(`  ! ${slug}: not in Simple Icons — search Wikimedia: find-media.mjs ${projArg} --card <id> --q "${slug} logo" --kind image`);
      continue;
    }
    const color = !args.color || args.color === "brand" ? `#${meta.hex}` : args.color === "white" ? "#ffffff" : args.color === "black" ? "#000000" : args.color;
    const svg = (await r.text()).replace("<svg ", `<svg fill="${color}" `);
    const file = path.join(outDir, `${slug}.svg`);
    fs.writeFileSync(file, svg);
    const rel = path.relative(proj, file);
    credits[`logo:${slug}`] = { file: rel, provider: "simple-icons", title: `${meta.title} logo`, author: meta.source || null,
      license: "CC0 (icon data); trademark of its owner", licenseUrl: "https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md",
      page: meta.guidelines || meta.source || null, attributionRequired: false, attributionText: null };
    log(`${meta.title} -> ${rel} (${color})`);
  }
  writeJson(path.join(proj, "assets/media/CREDITS.json"), credits);
}

main().catch(exitOnError);
