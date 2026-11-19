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
// larger), s = small qualifier, t = title. Entrances: cut | pop | slide | glitch, and for a whole group (a
// headline) slam | spin; exits: cut | smear. A group may take its own `entrance` and a `rotate` (degrees).
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

const ENTRANCES = ["cut", "pop", "slide", "glitch", "slam", "spin"], EXITS = ["cut", "smear"];
// whole-group entrances: the block of lines moves as one (a headline), its lines simply appear on their `at`
const GROUP_ENTRANCES = ["slam", "spin"];

/** slam: drops in from ~3× its size, half see-through, settling in 0.17 s. spin: swings in from ~68° off its
 *  tilt, overshoots past it and settles, 0.24 s. Both measured at 60 fps from the ranking-products references. */
function groupEntrance(kind, sel, at, rot = 0) {
  if (kind === "slam") return [`tl.fromTo("${sel}", { scale: 3.2, opacity: 0.55, filter: "blur(6px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.17, ease: "power3.out", immediateRender: false }, ${at});`];
  return [`tl.fromTo("${sel}", { rotation: ${f3(rot - 68)}, scale: 1.25, opacity: 0.6, filter: "blur(5px)" }, { rotation: ${f3(rot)}, scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.24, ease: "back.out(2.6)", immediateRender: false }, ${at});`];
}

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

/**
 * A headline's marks, drawn round the block's centre and tilted with it (they are children of the group):
 *  burst "puff":   as the title lands (+0.17 s) a white comic cloud with thin grey outlines bursts from its middle
 *                  to both ends, breaks into outlined arcs and drifting dots, gone by +0.55 s.
 *  burst "splash": droplets fly in (+0.02 s), three thick white brush arcs sweep round the block and spray off (+0.33 s).
 *  sparkles:       yellow four-point star pairs at the top-left and bottom-right corners, twinkling from +0.6 s.
 * Measured at 60 fps from the ranking-products references. `box` = { w, h } of the block (estimated), `at` = landing.
 */
function titleMarks(gid, box, at, end, { burst, sparkles }, seed0 = 11) {
  let seed = seed0; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const html = [], js = [], r1 = (v) => Math.round(v);
  const tw = (sel, from, to, t, d, ease = "power2.out") => js.push(`tl.fromTo("${sel}", ${JSON.stringify(from)}, { ...${JSON.stringify(to)}, duration: ${f3(d)}, ease: "${ease}", immediateRender: false }, ${f3(t)});`);
  const half = box.w / 2, P = `${gid}-mk`;
  if (burst === "puff") {
    const t0 = at + 0.17;
    for (let i = 0; i < 32; i++) {
      const u = (rnd() * 2 - 1) * half * 0.95, v = (rnd() * 2 - 1) * box.h * 0.28, r = 30 + rnd() * 30;
      html.push(`<i id="${P}-p${i}" class="mk-p" style="left:${r1(u - r)}px;top:${r1(v - r)}px;width:${r1(2 * r)}px;height:${r1(2 * r)}px"></i>`);
      const d = (Math.abs(u) / half) * 0.06, out = Math.sign(u || 1) * (20 + rnd() * 30);
      tw(`#${P}-p${i}`, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1 }, t0 + d, 0.06);
      tw(`#${P}-p${i}`, { x: 0, y: 0, scale: 1, opacity: 1 }, { x: r1(out), y: r1((rnd() * 2 - 1) * 24), scale: 0.25, opacity: 0 }, t0 + d + 0.1, 0.22, "power1.in");
    }
    [-1, 1].forEach((sg, k) => {
      const x = sg * (half + 10);
      html.push(`<svg class="mk-svg"><path id="${P}-a${k}" class="mk-arc" stroke-width="7" d="M ${x - sg * 10} -70 Q ${x + sg * 45} 0 ${x - sg * 10} 70"/></svg>`);
      tw(`#${P}-a${k}`, { opacity: 0, scale: 0.7, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1.1 }, t0 + 0.1, 0.1);
      tw(`#${P}-a${k}`, { opacity: 1, x: 0 }, { opacity: 0, x: sg * 30 }, t0 + 0.24, 0.16, "power1.in");
    });
    for (let i = 0; i < 16; i++) {
      const u = (rnd() * 2 - 1) * half, v = (rnd() < 0.5 ? -1 : 1) * (box.h * 0.35 + rnd() * 40), r = 5 + rnd() * 7, t = t0 + 0.12 + rnd() * 0.12;
      html.push(`<i id="${P}-d${i}" class="mk-d" style="left:${r1(u - r)}px;top:${r1(v - r)}px;width:${r1(2 * r)}px;height:${r1(2 * r)}px"></i>`);
      tw(`#${P}-d${i}`, { opacity: 0 }, { opacity: 1 }, t, 0.04, "none");
      tw(`#${P}-d${i}`, { opacity: 1, x: 0, y: 0 }, { opacity: 0, x: r1((rnd() * 2 - 1) * 30), y: r1(Math.sign(v) * (25 + rnd() * 40)) }, t + 0.06, 0.26, "power1.out");
    }
  } else if (burst === "splash") {
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, r = 16 + rnd() * 18, u = Math.cos(a) * (half + 40), v = Math.sin(a) * (box.h / 2 + 120);
      html.push(`<i id="${P}-d${i}" class="mk-d" style="left:${r1(u - r)}px;top:${r1(v - r * 0.7)}px;width:${r1(2 * r)}px;height:${r1(1.4 * r)}px"></i>`);
      tw(`#${P}-d${i}`, { opacity: 0, x: r1(Math.cos(a) * 160), y: r1(Math.sin(a) * 160) }, { opacity: 1, x: 0, y: 0 }, at + 0.02 + rnd() * 0.06, 0.07);
      tw(`#${P}-d${i}`, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.4 }, at + 0.2 + rnd() * 0.1, 0.12, "power1.in");
    }
    const rx = half + 70, ry = box.h / 2 + 150, E = (a) => `${f3(rx * Math.cos(a))} ${f3(ry * Math.sin(a))}`;
    for (let k = 0; k < 3; k++) {
      const a0 = (k * 2 * Math.PI) / 3 - 0.6, a1 = a0 + 1.15;
      html.push(`<svg class="mk-svg"><path id="${P}-a${k}" class="mk-arc" stroke-width="26" pathLength="1" style="stroke-dasharray:1" d="M ${E(a0)} A ${f3(rx)} ${f3(ry)} 0 0 1 ${E(a1)}"/></svg>`);
      tw(`#${P}-a${k}`, { opacity: 1, strokeDashoffset: 1, rotation: -40, svgOrigin: "0 0" }, { strokeDashoffset: 0, rotation: 25 }, at + 0.07, 0.14);
      tw(`#${P}-a${k}`, { strokeWidth: 26, opacity: 1 }, { strokeWidth: 4, opacity: 0, rotation: 60 }, at + 0.19, 0.14, "power1.in");
    }
  }
  if (sparkles) {
    const star = `<svg viewBox="-10 -10 20 20" width="46" height="46"><path d="M0-10C1 -2 2 -1 10 0C2 1 1 2 0 10C-1 2-2 1-10 0C-2-1-1-2 0-10Z" fill="#FFE83A"/></svg>`;
    const spots = [[-half - 40, -10, 1], [-half - 12, 14, 0.55], [half + 20, box.h / 2 + 18, 1], [half + 46, box.h / 2 - 6, 0.55]];
    const t1 = at + 0.6, n = Math.max(1, Math.floor((end - t1) / 0.35) - 1);
    spots.forEach(([u, v, sc], i) => {
      html.push(`<i id="${P}-s${i}" class="mk-s" style="left:${r1(u)}px;top:${r1(v)}px">${star}</i>`);
      tw(`#${P}-s${i}`, { opacity: 0, scale: 0 }, { opacity: 1, scale: sc }, t1 + 0.05 * i, 0.15, "back.out(2)");
      js.push(`tl.fromTo("#${P}-s${i}", { scale: ${sc} }, { scale: ${f3(sc * 0.55)}, duration: 0.35, ease: "sine.inOut", repeat: ${n}, yoyo: true, immediateRender: false }, ${f3(t1 + 0.2 + 0.12 * (i % 2))});`);
    });
  }
  return { html: html.length ? `<div class="mk">${html.join("")}</div>` : "", js };
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
    // em: the style's font width against Be Vietnam Pro ExtraBold (a condensed face like Bangers ≈ 0.62)
    const size = fitSize(kind === "t" || st[kind].upper ? plain.toUpperCase() : plain, ln.size || st[kind].size, st.maxWidth / (st[kind].em ?? 1));
    const text = esc(ln.text).replace(/\{([^}]*)\}/g, '<span class="hl">$1</span>');
    // a dark line (words on a light card) drops the shadow: a dark halo around dark letters reads as a smudge
    const color = ln.color ? `;color:${ln.color}${isDark(ln.color) ? ";text-shadow:none" : ""}` : "";
    return `<div id="${gid}-${tag}${li + 1}" class="ln ${kind}" style="font-size:${size}px${color}"><span class="tx">${text}</span><i class="gl"></i></div>`;
  };
  groups.forEach((cap, gi) => {
    const id = `cap-${gi + 1}`;
    const s = f3(cap.start), e = f3(cap.end);
    const pos = cap.top ? ` style="top:${Math.round(cap.top * H)}px"` : "";
    const ent = cap.entrance || st.entrance, rot = Number(cap.rotate) || 0;
    if (!ENTRANCES.includes(ent)) throw new Error(`group at ${s}s: entrance "${ent}" is not one of ${ENTRANCES.join(", ")}`);
    const whole = GROUP_ENTRANCES.includes(ent);
    const show = `tl.set("#${id}", { visibility: "visible", opacity: 1, x: 0, scale: 1, scaleX: 1, rotation: ${rot}, filter: "blur(0px)" }, ${s});`;
    if (cap.words) {
      // word by word: every word in the same spot, each replacing the last on its `at`; the last one holds
      html.push(`<div id="${id}" class="cap words"${pos}>\n  ${cap.words.map((w, wi) => line(id, wi, w, "w")).join("\n  ")}\n</div>`);
      js.push(`// ${id}: ${cap.words.map((w) => w.text).join(" > ")}`, show);
      cap.words.forEach((w, wi) => {
        const at = lineAt(cap, wi), sel = `#${id}-w${wi + 1}`;
        if (wi === cap.words.length - 1) js.push(...entrance(whole ? "cut" : ent, sel, at));
        else {
          const next = lineAt(cap, wi + 1);
          js.push(`tl.fromTo("${sel}", { opacity: 0, scale: 1.18, filter: "blur(6px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: ${f3(Math.min(0.12, Math.max(0.04, (next - at) * 0.6)))}, ease: "expo.out", immediateRender: false }, ${at});`,
            `tl.set("${sel}", { opacity: 0 }, ${next});`);
        }
      });
    } else {
      // a headline's marks (burst, sparkles): sized from the block's estimated width and height
      let marks = { html: "", js: [] };
      if (cap.burst || cap.sparkles) {
        const sizes = cap.lines.map((ln) => { const k = st[ln.style] ? ln.style : "w", txt = ln.text.replace(/[{}]/g, "").toUpperCase();
          const sz = fitSize(txt, ln.size || st[k].size, st.maxWidth / (st[k].em ?? 1)); return { w: (textEm(txt) * (st[k].em ?? 1) + (st[k].box ? 0.4 : 0)) * sz, h: sz * 1.06 }; });
        marks = titleMarks(id, { w: Math.max(...sizes.map((x) => x.w)), h: sizes.reduce((a, x) => a + x.h, 0) }, lineAt(cap, 0), e, cap, 11 + gi);
      }
      html.push(`<div id="${id}" class="cap"${pos}>\n  ${cap.lines.map((ln, li) => line(id, li, ln, "l")).join("\n  ")}${marks.html ? `\n  ${marks.html}` : ""}\n</div>`);
      js.push(`// ${id}: ${cap.lines.map((l) => l.text).join(" / ")}`, show, ...marks.js);
      cap.lines.forEach((_, li) => js.push(...entrance(whole ? "cut" : ent, `#${id}-l${li + 1}`, lineAt(cap, li))));
    }
    if (whole) js.push(...groupEntrance(ent, `#${id}`, lineAt(cap, 0), rot));
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
        visibility: hidden; font-family: "${st.font}"; text-align: center; overflow: visible; transform-origin: 50% 50%; }
      .ln { position: relative; opacity: 0; line-height: 1.08; letter-spacing: -0.015em; white-space: nowrap; transform-origin: 0% 50%; }
      .ln + .ln { margin-top: -0.06em; }
      .cap.words { display: grid; justify-items: center; }
      .mk { position: absolute; left: 50%; top: 50%; width: 0; height: 0; overflow: visible; pointer-events: none; }
      .mk-p { position: absolute; border-radius: 50%; background: #fff; border: 3px solid #4a4f57; box-sizing: border-box; opacity: 0; }
      .mk-d { position: absolute; border-radius: 50%; background: #fff; opacity: 0; }
      .mk-s { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; opacity: 0; filter: drop-shadow(0 0 5px rgba(255, 228, 60, 0.85)); }
      .mk-svg { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
      .mk-arc { fill: none; stroke: #fff; stroke-linecap: round; opacity: 0; filter: drop-shadow(0 0 1.5px #4a4f57); }
      .cap.words .ln { grid-area: 1 / 1; margin-top: 0; transform-origin: 50% 50%; }
      .ln.w { color: ${st.w.color}; font-weight: ${st.w.weight}; text-shadow: ${st.w.outline ? `${ring(st.w.outlineWidth ?? 3, st.w.outline)}, ` : ""}0 2px 2px rgba(0, 0, 0, 0.35), 0 4px 16px rgba(0, 0, 0, 0.45); }
      .ln.s { color: ${st.s.color}; font-weight: ${st.s.weight}; text-shadow: ${st.s.outline ? `${ring(st.s.outlineWidth ?? 3, st.s.outline)}, ` : ""}0 2px 2px rgba(0, 0, 0, 0.35), 0 4px 14px rgba(0, 0, 0, 0.45); }
      .ln .hl { color: ${st.highlight ?? st.accent}; }
      .ln.b { color: ${st.b.color}; font-weight: ${st.b.weight}; text-shadow: ${ring(4, st.b.outline)},${st.b.glow ? " 0 0 14px rgba(255, 255, 255, 0.55)," : ""} 0 8px 18px rgba(0, 0, 0, 0.3); }
      .ln.t { color: ${st.t.color}; font-weight: ${st.t.weight}; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.98;
        text-shadow: ${ring(st.t.outline ? st.t.outlineWidth ?? 4 : 3, st.t.outline || "rgba(0,0,0,0.55)")}, ${st.t.glow
          ? `${ring((st.t.outlineWidth ?? 4) + 5, st.t.glow)}, 0 0 14px ${st.t.glow}, 0 0 26px ${st.t.glow}`
          : "0 6px 0 rgba(0, 0, 0, 0.35), 0 10px 26px rgba(0, 0, 0, 0.5)"}; }
      .ln.h { font-weight: ${st.h.weight}; letter-spacing: 0.02em; ${st.h.hollow
        ? `color: transparent; -webkit-text-stroke: 0.035em ${st.h.color}; text-shadow: none; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));`
        : `color: ${st.h.color}; text-shadow: 0 2px 2px rgba(0, 0, 0, 0.3), 0 4px 14px rgba(0, 0, 0, 0.4);`} }
      ${KINDS.filter((k) => st[k].font).map((k) => `.ln.${k} { font-family: "${st[k].font}", "${st.font}"; }`).join("\n      ")}
      ${KINDS.filter((k) => st[k].upper || st[k].tracking != null).map((k) => `.ln.${k} {${st[k].upper ? " text-transform: uppercase;" : ""}${st[k].tracking != null ? ` letter-spacing: ${st[k].tracking}em;` : ""} }`).join("\n      ")}
      ${KINDS.filter((k) => st[k].box).map((k) => `.ln.${k} .tx { background: ${st[k].box}; padding: ${st[k].boxPad ?? "0.04em 0.26em 0.08em"}; border-radius: ${st[k].boxRadius ?? 0.16}em;${st[k].outline ? "" : " text-shadow: none;"}${st[k].boxShadow ? ` box-shadow: ${st[k].boxShadow};` : ""} }`).join("\n      ")}
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
