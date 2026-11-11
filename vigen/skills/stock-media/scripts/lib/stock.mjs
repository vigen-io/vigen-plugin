// Free stock search for card media. Every provider returns only media that may be used commercially.
//   pexels    photos + videos, Pexels license (free, commercial, no attribution)     PEXELS_API_KEY
//   pixabay   photos + videos, Pixabay content license (same)                         PIXABAY_API_KEY
//   openverse CC images (Flickr, museums, …) filtered to license_type=commercial      no key
//   wikimedia Commons images + videos, CC0/PD/CC BY/CC BY-SA only                     no key
// Not here on purpose: YouTube/yt-dlp (copyright risk), Unsplash (image-only, attribution rules),
// Destockd (robots.txt disallows /api/ — the user can download its public-domain shots into library/).
// A result: { provider, kind: image|video, title, author, license, licenseUrl, page, attribution,
//             preview (small image for the contact sheet), url (full file), width, height, duration, relevance }
// Search options (from a card in media_queries.json):
//   pd: true      -> also search Commons for US-federal-government works (public domain, no attribution)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnv, ROOT } from "./util.mjs";
import { tokens } from "./library.mjs";

const UA = "video-skills/1.0 (card media search; https://github.com)";
const strip = (html = "") => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function getJson(url, headers = {}, timeout = 20_000) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(timeout) });
    // 429 = rate limit or a Cloudflare bot challenge (Pixabay: intermittent, ~3 in 4 calls from some IPs); retries get through.
    if (r.status === 429 && attempt < 8) { await new Promise((ok) => setTimeout(ok, 1500 + 1000 * attempt)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.json();
  }
}

async function pexels(q, kind, n, opt = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const h = { Authorization: key };
  const out = [];
  if (kind !== "video") {
    const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=landscape&per_page=${n}`, h);
    for (const p of j.photos || [])
      out.push({ provider: "pexels", kind: "image", title: p.alt || q, author: p.photographer, license: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/", page: p.url, attribution: false,
        preview: p.src.medium, url: p.src.large2x || p.src.original, width: p.width, height: p.height });
  }
  if (kind !== "image") {
    const j = await getJson(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=landscape&per_page=${n}`, h);
    for (const v of j.videos || []) {
      const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && f.width >= 1280).sort((a, b) => a.width - b.width);
      // Pexels has changed its file-URL format before; the id-based download URL keeps working.
      const f = files.find((x) => x.width >= 1920) || files.at(-1) || { link: `https://www.pexels.com/video/${v.id}/download/`, width: v.width, height: v.height };
      out.push({ provider: "pexels", kind: "video", title: v.url.split("/").filter(Boolean).pop().replace(/-\d+$/, "").replace(/-/g, " "), author: v.user?.name,
        license: "Pexels License", licenseUrl: "https://www.pexels.com/license/", page: v.url, attribution: false,
        preview: v.image, url: f.link, width: f.width, height: f.height, duration: v.duration });
    }
  }
  return out;
}

// Pixabay sits behind Cloudflare, which answers bursts with a 429 challenge page: keep ≥ 1.5 s between calls.
let pixabayNext = 0;
async function pixabayJson(url) {
  const wait = pixabayNext - Date.now();
  pixabayNext = Math.max(Date.now(), pixabayNext) + 1500;
  if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
  return getJson(url);
}

async function pixabay(q, kind, n, opt = {}) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const per = Math.max(3, n);
  const out = [];
  if (kind !== "video") {
    const j = await pixabayJson(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&safesearch=true&per_page=${per}` + "&image_type=photo&orientation=horizontal");
    for (const p of j.hits || [])
      out.push({ provider: "pixabay", kind: "image", title: p.tags, author: p.user, license: "Pixabay Content License",
        licenseUrl: "https://pixabay.com/service/license-summary/", page: p.pageURL, attribution: false,
        preview: p.webformatURL, url: p.largeImageURL, width: p.imageWidth, height: p.imageHeight });
  }
  if (kind !== "image") {
    const j = await pixabayJson(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q)}&safesearch=true&per_page=${per}`);
    for (const v of j.hits || []) {
      const f = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
      if (!f?.url || f.width < f.height) continue;
      out.push({ provider: "pixabay", kind: "video", title: v.tags, author: v.user, license: "Pixabay Content License",
        licenseUrl: "https://pixabay.com/service/license-summary/", page: v.pageURL, attribution: false,
        preview: f.thumbnail || v.videos?.medium?.thumbnail, url: f.url, width: f.width, height: f.height, duration: v.duration });
    }
  }
  return out;
}

async function openverse(q, kind, n, opt = {}) {
  if (kind === "video") return [];
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial&aspect_ratio=wide&mature=false&page_size=${n}`);
  return (j.results || []).map((p) => ({
    provider: `openverse/${p.source || p.provider}`, kind: "image", title: p.title || q, author: p.creator,
    license: `${String(p.license).toUpperCase()} ${p.license_version || ""}`.trim(), licenseUrl: p.license_url,
    page: p.foreign_landing_url, attribution: !/^(cc0|pdm)$/i.test(p.license), attributionText: p.attribution,
    preview: p.thumbnail || p.url, url: p.url, width: p.width, height: p.height,
  }));
}

// Commons licenses we accept: public domain, CC0, CC BY, CC BY-SA. Everything else (NC, ND, fair use) is dropped.
const COMMONS_OK = /^(cc0|pd|public domain|cc[- ]by(-sa)?([- ][\d.]+)?)/i;

async function wikimedia(q, kind, n, opt = {}) {
  const kinds = kind === "any" ? ["image", "video"] : [kind];
  const passes = kinds.flatMap((k) => [{ k, extra: "" }, ...(opt.pd ? [{ k, extra: ' hastemplate:"PD-USGov"' }] : [])]);
  const out = [];
  for (const { k, extra } of passes) {
    const search = `${q} filetype:${k === "video" ? "video" : "bitmap"}${extra}`;
    const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6" +
      `&gsrlimit=${Math.min(50, n * 3)}&gsrsearch=${encodeURIComponent(search)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280`;
    const j = await getJson(u);
    const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata || {};
      const lic = strip(m.LicenseShortName?.value) || strip(m.License?.value);
      if (!COMMONS_OK.test(lic) || /\bnc\b|\bnd\b|non-?free|fair use/i.test(lic)) continue;
      const author = strip(m.Artist?.value) || "Wikimedia Commons";
      out.push({
        provider: "wikimedia", kind: k, title: p.title.replace(/^File:/, ""), author, license: lic,
        licenseUrl: strip(m.LicenseUrl?.value) || null, page: ii.descriptionurl,
        attribution: !/^(cc0|pd|public domain)/i.test(lic),
        attributionText: `"${p.title.replace(/^File:/, "")}" by ${author}, ${lic}, via Wikimedia Commons`,
        preview: ii.thumburl || ii.url, url: k === "image" ? (ii.width > 2400 ? ii.thumburl : ii.url) : ii.url,
        width: ii.width, height: ii.height, duration: ii.duration,
      });
    }
  }
  return out;
}

export const PROVIDERS = { pexels, pixabay, openverse, wikimedia };

// ── 24 h result cache (fewer calls = fewer rate limits / bot challenges; same query, same candidates) ──
const CACHE_DIR = path.join(ROOT, ".cache", "stock");
const CACHE_MS = 24 * 3600_000;
async function cached(name, q, kind, n, opt) {
  const key = crypto.createHash("sha1").update(JSON.stringify([name, q, kind, n, opt.pd || false])).digest("hex");
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - c.t < CACHE_MS) return c.results;
  } catch { /* miss */ }
  const results = await PROVIDERS[name](q, kind, n, opt);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ t: Date.now(), q, name, results }));
  return results;
}

/** Share of the card's query words found in a result's title/tags (0–1). Low = probably off-topic. */
function relevance(r, words) {
  if (!words.size) return 0;
  const have = new Set(tokens(`${r.title || ""} ${r.page || ""}`));
  let hit = 0;
  for (const w of words) if (have.has(w)) hit++;
  return +(hit / words.size).toFixed(2);
}

/** Which providers can run now (keyed ones only with their key). */
export function activeProviders() {
  loadEnv();
  return Object.keys(PROVIDERS).filter((p) => (p === "pexels" ? process.env.PEXELS_API_KEY : p === "pixabay" ? process.env.PIXABAY_API_KEY : true));
}

/**
 * Search all active providers for each query; drop small/portrait media and duplicates.
 * kind: image | video | any. perProvider: results kept per provider per query.
 */
// A provider that times out or returns 5xx is skipped for the rest of the process.
const down = new Set();

export async function searchStock(queries, { kind = "any", perProvider = 4, providers = activeProviders(), minWidth = 900, pd = false, need = "" } = {}) {
  const opt = { pd };
  const words = new Set(tokens([...queries, need].join(" ")));
  const seen = new Set();
  const out = [];
  const errors = [];
  for (const q of queries) {
    const batches = await Promise.all(providers.filter((p) => !down.has(p)).map((name) =>
      cached(name, q, kind, perProvider * 2, opt).catch((e) => {
        errors.push(`${name} "${q}": ${e.message}`);
        if (/timeout|aborted|HTTP 5\d\d/i.test(e.message)) down.add(name);
        return [];
      })));
    for (const batch of batches) {
      const kept = { image: 0, video: 0 }; // cap per kind, so images never crowd out videos
      for (const r of batch) {
        if (kept[r.kind] >= perProvider) continue;
        if (!r.url || seen.has(r.url)) continue;
        if (r.width && r.height && (r.width < minWidth || r.width / r.height < 1.15)) continue;
        if (r.kind === "video" && r.duration > 120) continue; // long films: too heavy for a 2–6 s card
        seen.add(r.url);
        out.push({ ...r, query: q, relevance: relevance(r, words) });
        kept[r.kind]++;
      }
    }
  }
  // Best title/tag match first (fan-out order kept among equals), so the sheet reads best-first.
  out.sort((a, b) => b.relevance - a.relevance);
  return { results: out, errors };
}
