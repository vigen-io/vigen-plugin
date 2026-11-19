// Press-kit media: product photos and B-roll from a brand's own newsroom / press page, licensed for
// EDITORIAL use (news, reviews, rankings, commentary about the product) — never for ads or sponsored posts.
// No search API exists for these sites: the card names the pages (found by the agent on the brand's official
// newsroom), and every image / video on them is offered as a candidate.
//   card: { "id": "galaxy", "need": "…", "press": ["https://news.samsung.com/global/…"],
//           "pressTerms": "https://…/terms-of-use", "kind": "image" }
// A result has the same shape as a stock result (lib/stock.mjs) with license "Editorial use (press kit)",
// editorial: true and the terms page in licenseUrl.
import fs from "node:fs";
import path from "node:path";
import { run } from "./util.mjs";

const UA = "Mozilla/5.0 (compatible; vigen-media/1.0)";
const IMG = /\.(jpe?g|png|webp)(\?|#|$)/i, VID = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;
// page furniture, not product shots
const JUNK = /(logo|icon|sprite|avatar|favicon|badge|banner-ad|placeholder|spacer|pixel|share|social|flag)/i;

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');

// every image / video URL a press page links or shows, largest variant first where a srcset lists several
function mediaUrls(html, base) {
  const found = [];
  const add = (u, kind) => {
    if (!u || u.startsWith("data:")) return;
    try { found.push({ url: new URL(decode(u.trim()), base).href, kind }); } catch { /* not a URL */ }
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/gi))
    add(m[0].match(/content=["']([^"']+)/i)?.[1], "image");
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:video(?::url)?["'][^>]*>/gi))
    add(m[0].match(/content=["']([^"']+)/i)?.[1], "video");
  for (const m of html.matchAll(/(?:srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const best = m[1].split(",").map((s) => s.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseFloat(w) || 0 })).sort((a, b) => b.w - a.w)[0];
    add(best?.u, "image");
  }
  for (const m of html.matchAll(/<img[^>]+?(?:data-src|data-original|src)=["']([^"']+)["']/gi)) add(m[1], "image");
  for (const m of html.matchAll(/<(?:video|source)[^>]+?src=["']([^"']+)["']/gi)) add(m[1], VID.test(m[1]) ? "video" : "image");
  // download links ("Download high-res") usually point at the full-size file
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (IMG.test(m[1])) add(m[1], "image"); else if (VID.test(m[1])) add(m[1], "video");
  }
  // one photo is often listed at several sizes (x.jpg.large.jpg / x.jpg.large_2x.jpg, x-800x600.jpg, x@2x.jpg):
  // keep the biggest-looking variant of each, in page order
  const SIZE = /(?:[._@-](?:x?large|medium|small|thumb(?:nail)?|\d?x|\d{2,4}w|\d{2,4}x\d{2,4}|2x|3x))+(?=[._-]|$)/gi;
  const stem = (u) => u.replace(/[?#].*$/, "").split("/").pop().toLowerCase().replace(/\.(jpe?g|png|webp|mp4|mov|m4v|webm)/g, "").replace(SIZE, "");
  // size word (xlarge > large > plain > medium > small) × density (3x, 2x), then the biggest number in the name
  const big = (u) => { const n = u.replace(/[?#].*$/, "").split("/").pop().toLowerCase();
    const word = /xlarge/.test(n) ? 5 : /large/.test(n) ? 4 : /medium/.test(n) ? 2 : /small|thumb/.test(n) ? 1 : 3;
    const dens = /3x/.test(n) ? 3 : /2x/.test(n) ? 2 : 1;
    return word * dens * 1e5 + Math.max(0, ...(n.match(/\d{3,4}(?=w|x\d|\.|_|-|$)/g) || []).map(Number)); };
  const best = new Map();
  for (const f of found) {
    const name = f.url.replace(/[?#].*$/, "").split("/").pop();
    if (JUNK.test(name) || /\.(svg|gif)$/i.test(name)) continue;
    if (f.kind === "image" && !IMG.test(f.url) && !/image|img|media|photo|asset/i.test(f.url)) continue;
    const k = `${f.kind}:${stem(f.url)}`, had = best.get(k);
    if (!had || big(f.url) > big(had.url)) best.set(k, had ? { ...f, order: had.order } : { ...f, order: best.size });
  }
  return [...best.values()].sort((a, b) => a.order - b.order);
}

async function size(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { allowFail: true });
  const [w, h] = (stdout || "").trim().split(",").map(Number);
  return { width: w || 0, height: h || 0 };
}

// candidates from the card's press pages; previews land in dir (p_press_NN.*). kind: image | video | any
export async function searchPress(card, dir, { max = 24 } = {}) {
  const out = [], errors = [];
  for (const page of [].concat(card.press || [])) {
    let html;
    try {
      const r = await fetch(page, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (e) { errors.push(`press ${page}: ${e.message}`); continue; }
    const host = new URL(page).hostname.replace(/^www\./, "");
    const title = (html.match(/<title[^>]*>([^<]*)/i)?.[1] || host).trim().replace(/\s+/g, " ");
    const urls = mediaUrls(html, page).filter((m) => (card.kind || "any") === "any" || m.kind === card.kind);
    for (const m of urls) {
      if (out.length >= max) break;
      const n = String(out.length + 1).padStart(2, "0");
      const previewFile = path.join(dir, `p_press_${n}.jpg`);
      try {
        // an image: fetch it whole (also measures it); a video: one frame from 1 s in, read over the network
        if (m.kind === "image") {
          const raw = path.join(dir, `press_${n}${path.extname(new URL(m.url).pathname) || ".jpg"}`);
          const r = await fetch(m.url, { headers: { "User-Agent": UA, Referer: page }, signal: AbortSignal.timeout(60_000) });
          if (!r.ok) continue;
          fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
          const s = await size(raw);
          if (s.width < 900 || s.width / Math.max(s.height, 1) < 0.5) { fs.rmSync(raw); continue; }   // thumbnails, tall strips
          await run("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", raw, "-frames:v", "1", "-vf", "scale=480:-2", previewFile]);
          out.push({ provider: `press/${host}`, kind: "image", title, author: host, license: "Editorial use (press kit)",
            licenseUrl: card.pressTerms || page, page, attribution: true, editorial: true,
            attributionText: `Image: ${host} press kit (${page}), editorial use`, url: m.url, width: s.width, height: s.height, relevance: 1, previewFile });
        } else {
          await run("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-user_agent", UA, "-ss", "1", "-i", m.url, "-frames:v", "1", "-vf", "scale=480:-2", previewFile]);
          const s = await size(previewFile);
          if (!s.width) continue;
          out.push({ provider: `press/${host}`, kind: "video", title, author: host, license: "Editorial use (press kit)",
            licenseUrl: card.pressTerms || page, page, attribution: true, editorial: true,
            attributionText: `Video: ${host} press kit (${page}), editorial use`, url: m.url, relevance: 1, previewFile });
        }
      } catch { /* a file that won't load is skipped */ }
    }
    if (!urls.length) errors.push(`press ${page}: no images or videos found in the page's HTML (a script-built page: link the image files or the press-kit download page instead)`);
  }
  return { results: out, errors };
}
