#!/usr/bin/env node
// Always-on subtitles: transcript.json -> captions.json (then run captions.mjs).
//
//   node <skill>/scripts/subtitles.mjs videos/<slug> [--format formats/<name>/format.json]
//
// The template (--format, else the project's meta.json "format") sets the chunking (captions.chunk), where
// words sit per layout (captions.top) and the style copied into captions.json (captions.style); without one,
// ≤ 4 words / 20 characters on the chest.
//
// Chunks the script's own words (transcript.json, from talking-head) into groups of ≤ chunk.maxWords words /
// ≤ chunk.maxChars characters, breaking on punctuation and pauses; each group shows until the next one starts
// (a real pause ends it early). Each group sits where the format puts words for the layout on screen at that
// moment (shots.json panels: presenter | split | full | card). Headlines come from <project>/titles.json:
//   [{ "start": 16.3, "end": 18.6, "text": "Kết quả xịn hơn", "top": 0.16 }, { …, "lines": ["COMMENT", "MASTER PROMPT"] }]
// Titles use the "t" style and may overlap subtitles (they sit higher). A title's top defaults to 0.16: the
// platform's top bar (TikTok, Shorts) covers anything higher. Writes captions.json.
// Colour by meaning, when the template asks: captions.question colours every chunk of a sentence that ends in
// "?"; <project>/highlights.json (["turn it on", "half", …]: phrases of the script, any case) wraps those words
// in {braces}, drawn in captions.style.highlight. chunk.keepPunctuation keeps a chunk's final . , ; :
// <project>/emphasis.json (phrases, like highlights.json) draws the chunks holding them at captions.emphasis.size.
// Per panel (shots.json): "subs": false hides the subtitles while it is on (a card that shows the words itself,
// any layout including over); "subColor" recolours them (dark words on a light card). A title may take its own
// "style" (default "t") and "size", and "replace": true hides the subtitles it overlaps (a word shown big in place).
import fs from "node:fs";
import path from "node:path";
import { loadFormat } from "./lib/util.mjs";

const args = process.argv.slice(2);
const proj = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const fi = args.indexOf("--format");
if (!proj) { console.error("subtitles.mjs <project> [--format formats/<name>/format.json]"); process.exit(2); }
const fmt = fi >= 0 ? JSON.parse(fs.readFileSync(args[fi + 1], "utf8")) : loadFormat(proj, {});
const read = (f, d) => (fs.existsSync(path.join(proj, f)) ? JSON.parse(fs.readFileSync(path.join(proj, f), "utf8")) : d);
const words = read("transcript.json", null);
if (!words) { console.error("no transcript.json: run the talking-head skill's prep first"); process.exit(3); }
const shots = read("shots.json", { panels: [] });
const titles = read("titles.json", []);
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, "");
const phrases = (f) => read(f, []).map((h) => h.split(/\s+/).map(norm).filter(Boolean)).filter((h) => h.length);
const highlights = phrases("highlights.json"), emphasis = phrases("emphasis.json");
// lead: how far a chunk appears ahead of its first word. Shown exactly on the word, one-word subtitles read as
// late (the eye needs a beat to take the word in), so fast templates lead by ~0.12 s
const C = fmt.captions || {}, chunk = { maxWords: 4, maxChars: 20, minDur: 0.45, lead: 0.02, ...(C.chunk || {}) };
const tops = { presenter: 0.69, behind: 0.69, card: 0.69, split: 0.455, full: 0.74, ...(C.top || {}) };
const r3 = (x) => Math.round(x * 1000) / 1000;
// which sentence each word is in, and whether that sentence is a question
let sid = 0;
const sentence = words.map((w) => { const s = sid; if (/[.!?…]["”’)]*$/.test(w.text)) sid++; return s; });
const asks = new Set(sentence.filter((s, i) => /\?["”’)]*$/.test(words[i].text)));
words.forEach((w, i) => (w.sentence = sentence[i]));

const layoutAt = (t) => {
  // an `over` layer (marks drawn on top) leaves the layout underneath as it is
  const p = (shots.panels || []).find((p) => t >= p.start && t < p.end && p.layout !== "over");
  return p ? p.layout || "behind" : "presenter";
};

// the panels on screen at t (over layers too): `subs: false` hides the subtitles, `subColor` recolours them
const panelsAt = (t) => (shots.panels || []).filter((p) => t >= p.start && t < p.end);
// a title with "replace": true (a big number said in place) takes the place of the subtitles under it
const replacing = titles.filter((t) => t.replace);
const hidden = (g) => panelsAt((g.start + g.end) / 2).some((p) => p.subs === false)
  || replacing.some((t) => g.start < t.end && g.end > t.start);
const subColor = (g) => panelsAt((g.start + g.end) / 2).find((p) => p.subColor)?.subColor;

// a cover frame (a panel with id "cover") stays clean: subtitles start after it
const coverEnd = (shots.panels || []).find((p) => p.id === "cover")?.end ?? 0;
const groups = [];
let cur = [];
const flush = (next) => {
  if (!cur.length) return;
  let start = Math.max(coverEnd, cur[0].start - chunk.lead);
  // the lead never pulls a chunk back over a card that hides the subtitles
  for (const p of (shots.panels || []).filter((p) => p.subs === false && start < p.end && cur[0].start >= p.end)) start = Math.max(start, p.end);
  const lastEnd = cur.at(-1).end;
  const end = next && next.start - lastEnd < 0.6 ? next.start - chunk.lead : lastEnd + 0.2;
  groups.push({ start: r3(start), end: r3(Math.max(end, start + chunk.minDur)), words: cur });
  cur = [];
};
words.forEach((w, i) => {
  const next = words[i + 1];
  const text = [...cur, w].map((x) => x.text).join(" ");
  if (cur.length && (cur.length >= chunk.maxWords || text.length > chunk.maxChars)) flush(w);
  cur.push(w);
  const pause = next ? next.start - w.end : 9;
  // a pause inside a short sentence doesn't split it when the whole rest of it still fits this chunk
  // ("Phone in … bed?" stays one subtitle); a long pause (≥ 0.6 s) always does
  const rest = words.slice(i + 1).filter((x) => x.sentence === w.sentence);
  const all = [...cur, ...rest];
  const fits = rest.length && pause < 0.6 && all.length <= chunk.maxWords && all.map((x) => x.text).join(" ").length <= chunk.maxChars;
  if (/[.!?…,;:]$/.test(w.text) || (pause >= 0.2 && !fits)) flush(next);
});
flush(null);
for (let i = 0; i < groups.length - 1; i++) groups[i].end = Math.min(groups[i].end, groups[i + 1].start);
// a chunk running into a `subs: false` panel (an outro on black) ends where that panel starts
for (const g of groups) for (const p of (shots.panels || []).filter((p) => p.subs === false && p.start > g.start && p.start < g.end)) g.end = r3(p.start);
// a chunk left with no time (a short word squeezed between a card that hides the subtitles and the next word's
// lead) joins the next chunk instead of flashing for a frame; one that ends before it starts (words out of order
// in transcript.json) would never hide and sit under every later subtitle: it joins too, and is reported
for (let i = groups.length - 1; i >= 0; i--) {
  const g = groups[i], next = groups[i + 1];
  if (g.end - g.start >= 0.05) continue;
  if (g.end < g.start) console.error(`! "${g.words.map((w) => w.text).join(" ")}" at ${g.start}s ends at ${g.end}s: transcript.json words are out of order there`);
  if (next && next.words.length + g.words.length <= chunk.maxWords + 1) next.words.unshift(...g.words);
  groups.splice(i, 1);
}

// a chunk's text: the final . , ; : dropped (unless chunk.keepPunctuation), highlighted runs in {braces}
const chunkText = (ws) => {
  const toks = ws.map((w) => w.text), keys = toks.map(norm), on = toks.map(() => false);
  for (const h of highlights)
    for (let i = 0; i + h.length <= keys.length; i++) if (h.every((k, j) => keys[i + j] === k)) for (let j = 0; j < h.length; j++) on[i + j] = true;
  if (!chunk.keepPunctuation) toks[toks.length - 1] = toks.at(-1).replace(/[.,;:]+$/, "");
  return toks.map((t, i) => `${on[i] && !on[i - 1] ? "{" : ""}${t}${on[i] && !on[i + 1] ? "}" : ""}`).join(" ");
};
const has = (ws, list) => { const keys = ws.map((w) => norm(w.text));
  return list.some((h) => keys.some((_, i) => h.every((k, j) => keys[i + j] === k))); };
const shownGroups = groups.filter((g) => !hidden(g));
const out = shownGroups.map((g) => {
  const lay = layoutAt((g.start + g.end) / 2);
  const ask = C.question && g.words.every((w) => asks.has(w.sentence));
  const color = (ask && C.question) || subColor(g), big = C.emphasis?.size && has(g.words, emphasis);
  return { start: g.start, end: g.end, top: tops[lay] ?? tops.presenter, note: ask ? `${lay}, question` : lay,
    lines: [{ text: chunkText(g.words), style: "w", at: g.start, ...(color ? { color } : {}), ...(big ? { size: C.emphasis.size } : {}) }] };
});
for (const t of titles) {
  const lines = t.lines || [t.text];
  const style = t.style || "t";
  if (t.top != null && t.top < 0.16) console.error(`! title "${t.text || t.lines?.[0]}" at top ${t.top}: the platform's top bar covers anything above 0.16`);
  out.push({ start: t.start, end: t.end, top: t.top ?? 0.16, note: "title",
    lines: lines.map((x, i) => ({ text: x, style, at: r3(t.start + (t.stagger ?? 0.12) * i), ...(t.size ? { size: t.size } : {}) })) });
}
out.sort((a, b) => a.start - b.start);
const spec = { style: { ...(C.style || {}) }, groups: out };
fs.writeFileSync(path.join(proj, "captions.json"), JSON.stringify(spec, null, 1) + "\n");
const spoken = words.reduce((s, w) => s + (w.end - w.start), 0);
const shown = shownGroups.reduce((s, g) => s + (g.end - g.start), 0);
console.log(JSON.stringify({ subtitles: shownGroups.length, hidden: groups.length - shownGroups.length, titles: titles.length, coverage: +(shown / Math.max(spoken, 0.01)).toFixed(2) }));
