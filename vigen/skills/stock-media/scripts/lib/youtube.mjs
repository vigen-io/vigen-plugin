// YouTube videos licensed Creative Commons Attribution (CC BY 3.0, "reuse allowed"), via yt-dlp.
// Searched for every card (find-media.mjs) unless the card has "youtube": false. Every result's license is re-read from the video's own page
// (the search filter alone is not trusted). Two risks the license can't remove, both left to the agent:
//   - re-uploads: CC BY is only valid from the person who made the footage. Check the channel (pick needs
//     --owner-ok); flags below mark the usual suspects.
//   - other people's footage inside a CC video (a reviewer cutting in a brand ad): peek at the frames and
//     take a section the channel filmed itself.
// YouTube's terms allow reuse of CC videos through its own editor; downloading them is a grey area (SKILL.md
// says how to tell the user). Needs yt-dlp (brew install yt-dlp).
import fs from "node:fs";
import path from "node:path";
import { run } from "./util.mjs";
import { tokens } from "./library.mjs";

const CC_FILTER = "EgIwAQ%3D%3D";   // YouTube search filter: Features → Creative Commons
const yt = (args, opts) => run("yt-dlp", ["--no-update", "--no-warnings", ...args], { allowFail: true, ...opts });
export const CC_BY = { license: "CC BY 3.0 (YouTube Creative Commons)", licenseUrl: "https://creativecommons.org/licenses/by/3.0/legalcode" };

// title / channel words that usually mean someone else's footage
const SUSPECT = [
  [/re-?upload|reup|not my (video|footage)|credit(s)? to|all rights (go|belong)/i, "says it's someone else's"],
  [/compilation|best of|top \d+ (ads|commercials)/i, "compilation"],
  [/\b(official )?(tv )?(ad|commercial|trailer|teaser|keynote|event)\b/i, "ad / trailer / keynote: the brand's footage"],
  [/full (movie|episode|match)|\bep(isode)?\.? ?\d+\b/i, "programme footage"],
  [/tiktok|#shorts|reels?\b/i, "re-posted short"],
];

export async function hasYtDlp() { return (await yt(["--version"])).code === 0; }

/** candidates for a card: { results, errors }. Previews (thumbnails) land in dir. */
export async function searchYouTube(card, dir, { perQuery = 4, maxDuration = 1800 } = {}) {
  const out = [], errors = [], seen = new Set();
  let capped = 0;   // videos whose best stream was ≤ 360p: an outdated yt-dlp only sees YouTube's fallback stream
  if (!(await hasYtDlp())) return { results: [], errors: ["youtube: yt-dlp is not installed (brew install yt-dlp)"] };
  const words = new Set(tokens([...(card.queries || []), card.need || ""].join(" ")));
  for (const q of card.queries || []) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${CC_FILTER}`;
    const s = await yt(["--flat-playlist", "--playlist-end", String(perQuery * 3), "--print", "%(id)s\t%(duration)s", url]);
    if (s.code) { errors.push(`youtube "${q}": ${s.stderr.trim().split("\n").pop()}`); continue; }
    let kept = 0;
    for (const line of s.stdout.trim().split("\n").filter(Boolean)) {
      if (kept >= perQuery) break;
      const [id, dur] = line.split("\t");
      if (seen.has(id) || !(Number(dur) >= 5) || Number(dur) > maxDuration) continue;
      seen.add(id);
      const m = await yt(["-j", "--skip-download", `https://www.youtube.com/watch?v=${id}`]);
      if (m.code) { errors.push(`youtube ${id}: ${m.stderr.trim().split("\n").pop()}`); continue; }
      const d = JSON.parse(m.stdout);
      if (!/creative commons/i.test(d.license || "")) continue;           // the filter let a standard-license video through
      const fmts = (d.formats || []).filter((f) => f.vcodec && f.vcodec !== "none" && f.height);
      const best = fmts.sort((a, b) => b.height - a.height)[0];
      if (best && best.height <= 360) capped++;
      if (!best || best.height < 720 || (best.width && best.width / best.height < 1.15)) continue;   // too small, or vertical
      const preview = path.join(dir, `p_yt_${id}.jpg`);
      const th = [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
      for (const t of th) {
        try { const r = await fetch(t); if (r.ok) { fs.writeFileSync(preview, Buffer.from(await r.arrayBuffer())); break; } } catch { /* next */ }
      }
      const text = `${d.title} ${d.channel} ${d.description?.slice(0, 400) || ""}`;
      const risks = SUSPECT.filter(([re]) => re.test(text)).map(([, why]) => why);
      const have = new Set(tokens(`${d.title} ${(d.tags || []).join(" ")}`));
      const relevance = words.size ? +([...words].filter((w) => have.has(w)).length / words.size).toFixed(2) : 0;
      out.push({ provider: "youtube", kind: "video", title: d.title, author: d.channel, ...CC_BY, page: d.webpage_url,
        attribution: true, attributionText: `"${d.title}" by ${d.channel} (CC BY 3.0) https://youtu.be/${id}`,
        url: d.webpage_url, width: best.width, height: best.height, duration: d.duration, relevance, query: q,
        channel: { name: d.channel, url: d.channel_url, followers: d.channel_follower_count ?? null, verified: !!d.channel_is_verified },
        uploaded: d.upload_date, risks, previewFile: fs.existsSync(preview) ? preview : undefined });
      kept++;
    }
  }
  if (capped && capped === seen.size) errors.push(`youtube: every video offered only ≤ 360p: yt-dlp is out of date for YouTube's streaming (brew upgrade yt-dlp / pip install -U yt-dlp; it also needs deno)`);
  out.sort((a, b) => b.relevance - a.relevance);
  return { results: out, errors };
}

/** a low-res copy for peeking at the frames (≤ 360p, whole video) */
export async function downloadPeek(url, dest) {
  const r = await yt(["-f", "bv*[height<=360][ext=mp4]/bv*[height<=360]/b[height<=360]/w", "-o", dest, "--force-overwrites", url]);
  if (r.code || !fs.existsSync(dest)) throw new Error(`yt-dlp peek failed: ${r.stderr.trim().split("\n").pop()}`);
  return dest;
}

/** the section [from, from + dur] at ≤ 1080p, video only, cut on the exact frame (re-encoded at the cuts: without it
 *  the section starts at the keyframe before `from`, seconds early) */
export async function downloadSection(url, dest, from, dur) {
  // plain HTTPS (DASH) streams first: a section cut from an HLS (m3u8) stream can come back empty
  const r = await yt(["-f", "bv*[height<=1080][ext=mp4][protocol=https]/bv*[height<=1080][protocol=https]/bv*[height<=1080]/b[height<=1080]", "--download-sections", `*${from}-${from + dur}`, "--force-keyframes-at-cuts",
    "-o", dest, "--force-overwrites", url]);
  if (r.code || !fs.existsSync(dest)) throw new Error(`yt-dlp download failed: ${r.stderr.trim().split("\n").pop()}`);
  if (fs.statSync(dest).size < 10_000) throw new Error(`yt-dlp gave an empty section ${from}–${from + dur}s of ${url}: try a longer --dur or another --from`);
  return dest;
}
