#!/usr/bin/env node
// captions.json -> compositions/captions.html: caption groups (stacked lines, or word-by-word) timed to the voice.
//
//   node <skill>/scripts/captions.mjs <project>            (re)writes the captions layer
//   node <skill>/scripts/captions.mjs <project> --draft    starter captions.json from transcript.json (every
//                                                          phrase, split context/keyword): rewrite it by hand
//
// captions.json: { "style"?: {…}, "groups": [ { "start", "end", "lines": [ { "text", "style": "w|b|s", "at", "color"? } ] }
//                                             | { "start", "end", "words": [ { "text", "style"?, "at" } ] } ] }
// Times are seconds on the video clock (transcript.json). Line styles: w = main line, b = emphasis (accent,
// larger), s = small qualifier, t = title. Entrances: cut | pop | slide | glitch; exits: cut | smear.
// The look comes from the template (format.json brand + captions.style, references/styles.md); the defaults
// below are deliberately plain.
// Text always comes from the script, never from whisper (it misspells names).
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, f3, esc, projectDir, canvas, talkingInfo, ensureIndex, hostBlock, shipFonts, loadFormat, underlay, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";

export const STYLE = {
  font: "Be Vietnam Pro",
  top: null, // fraction of the height for the first line; default: on the chest (layout.headTop + 0.245, 0.56–0.70)
  maxWidth: 940, // px a line may take before its size shrinks
  accent: "#ffffff", // b's colour (and the glitch streak's)
  highlight: null, // colour of {words in braces} inside any line; default: accent
  entrance: "cut",
  exit: "cut", // cut | smear (smears right, 0.16 s)
  w: { size: 96, weight: 800, color: "#ffffff" }, // any style may take box: "<css colour>" (a label box behind the text); w and s take outline (+ outlineWidth px)
  b: { size: 140, weight: 800, outline: "rgba(0,0,0,0.55)", glow: false }, // outline: the ring around the letters; glow: a white halo
  s: { size: 64, weight: 700, color: "#ffffff" },
  t: { size: 124, weight: 900, color: "#ffffff" }, // title: uppercase, heavy shadow (a headline over b-roll)
  h: { size: 120, weight: 400, color: "#ffffff", hollow: false }, // hand-lettered accent: give it a handwriting `font`
  // any style may also take font: "<family>"; families other than Be Vietnam Pro are declared here and shipped
  // into assets/fonts: [{ "family", "file" (from the project, else the workspace), "weight"? }]
  fonts: [],
};

/** @font-face rules for the style's extra families, their files copied into <project>/assets/fonts. */
function extraFonts(proj, fonts = []) {
  return fonts.map(({ family, file, weight }) => {
    const from = [path.resolve(proj, file), path.resolve(ROOT, file)].find((f) => fs.existsSync(f));
    if (!from) throw new NeedsInput(`font file ${file} (${family}) not found next to the project or in ${ROOT}`);
    const dest = path.join(proj, "assets", "fonts", path.basename(from));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(from, dest);
    return `@font-face { font-family: "${family}";${weight ? ` font-weight: ${weight};` : ""} src: url("assets/fonts/${path.basename(from)}"); }`;
  });
}

/** Rough advance width of a Be Vietnam Pro ExtraBold string in em (good to ~5%). */
function textEm(s) {
  let w = 0;
  for (const ch of s.normalize("NFC")) {
    if (ch === " ") w += 0.27;
    else if (/[.,:;!'"“”‘’|]/.test(ch)) w += 0.3;
    else if (/[0-9]/.test(ch)) w += 0.64;
    else if (/[mwMW]/.test(ch)) w += 0.92;
    else if (/[iljfrtI]/.test(ch)) w += 0.36;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) w += 0.72;
    else w += 0.6;
  }
  return w;
}
const fitSize = (text, base, maxWidth, min = 40) => Math.max(min, Math.min(base, Math.floor(maxWidth / Math.max(0.01, textEm(text)))));

/** When a line (or word) starts its entrance: its `at`, kept inside the group. */
export function lineAt(cap, li) {
  if (cap.words) return f3(Math.max(cap.start, cap.words[li].at ?? cap.start + li * 0.2));
  const ln = cap.lines[li];
  return f3(Math.max(cap.start, Math.min(cap.end - 0.3, ln.at ?? cap.start + li * 0.06)));
}

/** A #rgb / #rrggbb colour darker than mid grey. */
const isDark = (c) => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim()); if (!m) return false;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110; };

const ENTRANCES = ["cut", "pop", "slide", "glitch"], EXITS = ["cut", "smear"];

function entrance(kind, sel, at) {
  if (kind === "cut") return [`tl.set("${sel}", { opacity: 1 }, ${at});`];
  if (kind === "pop") return [`tl.fromTo("${sel}", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: false }, ${at});`];
  if (kind === "slide") return [`tl.fromTo("${sel}", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", immediateRender: false }, ${at});`];
  // glitch: smears in from the left, a stepped clip reveal with a pixel-block streak riding its edge
  return [
    `tl.fromTo("${sel}", { opacity: 0, x: -70, scaleX: 1.35, filter: "blur(10px)" }, { opacity: 1, x: 0, scaleX: 1, filter: "blur(0px)", duration: 0.26, ease: "expo.out", immediateRender: false }, ${at});`,
    `tl.fromTo("${sel}", { clipPath: "inset(-40% 100% -40% 0%)" }, { clipPath: "inset(-40% 0% -40% 0%)", duration: 0.2, ease: "steps(6)", immediateRender: false }, ${at});`,
    `tl.fromTo("${sel} .gl", { opacity: 0.95, xPercent: -100 }, { xPercent: 0, duration: 0.2, ease: "steps(6)", immediateRender: false }, ${at});`,
    `tl.fromTo("${sel} .gl", { opacity: 0.95 }, { opacity: 0, duration: 0.14, ease: "power2.in", immediateRender: false }, ${f3(at + 0.17)});`,
  ];
}

function build(proj, spec, { width: W, height: H, duration: D }) {
  const st = { ...STYLE, ...(spec.style || {}) };
  for (const k of ["w", "b", "s", "t", "h"]) st[k] = { ...STYLE[k], ...(spec.style?.[k] || {}) };
  st.b.color ??= st.accent;
  if (!ENTRANCES.includes(st.entrance)) throw new Error(`entrance "${st.entrance}" is not one of ${ENTRANCES.join(", ")}`);
  if (!EXITS.includes(st.exit)) throw new Error(`exit "${st.exit}" is not one of ${EXITS.join(", ")}`);
  const lay = talkingInfo(proj)?.layout;
  const top = Math.round((st.top ?? Math.min(0.7, Math.max(0.56, (lay?.headTop ?? 0.41) + 0.245))) * H);
  const groups = [...(spec.groups || [])].sort((a, b) => a.start - b.start);
  const html = [], js = [];
  const line = (gid, li, ln, tag) => {
    const kind = st[ln.style] ? ln.style : "w";
    // {words} in braces are highlighted; titles are shown uppercase: measure what is shown
    const plain = ln.text.replace(/[{}]/g, "");
    const size = fitSize(kind === "t" || st[kind].upper ? plain.toUpperCase() : plain, ln.size || st[kind].size, st.maxWidth);
    const text = esc(ln.text).replace(/\{([^}]*)\}/g, '<span class="hl">$1</span>');
    // a dark line (words on a light card) drops the shadow: a dark halo around dark letters reads as a smudge
    const color = ln.color ? `;color:${ln.color}${isDark(ln.color) ? ";text-shadow:none" : ""}` : "";
    return `<div id="${gid}-${tag}${li + 1}" class="ln ${kind}" style="font-size:${size}px${color}"><span class="tx">${text}</span><i class="gl"></i></div>`;
  };
  groups.forEach((cap, gi) => {
    const id = `cap-${gi + 1}`;
    const s = f3(cap.start), e = f3(cap.end);
    const pos = cap.top ? ` style="top:${Math.round(cap.top * H)}px"` : "";
    const show = `tl.set("#${id}", { visibility: "visible", opacity: 1, x: 0, scaleX: 1, filter: "blur(0px)" }, ${s});`;
    if (cap.words) {
      // word by word: every word in the same spot, each replacing the last on its `at`; the last one holds
      html.push(`<div id="${id}" class="cap words"${pos}>\n  ${cap.words.map((w, wi) => line(id, wi, w, "w")).join("\n  ")}\n</div>`);
      js.push(`// ${id}: ${cap.words.map((w) => w.text).join(" > ")}`, show);
      cap.words.forEach((w, wi) => {
        const at = lineAt(cap, wi), sel = `#${id}-w${wi + 1}`;
        if (wi === cap.words.length - 1) js.push(...entrance(st.entrance, sel, at));
        else {
          const next = lineAt(cap, wi + 1);
          js.push(`tl.fromTo("${sel}", { opacity: 0, scale: 1.18, filter: "blur(6px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: ${f3(Math.min(0.12, Math.max(0.04, (next - at) * 0.6)))}, ease: "expo.out", immediateRender: false }, ${at});`,
            `tl.set("${sel}", { opacity: 0 }, ${next});`);
        }
      });
    } else {
      html.push(`<div id="${id}" class="cap"${pos}>\n  ${cap.lines.map((ln, li) => line(id, li, ln, "l")).join("\n  ")}\n</div>`);
      js.push(`// ${id}: ${cap.lines.map((l) => l.text).join(" / ")}`, show);
      cap.lines.forEach((_, li) => js.push(...entrance(st.entrance, `#${id}-l${li + 1}`, lineAt(cap, li))));
    }
    if ((cap.exit || st.exit) !== "cut")
      js.push(`tl.fromTo("#${id}", { opacity: 1, x: 0, scaleX: 1, filter: "blur(0px)" }, { opacity: 0, x: 50, scaleX: 1.25, filter: "blur(8px)", duration: 0.16, ease: "power3.in", immediateRender: false }, ${f3(e - 0.16)});`);
    js.push(`tl.set("#${id}", { visibility: "hidden" }, ${e});`);
  });
  const overlaps = groups.slice(1).filter((g, i) => g.start < groups[i].end - 0.01).map((g) => g.start);
  if (overlaps.length) log(`! caption groups overlap at ${overlaps.join(", ")}s: end each group before the next starts`);

  const ring = (px, c) => [[px, 0], [-px, 0], [0, px], [0, -px], [px * 0.7, px * 0.7], [-px * 0.7, px * 0.7], [px * 0.7, -px * 0.7], [-px * 0.7, -px * 0.7]].map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${c}`).join(", ");
  const faces = [st.font === STYLE.font ? shipFonts(proj, st.font) : "", ...extraFonts(proj, st.fonts)].filter(Boolean).join("\n      ");
  const KINDS = ["w", "b", "s", "t", "h"];
  fs.mkdirSync(path.join(proj, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(proj, "compositions", "captions.html"), `<!doctype html>
<html>
  <body>
    <template>
      <style>
      ${faces}
      #root { position: absolute; inset: 0; pointer-events: none; }
      .cap { position: absolute; left: 0; top: ${top}px; width: ${W}px; display: flex; flex-direction: column; align-items: center;
        visibility: hidden; font-family: "${st.font}"; text-align: center; overflow: visible; }
      .ln { position: relative; opacity: 0; line-height: 1.08; letter-spacing: -0.015em; white-space: nowrap; transform-origin: 0% 50%; }
      .ln + .ln { margin-top: -0.06em; }
      .cap.words { display: grid; justify-items: center; }
      .cap.words .ln { grid-area: 1 / 1; margin-top: 0; transform-origin: 50% 50%; }
      .ln.w { color: ${st.w.color}; font-weight: ${st.w.weight}; text-shadow: ${st.w.outline ? `${ring(st.w.outlineWidth ?? 3, st.w.outline)}, ` : ""}0 2px 2px rgba(0, 0, 0, 0.35), 0 4px 16px rgba(0, 0, 0, 0.45); }
      .ln.s { color: ${st.s.color}; font-weight: ${st.s.weight}; text-shadow: ${st.s.outline ? `${ring(st.s.outlineWidth ?? 3, st.s.outline)}, ` : ""}0 2px 2px rgba(0, 0, 0, 0.35), 0 4px 14px rgba(0, 0, 0, 0.45); }
      .ln .hl { color: ${st.highlight ?? st.accent}; }
      .ln.b { color: ${st.b.color}; font-weight: ${st.b.weight}; text-shadow: ${ring(4, st.b.outline)},${st.b.glow ? " 0 0 14px rgba(255, 255, 255, 0.55)," : ""} 0 8px 18px rgba(0, 0, 0, 0.3); }
      .ln.t { color: ${st.t.color}; font-weight: ${st.t.weight}; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.98;
        text-shadow: ${ring(3, "rgba(0,0,0,0.55)")}, 0 6px 0 rgba(0, 0, 0, 0.35), 0 10px 26px rgba(0, 0, 0, 0.5); }
      .ln.h { font-weight: ${st.h.weight}; letter-spacing: 0.02em; ${st.h.hollow
        ? `color: transparent; -webkit-text-stroke: 0.035em ${st.h.color}; text-shadow: none; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));`
        : `color: ${st.h.color}; text-shadow: 0 2px 2px rgba(0, 0, 0, 0.3), 0 4px 14px rgba(0, 0, 0, 0.4);`} }
      ${KINDS.filter((k) => st[k].font).map((k) => `.ln.${k} { font-family: "${st[k].font}", "${st.font}"; }`).join("\n      ")}
      ${KINDS.filter((k) => st[k].upper || st[k].tracking != null).map((k) => `.ln.${k} {${st[k].upper ? " text-transform: uppercase;" : ""}${st[k].tracking != null ? ` letter-spacing: ${st[k].tracking}em;` : ""} }`).join("\n      ")}
      ${KINDS.filter((k) => st[k].box).map((k) => `.ln.${k} .tx { background: ${st[k].box}; padding: 0.04em 0.26em 0.08em; border-radius: 0.16em; text-shadow: none; }`).join("\n      ")}
      .gl { position: absolute; left: -6%; right: -6%; top: 18%; bottom: 18%; opacity: 0; pointer-events: none;
        background: repeating-linear-gradient(90deg, ${st.accent} 0 22px, rgba(255, 255, 255, 0.9) 22px 30px,
          ${st.accent}8c 30px 52px, transparent 52px 60px, rgba(255, 255, 255, 0.7) 60px 64px, transparent 64px 78px); }
      </style>
      <div id="root" data-composition-id="captions" data-width="${W}" data-height="${H}" data-layout-allow-overflow>
${html.join("\n").replace(/^/gm, "        ")}
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.to({}, { duration: ${f3(D)} }, 0);
        ${js.join("\n        ")}
        window.__timelines["captions"] = tl;
      </script>
    </template>
  </body>
</html>
`);
  return { groups: groups.length, top };
}

/** Starter groups from transcript.json: one per phrase (≤ 6 words), the first third context, the rest keyword. */
function draft(words, D) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const toks = cur.map((w) => w.text), cut = Math.max(1, Math.round(toks.length / 3));
    out.push({ start: f3(Math.max(0.1, cur[0].start - 0.05)), end: f3(Math.min(D, cur[cur.length - 1].end + 0.25)),
      lines: [{ text: toks.slice(0, cut).join(" "), style: "w" }, ...(toks.length > cut ? [{ text: toks.slice(cut).join(" "), style: "b", at: f3(cur[cut].start) }] : [])] });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const pause = i < words.length - 1 ? words[i + 1].start - w.end : 9;
    if (/[.!?…,;:]$/.test(w.text) || pause >= 0.25 || cur.length >= 6) flush();
  });
  flush();
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.min(out[i].end, out[i + 1].start);
  return out;
}

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "captions.mjs <project> [--draft]");
  const cv = canvas(proj);
  const specPath = path.join(proj, "captions.json");
  if (args.draft) {
    if (fs.existsSync(specPath) && !args.force) throw new NeedsInput("captions.json exists: edit it, or pass --draft --force to overwrite it.");
    const words = readJson(path.join(proj, "transcript.json"), null);
    if (!words) throw new NeedsInput("no transcript.json: make the word timings with the talking-head skill (prep.mjs) first.");
    writeJson(specPath, { groups: draft(words, cv.duration ?? Infinity) });
    log(`draft captions.json: a group per phrase. Rewrite it the way the template's FORMAT.md says (which words, how many, where), then rerun without --draft.`);
    return;
  }
  const raw = readJson(specPath, null);
  if (!raw) throw new NeedsInput(`${path.relative(ROOT, proj)}/captions.json is missing: write it, or start from --draft.`);
  if (!cv.duration) throw new NeedsInput("the project has no length yet (talking.json or index.html data-duration).");
  ensureIndex(proj, cv);
  // the template's brand (font, accent) and captions.style are defaults under captions.json's style
  const fmt = loadFormat(proj, raw), brand = fmt.brand || {};
  const base = { ...(brand.font ? { font: brand.font } : {}), ...(brand.accent ? { accent: brand.accent } : {}) };
  const spec = { ...raw, style: underlay(underlay(base, fmt.captions?.style || {}), raw.style || {}) };
  const { groups, top } = build(proj, spec, cv);
  hostBlock(proj, "captions", { z: 2, track: 2, kind: "captions" });
  log(`captions: ${groups} group(s), first line at y=${top}px`);
}

if (isMain(import.meta.url)) main().catch(exitOnError);
