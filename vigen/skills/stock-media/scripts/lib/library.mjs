// The user's own visuals library: <workspace>/library/ (any subfolders) of images and videos.
// Index: library/library.json  { items: { "<relative path>": { id, kind, width, height, duration, size,
//                                 mtimeMs, desc, tags[], labeledAt } } }
// Previews: library/.thumbs/<id>.jpg (videos: 4 frames in a 2×2 grid, so the label covers the whole clip).
// Items are labelled by the agent (it looks at the sheets and writes desc + tags); search matches card
// queries against those labels, so unlabelled items are invisible to search.
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, writeJson, ffmpeg, probe } from "./util.mjs";

export const LIB_DIR = path.join(ROOT, "library");
const INDEX = path.join(LIB_DIR, "library.json");
const THUMBS = path.join(LIB_DIR, ".thumbs");
export const LIB_IMAGE = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"];
export const LIB_VIDEO = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];

export const libraryExists = () => fs.existsSync(LIB_DIR);
export const loadIndex = () => readJson(INDEX, { version: 1, items: {} });
export const saveIndex = (idx) => writeJson(INDEX, idx);
export const isLabeled = (it) => !!(it.desc && it.tags?.length);
export const thumbOf = (it) => path.join(THUMBS, `${it.id}.jpg`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if ([...LIB_IMAGE, ...LIB_VIDEO].includes(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

async function makeThumb(file, it) {
  fs.mkdirSync(THUMBS, { recursive: true });
  const out = thumbOf(it);
  if (it.kind === "image") {
    await ffmpeg(["-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out]);
  } else {
    // four frames (10/37/63/90 %) in a 2×2 grid: one picture of what the clip shows over time
    const d = it.duration || 1;
    const at = [0.1, 0.37, 0.63, 0.9];
    const parts = at.map((_, i) => `${out}.${i}.jpg`);
    for (const [i, f] of at.entries())
      await ffmpeg(["-ss", (d * f).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180", parts[i]]);
    await ffmpeg([...parts.flatMap((p) => ["-i", p]), "-filter_complex", "xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0", "-q:v", "4", out]);
    for (const p of parts) fs.rmSync(p, { force: true });
  }
  return out;
}

/**
 * Sync the index with the folder: add new files (unlabelled), refresh changed ones, drop deleted ones.
 * Returns { idx, added, changed, removed }.
 */
export async function scanLibrary() {
  const idx = loadIndex();
  if (!libraryExists()) return { idx, added: [], changed: [], removed: [] };
  const files = walk(LIB_DIR);
  const seen = new Set();
  const added = [], changed = [];
  let next = Math.max(0, ...Object.values(idx.items).map((it) => Number(String(it.id).slice(1)) || 0)) + 1;
  for (const f of files) {
    const rel = path.relative(LIB_DIR, f);
    seen.add(rel);
    const st = fs.statSync(f);
    const prev = idx.items[rel];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && fs.existsSync(thumbOf(prev))) continue;
    const kind = LIB_VIDEO.includes(path.extname(f).toLowerCase()) ? "video" : "image";
    let meta = {};
    try {
      const p = await probe(f);
      meta = { width: p.video?.width, height: p.video?.height, duration: kind === "video" ? +p.duration.toFixed(2) : undefined };
    } catch { /* unreadable: still indexed so the agent sees it */ }
    // A changed file keeps its id but loses its labels only if the content changed (size/mtime).
    const contentChanged = prev && (prev.size !== st.size || prev.mtimeMs !== st.mtimeMs);
    const it = { ...(prev || {}), id: prev?.id || `L${String(next++).padStart(4, "0")}`, kind, ...meta, size: st.size, mtimeMs: st.mtimeMs };
    if (contentChanged) { delete it.desc; delete it.tags; delete it.labeledAt; }
    try { await makeThumb(f, it); } catch { /* sheet shows "no preview" */ }
    idx.items[rel] = it;
    (prev ? changed : added).push(rel);
  }
  const removed = Object.keys(idx.items).filter((rel) => !seen.has(rel));
  for (const rel of removed) { fs.rmSync(thumbOf(idx.items[rel]), { force: true }); delete idx.items[rel]; }
  saveIndex(idx);
  return { idx, added, changed, removed };
}

export function libraryStats() {
  if (!libraryExists()) return { exists: false, items: 0, labeled: 0, unlabeled: 0, images: 0, videos: 0 };
  const items = Object.values(loadIndex().items);
  const onDisk = walk(LIB_DIR).length;
  const labeled = items.filter(isLabeled).length;
  return { exists: true, items: onDisk, indexed: items.length, labeled, unlabeled: onDisk - labeled,
    images: walk(LIB_DIR).filter((f) => LIB_IMAGE.includes(path.extname(f).toLowerCase())).length,
    videos: walk(LIB_DIR).filter((f) => LIB_VIDEO.includes(path.extname(f).toLowerCase())).length };
}

// ── search ──────────────────────────────────────────────────────────────────
const STOP = new Set("a an the of and or to in on at for with by from is are be this that it its as into over under very".split(" ")
  .concat("va cua la mot nhung cac cho voi tren trong duoi nay do thi ma".split(" ")));

/** lowercase, no diacritics (Vietnamese-safe), crude plural strip; drops stopwords and 1-letter tokens. */
export function tokens(s = "") {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("es") ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/**
 * Score every labelled item against the card's queries (and its `need` sentence).
 * Per query: matched-token weight / query tokens (tags ×1, desc ×0.7, filename ×0.5), plus a bonus when a
 * whole tag phrase appears in the query. Card score = best query. Returns matches ≥ minScore, best first.
 */
export function searchLibrary(queries, { kind = "any", need, minScore = 0.34, limit = 12 } = {}) {
  if (!libraryExists()) return [];
  const idx = loadIndex();
  const qs = [...queries, ...(need ? [need] : [])].map((q) => ({ q, t: [...new Set(tokens(q))] })).filter((x) => x.t.length);
  const out = [];
  for (const [rel, it] of Object.entries(idx.items)) {
    if (!isLabeled(it) || (kind !== "any" && it.kind !== kind)) continue;
    const tagTok = new Set(it.tags.flatMap((t) => tokens(t)));
    const descTok = new Set(tokens(it.desc));
    const nameTok = new Set(tokens(path.basename(rel, path.extname(rel))));
    let best = 0, bestQ = null;
    for (const { q, t } of qs) {
      let w = 0;
      for (const tok of t) w += tagTok.has(tok) ? 1 : descTok.has(tok) ? 0.7 : nameTok.has(tok) ? 0.5 : 0;
      let s = w / t.length;
      const qn = tokens(q).join(" ");
      if (it.tags.some((tag) => { const tn = tokens(tag).join(" "); return tn.includes(" ") && qn.includes(tn); })) s += 0.25;
      if (s > best) (best = s), (bestQ = q);
    }
    if (best >= minScore) out.push({ rel, ...it, score: +best.toFixed(2), query: bestQ });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
