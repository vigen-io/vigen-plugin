#!/usr/bin/env node
// shots.json -> the stage of a talking-head edit: a camera over plate, panels and the matted presenter,
// panel transitions, and light-leak flashes. Recipes for every move: references/*.md.
//
//   node <skill>/scripts/shots.mjs <project>          (re)writes compositions/stage.html + compositions/fx.html
//   node <skill>/scripts/shots.mjs <project> --draft  writes a starter shots.json (wide, a cut on every seam)
//
// Needs talking.json (talking-head skill: plate, cutout, layout, seams). Layer stack, back -> front, inside
// one camera wrapper (#cam) so a punch-in moves plate, panels and presenter together like a real camera:
//   plate -> panels (media, or a sub-composition from viz-cards / ui-demo) -> cutout
// fx (leaks) is its own layer above everything, captions included. Edit shots.json, not the generated HTML.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, ffmpeg, probe, f3, esc, projectDir, talkingInfo, ensureIndex, hostBlock, localize, loadFormat, underlay, IMAGE_EXT, VIDEO_EXT, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";

export const FRAMES = { wide: 1, punch: 1.27, tight: 1.45 };
const IN = ["cut", "whip", "drop", "fade", "pop", "white", "leak", "paper"];
const OUT = ["cut", "whip", "lift", "fade", "shrink", "white", "leak"];

/**
 * The default panel: the frame's upper band, its bottom edge tucked ~0.085 H behind the presenter's head so it
 * reads as standing behind them (a depth composite, not an overlay). Same formula in viz-cards (card size).
 */
export function defaultPanel(W, H, layout) {
  const headTop = layout?.headTop ?? 0.41, overlap = 0.085;
  const bottom = (headTop + overlap) * H;
  const top = Math.max(0.07 * H, bottom - 0.321 * H);
  return { x: Math.round(0.07 * W), y: Math.round(top), w: Math.round(0.86 * W), h: Math.round(bottom - top), r: 64, bg: "#111111", safe: Math.round(bottom - top - (overlap * H + 12)) };
}

/**
 * One presenter placement as a CSS rule on the cutout (references/layouts.md § Presenter placements): the figure's
 * head top lands at `top` (× H), its height (head top → the matte's lowest point) becomes `height` (× H; or a plain
 * `scale`), its head centre at `x` (× W). `sticker: true` draws spec.sticker's outline around it (in the take's own
 * px, so it scales with the figure); `head: { h, w }` keeps only the head: a clip `h` below the head top and `w`
 * either side of the head centre, both in figure heights.
 */
export function presenterCss(name, pr, info, sticker) {
  const W = info.width, H = info.height, L = info.layout || {};
  const top = (L.headTop ?? 0.2) * H, fig = Math.max(1, ((L.bodyBottom ?? 1) - (L.headTop ?? 0.2)) * H), cx = (L.headCenterX ?? 0.5) * W;
  const sc = pr.height != null ? (pr.height * H) / fig : pr.scale ?? 1;
  const tx = (pr.x ?? 0.5) * W - sc * cx, ty = (pr.top != null ? pr.top * H : top) - sc * top;
  const rules = [`transform: matrix(${f3(sc)}, 0, 0, ${f3(sc)}, ${f3(tx)}, ${f3(ty)})`];
  if (pr.sticker && sticker) rules.push("filter: url(#sticker)");
  if (pr.head) {
    const t = Math.max(0, top - 0.05 * fig), b = top + pr.head.h * fig, l = cx - pr.head.w * fig, r = cx + pr.head.w * fig;
    rules.push(`clip-path: inset(${f3(t)}px ${f3(W - r)}px ${f3(H - b)}px ${f3(l)}px)`);
  }
  return `#cutout[data-p="${name}"] { ${rules.join("; ")}; }`;
}

/** With `hold`, close gaps so a panel is always on screen, except the `breathe` ranges. Off by default. */
function holdPanels(spec, D) {
  const all = [...(spec.panels || [])].sort((a, b) => a.start - b.start);
  if (!spec.hold) return all;
  // `over` layers are drawn on top of whatever is on screen: they never fill a gap
  const overs = all.filter((p) => p.layout === "over"), ps = all.filter((p) => p.layout !== "over");
  if (!ps.length) return all;
  const keep = (a, b) => (spec.breathe || []).some(([s, e]) => s < b && e > a);
  if (ps[0].start > 0.05 && !keep(0, ps[0].start)) ps[0].start = 0;
  for (let i = 0; i < ps.length - 1; i++) if (ps[i + 1].start - ps[i].end > 0.05 && !keep(ps[i].end, ps[i + 1].start)) ps[i].end = ps[i + 1].start;
  const last = ps[ps.length - 1];
  if (D - last.end > 0.05 && !keep(last.end, D)) (last.end = D), (last.out = "cut");
  return [...ps, ...overs];
}

/** Graded copy for an animated grade (no CSS filter grades on footage): bw (greyscale) | blur (heavy defocus). */
const GRADES = { bw: "hue=s=0", blur: "gblur=sigma=32:steps=2,eq=brightness=-0.03" };
async function gradedCopy(proj, rel, kind = "bw") {
  if (!GRADES[kind]) throw new Error(`grade "${kind}" is not one of ${Object.keys(GRADES).join(", ")}`);
  const isVid = VIDEO_EXT.includes(path.extname(rel).toLowerCase());
  const out = rel.replace(/(\.[^.]+)$/, isVid ? `.${kind}.mp4` : `.${kind}$1`);
  const absIn = path.join(proj, rel), absOut = path.join(proj, out);
  if (fs.existsSync(absOut) && fs.statSync(absOut).mtimeMs >= fs.statSync(absIn).mtimeMs) return out;
  if (isVid) await ffmpeg(["-i", absIn, "-an", "-vf", GRADES[kind], "-c:v", "libx264", "-crf", "16", "-g", "30", "-pix_fmt", "yuv420p", absOut]);
  else await ffmpeg(["-i", absIn, "-vf", GRADES[kind], "-frames:v", "1", absOut]);
  return out;
}

/** Entrance / exit tweens for a panel wrapper (exits finish exactly at `end`). */
function transitions(sel, p, s, e, rect, leaks) {
  const js = [];
  const off = rect.y + rect.h + 40;
  const inn = p.in || "cut", out = p.out || "cut";
  if (!IN.includes(inn)) throw new Error(`panel ${p.id}: in "${inn}" is not one of ${IN.join(", ")}`);
  if (!OUT.includes(out)) throw new Error(`panel ${p.id}: out "${out}" is not one of ${OUT.join(", ")}`);
  if (inn === "whip") js.push(`tl.fromTo("${sel}", { opacity: 1, x: -1150, filter: "blur(28px)" }, { x: 0, filter: "blur(0px)", duration: 0.36, ease: "expo.out", immediateRender: false }, ${s});`);
  else if (inn === "drop") js.push(`tl.fromTo("${sel}", { opacity: 1, y: -${off}, filter: "blur(14px)" }, { y: 0, filter: "blur(0px)", duration: 0.42, ease: "expo.out", immediateRender: false }, ${s});`);
  else if (inn === "fade") js.push(`tl.fromTo("${sel}", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out", immediateRender: false }, ${s});`);
  else if (inn === "pop") js.push(`tl.fromTo("${sel}", { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(1.4)", immediateRender: false }, ${s});`);
  else if (inn === "white") js.push(`tl.set("${sel}", { opacity: 1 }, ${s});`, `tl.fromTo("${sel} .flash", { opacity: 1 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, ${s});`);
  else js.push(`tl.set("${sel}", { opacity: 1 }, ${s});`);
  if (inn === "leak") leaks.push(s);
  if (out === "whip") js.push(`tl.fromTo("${sel}", { x: 0, filter: "blur(0px)" }, { x: 1150, filter: "blur(28px)", duration: 0.26, ease: "power3.in", immediateRender: false }, ${f3(e - 0.26)});`);
  else if (out === "lift") js.push(`tl.fromTo("${sel}", { y: 0, filter: "blur(0px)" }, { y: -${off}, filter: "blur(14px)", duration: 0.28, ease: "power3.in", immediateRender: false }, ${f3(e - 0.28)});`);
  else if (out === "fade") js.push(`tl.fromTo("${sel}", { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power2.in", immediateRender: false }, ${f3(e - 0.25)});`);
  else if (out === "shrink") js.push(`tl.fromTo("${sel}", { scale: 1, opacity: 1 }, { scale: 0.85, opacity: 0, duration: 0.22, ease: "power3.in", immediateRender: false }, ${f3(e - 0.22)});`);
  else if (out === "white") js.push(`tl.fromTo("${sel} .flash", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.in", immediateRender: false }, ${f3(e - 0.4)});`);
  if (out === "leak") leaks.push(e);
  js.push(`tl.set("${sel}", { opacity: 0 }, ${e});`);
  return js;
}

async function stage(proj, spec, info) {
  const W = info.width, H = info.height, D = f3(info.duration);
  const base = { ...defaultPanel(W, H, info.layout), ...(spec.panel || {}) };
  const frames = { ...FRAMES, ...(spec.frames || {}) };
  const scaleOf = (to) => (typeof to === "number" ? to : frames[to] ?? 1);
  const origin = spec.origin || `${((info.layout?.headCenterX ?? 0.5) * 100).toFixed(1)}% ${((info.layout?.faceY ?? 0.5) * 100).toFixed(1)}%`;
  const html = [], over = [], js = [], leaks = [], camShift = [];
  let track = 2;
  // layouts (references/layouts.md): behind (default: the slot behind the head) | card (brand background behind the
  // cutout, the media in a card above) — both inside the camera; full (covers the frame, presenter hidden) | split
  // (covers the top band; the camera slides the presenter down into the bottom part) | over (a transparent full-frame
  // layer on top of the presenter: drawings, labels) — screen-fixed, above the cutout
  const brand = { bg: "#16161a", ...(spec.brand || {}) }; // the template's brand.bg; neutral without one
  const cardBox = { x: Math.round(0.065 * W), y: Math.round(0.085 * H), w: Math.round(0.87 * W), h: Math.round(0.33 * H), r: 40, ...(brand.card || {}) };
  const splitH = Math.round((spec.split?.h ?? 0.5) * H);
  // split.media "top" (default): media above, the presenter slid down into the bottom part; "bottom": the reverse
  const mediaLow = spec.split?.media === "bottom";
  const splitShift = Math.round((mediaLow ? 0 : splitH) + (H - splitH) * (spec.split?.faceAt ?? 0.36) - (info.layout?.faceY ?? 0.42) * H);
  // window: a page (window.bg) fills the frame, the presenter shows through a window of it, framed on the face,
  // the media sits in its own box (window.panel) below
  const win = { x: 95, y: 104, w: 890, h: 503, r: 0, faceAt: 0.45, zoom: 1, bg: brand.bg, ...(spec.window || {}) };
  const winPanel = { x: win.x, y: win.y + win.h + 13, w: win.w, h: "auto", maxH: 980, r: 0, ...(win.panel || {}) };
  const winMove = (() => {
    const z = win.zoom, fx = (info.layout?.headCenterX ?? 0.5) * W, fy = (info.layout?.faceY ?? 0.42) * H;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    // the plate keeps covering the window: never slide its edge inside it
    const x = clamp(win.x + win.w / 2 - z * fx, win.x + win.w - z * W, win.x), y = clamp(win.y + win.h * win.faceAt - z * fy, win.y + win.h - z * H, win.y);
    return { x: Math.round(x), y: Math.round(y), scale: z };
  })();
  const winRanges = [];
  const presRanges = []; // [start, end, presenter] per panel with its own presenter placement (presenterCss below)
  const LAYOUTS = ["behind", "card", "full", "split", "over", "window"];

  for (const [i, p] of holdPanels(spec, D).entries()) {
    const id = String(p.id || `p${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
    const s = f3(p.start), e = f3(Math.min(p.end, D)), dur = f3(e - s);
    const layout = p.layout || "behind";
    if (!LAYOUTS.includes(layout)) throw new Error(`panel ${id}: layout "${layout}" is not one of ${LAYOUTS.join(", ")}`);
    const r = layout === "full" ? { x: 0, y: 0, w: W, h: H, r: 0, bg: "#000", ...(p.rect || {}) }
      : layout === "over" ? { x: 0, y: 0, w: W, h: H, r: 0, bg: "transparent", ...(p.rect || {}) }
      : layout === "split" ? { x: 0, y: mediaLow ? H - splitH : 0, w: W, h: splitH, r: 0, bg: "#000", ...(p.rect || {}) }
      : layout === "window" ? { bg: "#000", ...winPanel, ...(p.rect || {}) }
      : layout === "card" ? { ...cardBox, ...(p.rect || {}) }
      : { ...base, ...(p.rect || {}) };
    if (r.h === "auto") {
      // the box takes the media's own shape (a screen recording, a portrait still), up to maxH (then it crops)
      const v = p.src ? (await probe(path.join(proj, localize(proj, p.src)))).video : null;
      r.h = Math.round(Math.min(r.maxH ?? H, v ? (r.w * v.height) / v.width : r.maxH ?? H));
    }
    const outer = layout === "full" || layout === "split" || layout === "over" || layout === "window";
    // panels stack by start time; `z` lifts one above later ones (a screen panel spanning two layout cards)
    const z = p.z ?? (outer ? 200 + 2 * i : 10 + i);
    const box = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border-radius:${r.r}px;z-index:${z}${layout === "card" ? ";box-shadow:0 24px 60px rgba(60,25,0,0.35)" : ""}`;
    if (layout === "split") camShift.push([s, e]);
    if (layout === "window") winRanges.push([s, e]);
    if (p.presenter) presRanges.push([s, e, p.presenter, id]);
    if (p.backdrop) {
      // a colour over the whole frame behind the panel for its stay (a clip shown smaller than the frame, on black)
      over.push(`<div id="bd-${id}" class="panel" style="left:0;top:0;width:${W}px;height:${H}px;z-index:${z - 1};background:${p.backdrop}"></div>`);
      js.push(`tl.set("#bd-${id}", { opacity: 1 }, ${s});`, `tl.set("#bd-${id}", { opacity: 0 }, ${e});`);
    }
    if (layout === "card" && brand.plate) {
      // a green-screen take keyed onto the brand background (brand.plate): swapped in under the card, clean edges
      js.push(`tl.set("#bplate", { opacity: 1 }, ${s});`, `tl.set("#bplate", { opacity: 0 }, ${e});`);
    } else if (layout === "card") {
      // else the brand background covers the plate for the card's stay (the matted cutout stays in front of it)
      html.push(`<div id="bg-${id}" class="panel brandbg" style="left:0;top:0;width:${W}px;height:${H}px;z-index:${9 + i};background:${brand.bg}"></div>`);
      js.push(`tl.set("#bg-${id}", { opacity: 1 }, ${s});`, `tl.set("#bg-${id}", { opacity: 0 }, ${e});`);
    }
    const push = (markup) => (outer ? over : html).push(markup);
    let inner;
    if (p.comp) {
      // a sub-composition (viz-cards, ui-demo …): its own timeline runs from the panel's start
      const src = p.comp.endsWith(".html") ? p.comp : `compositions/${p.comp}.html`;
      if (!fs.existsSync(path.join(proj, src))) throw new Error(`panel ${id}: ${src} does not exist (make it with viz-cards or ui-demo first)`);
      // the host's id must be the file's own composition id (else its timeline is never found)
      const cid = fs.readFileSync(path.join(proj, src), "utf8").match(/data-composition-id="([^"]+)"/)?.[1];
      if (!cid) throw new Error(`panel ${id}: ${src} has no data-composition-id`);
      inner = `<div id="${cid}" data-composition-id="${cid}" data-composition-src="${src}" data-start="${s}" data-duration="${dur}" data-track-index="${track}" data-width="${r.w}" data-height="${r.h}"></div>`;
      push(`<div id="p-${id}" class="panel" style="${box};background:transparent">\n  ${inner}\n  <div class="flash"></div>\n</div>`);
    } else {
      if (!p.src) throw new Error(`panel ${id}: needs src (an image/video) or comp (a sub-composition)`);
      const src = localize(proj, p.src);
      const ext = path.extname(src).toLowerCase();
      if (!IMAGE_EXT.includes(ext) && !VIDEO_EXT.includes(ext) && ext !== ".gif") throw new Error(`panel ${id}: unsupported media ${src}`);
      const pos = p.focus ? ` style="object-position:${esc(p.focus)}"` : "";
      const media = (cls, file, mid) => VIDEO_EXT.includes(ext)
        ? `<video id="${mid}" class="${cls} clip" src="${file}" data-start="${s}" data-duration="${dur}"${p.mediaStart ? ` data-media-start="${f3(p.mediaStart)}"` : ""} data-track-index="${track}" muted playsinline${pos}></video>`
        : `<img id="${mid}" class="${cls} clip" src="${file}" alt="" data-start="${s}" data-duration="${dur}" data-track-index="${track}"${pos} />`;
      const parts = [media("m", src, `p-${id}-m`)];
      // a still never sits dead when the spec asks for drift: a slow push over its whole stay
      const drift = p.drift ?? spec.drift;
      if (drift && IMAGE_EXT.includes(ext)) js.push(`tl.fromTo("#p-${id}-m", { scale: 1 }, { scale: ${typeof drift === "number" ? drift : 1.07}, duration: ${dur}, ease: "none", immediateRender: false }, ${s});`);
      if (p.grade?.to) {
        // the graded copy fades in over the original (dur 0: graded from `at` on, e.g. a B&W montage)
        parts.push(media("m bw", await gradedCopy(proj, src, p.grade.to), `p-${id}-bw`));
        js.push(`tl.fromTo("#p-${id}-bw", { opacity: 0 }, { opacity: 1, duration: ${f3(p.grade.dur ?? 0.5)}, ease: "power1.inOut", immediateRender: false }, ${f3(p.grade.at ?? s)});`);
      }
      push(`<div id="p-${id}" class="panel" style="${box};background:${r.bg}">\n  ${parts.join("\n  ")}\n  <div class="flash"></div>\n</div>`);
    }
    js.push(`// ${id} (${layout})`, ...transitions(`#p-${id}`, p, s, e, r, leaks));
    track = track === 4 ? 2 : track + 1;
  }
  // split panels: the camera slides the presenter down into the bottom part while one is on screen
  const shiftJs = camShift.flatMap(([s, e]) => [`tl.set("#cam", { y: ${splitShift} }, ${s});`, `tl.set("#cam", { y: 0 }, ${e});`]);
  // (an end at the same time as the next split's start is written first, so the next one wins)
  // window panels: the page shows, the presenter is clipped to the window and moved to sit in it (back-to-back
  // window panels are one stay, so the window never blinks between them)
  const winStays = winRanges.sort((a, b) => a[0] - b[0]).reduce((acc, [s, e]) => {
    const last = acc[acc.length - 1];
    if (last && s - last[1] < 0.02) last[1] = Math.max(last[1], e); else acc.push([s, e]);
    return acc;
  }, []);
  const clipIn = `inset(${win.y}px ${W - win.x - win.w}px ${H - win.y - win.h}px ${win.x}px round ${win.r}px)`;
  for (const [s, e] of winStays) shiftJs.push(
    `tl.set("#page", { opacity: 1 }, ${s});`, `tl.set("#clip", { clipPath: "${clipIn}" }, ${s});`,
    `tl.set("#win", { x: ${winMove.x}, y: ${winMove.y}, scale: ${winMove.scale} }, ${s});`,
    `tl.set("#page", { opacity: 0 }, ${e});`, `tl.set("#clip", { clipPath: "inset(0px 0px 0px 0px round 0px)" }, ${e});`,
    `tl.set("#win", { x: 0, y: 0, scale: 1 }, ${e});`);
  // presenter placements: panels with `presenter` move the cutout alone (the panels stay put); spec.presenter is
  // the placement between them. A placement is a name in spec.presenters or an object (presenterCss)
  const presets = spec.presenters || {};
  const presOf = (v, name) => {
    if (typeof v !== "string") return [name, v];
    if (!presets[v]) throw new Error(`presenter "${v}" is not in presenters (${Object.keys(presets).join(", ") || "none defined"})`);
    return [v, presets[v]];
  };
  const presCss = new Map();
  const [defName, defPres] = spec.presenter ? presOf(spec.presenter, "default") : ["", null];
  if (defPres) presCss.set(defName, presenterCss(defName, defPres, info, spec.sticker));
  const presJs = presRanges.length || defPres ? [`tl.set("#cutout", { attr: { "data-p": "${defName}" } }, 0);`] : [];
  for (const [s, e, v, id] of presRanges.sort((a, b) => a[0] - b[0])) {
    const [name, pr] = presOf(v, `p-${id}`);
    if (!presCss.has(name)) presCss.set(name, presenterCss(name, pr, info, spec.sticker));
    presJs.push(`tl.set("#cutout", { attr: { "data-p": "${name}" } }, ${s});`, `tl.set("#cutout", { attr: { "data-p": "${defName}" } }, ${e});`);
  }
  shiftJs.push(...presJs);
  const useSticker = spec.sticker && [...presCss.values()].some((c) => c.includes("#sticker"));
  // boil: the outline's edge is pushed by a noise field whose seed steps `boilFps` times a second, so it
  // keeps moving like a hand-cut line even when the presenter is still (only the outline: the person is
  // composited on top untouched). Seeds cycle through a few drawings, set on the timeline (seek-safe).
  const boil = useSticker ? (spec.sticker.boil ?? 3) : 0;
  const boilFx = boil > 0
    ? `<feTurbulence id="sticker-noise" type="fractalNoise" baseFrequency="${spec.sticker.boilFreq ?? 0.025}" numOctaves="2" seed="1" result="n"/><feDisplacementMap in="d" in2="n" scale="${boil * 2}" xChannelSelector="R" yChannelSelector="G" result="dj"/>`
    : "";
  const stickerSvg = useSticker
    ? `<svg width="0" height="0" style="position:absolute"><filter id="sticker" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="${spec.sticker.width ?? 12}" result="d"/>${boilFx}<feGaussianBlur in="${boil > 0 ? "dj" : "d"}" stdDeviation="${spec.sticker.soft ?? 1.2}" result="b"/><feFlood flood-color="${spec.sticker.color ?? "#F6F1B4"}"/><feComposite in2="b" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></svg>`
    : "";
  if (boil > 0) {
    const fps = spec.sticker.boilFps ?? 8, n = Math.ceil(info.duration * fps);
    for (let k = 0; k <= n; k++) shiftJs.push(`tl.set("#sticker-noise", { attr: { seed: ${1 + (k % 5)} } }, ${f3(k / fps)});`);
  }

  // camera: framings by scale around the face; an optional intro push-in that lands under a flash
  let cam = [...(spec.camera || [{ t: 0, to: "wide" }])].sort((a, b) => a.t - b.t);
  const first = scaleOf(cam[0]?.t === 0 ? cam[0].to : "wide");
  const camJs = [`tl.set("#cam", { scale: ${first} }, 0);`];
  let prev = first;
  const intro = spec.intro && typeof spec.intro === "object" ? spec.intro : null;
  if (intro?.end) {
    const zoom = intro.zoom ?? frames.punch;
    const during = cam.filter((ev) => ev.t > 0 && ev.t < intro.end);
    if (during.length) log(`intro: camera event(s) at ${during.map((ev) => ev.t).join(", ")} s fall inside the push-in and are ignored`);
    const at = [...cam].reverse().find((ev) => ev.t <= intro.end);
    camJs.splice(0, 1, `tl.set("#cam", { scale: 1 }, 0);`, `tl.fromTo("#cam", { scale: 1 }, { scale: ${zoom}, duration: ${f3(intro.end)}, ease: "power1.in", immediateRender: false }, 0);`);
    prev = scaleOf(at?.to ?? "wide");
    camJs.push(`tl.set("#cam", { scale: ${prev} }, ${f3(intro.end)});`);
    cam = cam.filter((ev) => ev.t > intro.end);
    if (![...leaks, ...(spec.leaks || [])].some((t) => Math.abs(t - intro.end) < 0.05)) log(`intro: nothing flashes at ${intro.end}s: the push-in should land under a leak (panel in/out "leak", or leaks: [${intro.end}])`);
  }
  for (const ev of cam) {
    if (ev.t === 0 && ev === cam[0]) continue;
    const sc = scaleOf(ev.to);
    if (ev.move === "ease") camJs.push(`tl.fromTo("#cam", { scale: ${prev} }, { scale: ${sc}, duration: ${f3(ev.dur ?? 0.6)}, ease: "power2.inOut", immediateRender: false }, ${f3(ev.t)});`);
    else camJs.push(`tl.set("#cam", { scale: ${sc} }, ${f3(ev.t)});`);
    prev = sc;
  }
  const papers = paperTimes(spec);
  const seamsUncut = (info.seams || []).filter((s) => !(spec.camera || []).some((c) => Math.abs(c.t - s) < 0.1) && ![...leaks, ...(spec.leaks || []), ...papers].some((t) => Math.abs(t - s) < 0.3));
  if (seamsUncut.length) log(`! seam(s) at ${seamsUncut.join(", ")}s have no camera cut or leak: the pose jumps there (references/seam-cut.md)`);

  fs.mkdirSync(path.join(proj, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(proj, "compositions", "stage.html"), `<!doctype html>
<html>
  <body>
    <template>
      <style>
      #root { position: absolute; inset: 0; overflow: hidden; background: #000; }
      #page { position: absolute; inset: 0; background: ${win.bg}; opacity: 0; }
      #clip, #win { position: absolute; inset: 0; }
      #win { transform-origin: 0 0; }
      #cam { position: absolute; inset: 0; transform-origin: ${origin}; }
      #plate, #bplate, #cutout { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      #cutout { z-index: 100; transform-origin: 0 0; }
      ${[...presCss.values()].join("\n      ")}
      .panel { position: absolute; overflow: hidden; opacity: 0; }
      .panel .m { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
      .panel .bw { opacity: 0; }
      .panel .flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
      </style>
      <div id="root" data-composition-id="stage" data-width="${W}" data-height="${H}" data-layout-allow-overlap>${winStays.length ? `
        <div id="page"></div>` : ""}
        <div id="clip"><div id="win">
        <div id="cam">
          <video id="plate" class="clip" src="${info.plate}" data-start="0" data-duration="${D}" data-track-index="0" muted playsinline></video>${brand.plate ? `
          <video id="bplate" class="clip" src="${brand.plate}" data-start="0" data-duration="${D}" data-track-index="5" muted playsinline style="z-index:5;opacity:0"></video>` : ""}
${html.join("\n").replace(/^/gm, "          ")}
          <video id="cutout" class="clip" src="${info.cutout}" data-start="0" data-duration="${D}" data-track-index="1" muted playsinline data-layout-allow-occlusion${defName ? ` data-p="${defName}"` : ""}></video>${stickerSvg}
        </div>
        </div></div>
${over.join("\n").replace(/^/gm, "        ")}
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.to({}, { duration: ${D} }, 0);
        // camera
        ${camJs.join("\n        ")}
        ${shiftJs.join("\n        ")}
        // panels
        ${js.join("\n        ")}
        window.__timelines["stage"] = tl;
      </script>
    </template>
  </body>
</html>
`);
  return { leaks, panel: base, intro };
}

/** Warm light leak + white bloom (screen blend), one flash per time. Adapted from registry block organic-light-leak-overlay. */
function fx(proj, spec, info, panelLeaks, intro, words) {
  const D = f3(info.duration);
  const times = [...(spec.leaks || []).map((l) => (typeof l === "number" ? l : l.t)), ...panelLeaks].sort((a, b) => a - b);
  const leaks = times.filter((t, i) => i === 0 || t - times[i - 1] > 0.3);
  const js = [];
  for (const t of leaks) {
    const a = f3(Math.max(0, t - 0.16));
    // the intro's flash clears before the next word (a full 0.42 s fade lingered over the next sentence)
    const next = words.find((w) => w.start > t + 0.05)?.start;
    const fade = intro && Math.abs(t - intro.end) < 0.05 && next ? f3(Math.min(0.42, Math.max(0.15, next - t - 0.1))) : 0.42;
    js.push(`// leak @ ${f3(t)}`,
      `tl.fromTo("#leak", { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "power2.out", immediateRender: false }, ${a});`,
      `tl.fromTo("#leak", { opacity: 1 }, { opacity: 0, duration: ${fade}, ease: "sine.in", immediateRender: false }, ${f3(t + 0.08)});`,
      `tl.fromTo("#bloom", { opacity: 0 }, { opacity: 0.92, duration: 0.14, ease: "power2.out", immediateRender: false }, ${a});`,
      `tl.fromTo("#bloom", { opacity: 0.92 }, { opacity: 0, duration: ${f3(Math.min(0.3, fade))}, ease: "power2.in", immediateRender: false }, ${f3(t + 0.02)});`,
      `tl.fromTo("#leak .amber", { xPercent: -22, rotation: -4 }, { xPercent: 18, rotation: 2, duration: 0.75, ease: "sine.inOut", immediateRender: false }, ${a});`,
      `tl.fromTo("#leak .gold", { xPercent: -28 }, { xPercent: 24, duration: 0.75, ease: "sine.inOut", immediateRender: false }, ${a});`);
  }
  // paper passes (panel in "paper"): a torn sheet sweeps up over the whole frame, covers it at the cut, lifts off
  const papers = paperTimes(spec);
  const W = info.width, H = info.height, SH = Math.round(H * 1.25);
  for (const [k, t] of papers.entries()) {
    const id = `#paper-${k}`;
    js.push(`// paper @ ${f3(t)}`,
      `tl.set("${id}", { opacity: 1 }, ${f3(t - 0.32)});`,
      `tl.fromTo("${id}", { y: ${H + 120}, rotation: -7 }, { y: ${-Math.round((SH - H) / 2)}, rotation: -2, duration: 0.32, ease: "power3.in", immediateRender: false }, ${f3(t - 0.32)});`,
      `tl.fromTo("${id}", { y: ${-Math.round((SH - H) / 2)}, rotation: -2 }, { y: ${-SH - 160}, rotation: 3, duration: 0.45, ease: "power2.out", immediateRender: false }, ${f3(t + 0.02)});`,
      `tl.set("${id}", { opacity: 0 }, ${f3(t + 0.47)});`);
  }
  const paperHtml = papers.map((_, k) => paperSheet(`paper-${k}`, W, SH, 7 + k * 13)).join("\n");
  fs.writeFileSync(path.join(proj, "compositions", "fx.html"), `<!doctype html>
<html>
  <body>
    <template>
      <style>
      #root { position: absolute; inset: 0; pointer-events: none; }
      #leak { position: absolute; inset: -16%; opacity: 0; overflow: hidden; mix-blend-mode: screen; }
      #leak .layer { position: absolute; inset: -20%; }
      #leak .amber { background: radial-gradient(ellipse 52% 110% at 14% 58%, rgb(255 241 197 / 92%), transparent 45%),
          radial-gradient(ellipse 72% 120% at 26% 54%, rgb(255 126 57 / 80%), transparent 66%); filter: blur(40px); }
      #leak .red { background: radial-gradient(ellipse 58% 105% at 80% 30%, rgb(255 92 61 / 62%), rgb(255 44 92 / 24%) 48%, transparent 76%); filter: blur(60px); }
      #leak .gold { background: linear-gradient(104deg, transparent 24%, rgb(255 144 62 / 30%) 40%, rgb(255 247 205 / 78%) 51%, rgb(255 124 48 / 22%) 62%, transparent 78%); filter: blur(30px); }
      .paper { position: absolute; left: -80px; top: 0; opacity: 0; filter: drop-shadow(0 -10px 22px rgb(0 0 0 / 22%)) drop-shadow(0 12px 22px rgb(0 0 0 / 18%)); }
      #bloom { position: absolute; inset: 0; opacity: 0; mix-blend-mode: screen;
        background: radial-gradient(ellipse 90% 70% at 50% 42%, rgb(255 255 255 / 100%), rgb(255 246 230 / 85%) 45%, rgb(255 200 150 / 40%) 75%, transparent 100%); }
      </style>
      <div id="root" data-composition-id="fx" data-width="${info.width}" data-height="${info.height}" data-layout-ignore>
        <div id="leak"><div class="layer amber"></div><div class="layer red"></div><div class="layer gold"></div></div>
        <div id="bloom"></div>
${paperHtml}
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.to({}, { duration: ${D} }, 0);
        ${js.join("\n        ")}
        window.__timelines["fx"] = tl;
      </script>
    </template>
  </body>
</html>
`);
  return leaks;
}

/** Panel starts that come in under a paper pass (in: "paper"). */
export function paperTimes(spec) {
  return (spec.panels || []).filter((p) => p.in === "paper").map((p) => p.start).sort((a, b) => a - b);
}

/** A sheet of off-white paper, torn along the top and bottom edges (a seeded jagged path with a thin fibre rim),
 *  with a faint grain: the paper pass. Drawn wider than the frame (it tilts while it moves). */
function paperSheet(id, W, H, seed) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const w = W + 160, step = 22, edge = (y0, dir) => {
    const pts = [];
    for (let x = 0; x <= w; x += step) pts.push([x, y0 + dir * (rnd() * 26 + (rnd() < 0.18 ? rnd() * 22 : 0))]);
    return pts;
  };
  const top = edge(40, 1), bot = edge(H - 40, -1).reverse();
  const d = "M" + [...top, ...bot].map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" L") + " Z";
  return `<svg id="${id}" class="paper" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">` +
    `<defs><filter id="${id}-g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.47  0 0 0 0.06 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>` +
    `<path d="${d}" fill="#E9E5DC"/><path d="${d}" fill="#FBFAF6" transform="translate(0 0) scale(1 0.994) translate(0 ${(H * 0.003).toFixed(1)})"/>` +
    `<path d="${d}" fill="#000" filter="url(#${id}-g)"/></svg>`;
}

/** Every leak time of a shots.json (leaks + panel in/out "leak"): for the sound skill's cues. */
export function leakTimes(spec) {
  const t = [...(spec.leaks || []).map((l) => (typeof l === "number" ? l : l.t)),
    ...(spec.panels || []).flatMap((p) => [p.in === "leak" ? p.start : null, p.out === "leak" ? p.end : null])].filter((x) => x != null).sort((a, b) => a - b);
  return t.filter((x, i) => i === 0 || x - t[i - 1] > 0.3);
}

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "shots.mjs <project> [--draft]");
  const info = talkingInfo(proj);
  if (!info) throw new NeedsInput(`${path.relative(ROOT, proj)}/talking.json is missing: prepare the clip with the talking-head skill (prep.mjs) first.`);
  const specPath = path.join(proj, "shots.json");
  if (args.draft || !fs.existsSync(specPath)) {
    if (fs.existsSync(specPath) && !args.force) throw new NeedsInput("shots.json exists: edit it, or pass --draft --force to overwrite it.");
    const camera = [{ t: 0, to: "wide" }, ...(info.seams || []).map((s, i) => ({ t: s, to: i % 2 ? "wide" : "punch", move: "cut", note: "hides the seam" }))];
    writeJson(specPath, { camera, panels: [], leaks: [] });
    log(`draft shots.json: wide, a cut on each of ${info.seams?.length || 0} seam(s). Panel slot: ${JSON.stringify(defaultPanel(info.width, info.height, info.layout))}`);
    if (args.draft) return;
  }
  // the template's brand and shots section are defaults under shots.json (references/layouts.md)
  const raw = readJson(specPath), fmt = loadFormat(proj, raw);
  const spec = underlay(underlay({ brand: fmt.brand || {} }, fmt.shots || {}), raw);
  ensureIndex(proj, { width: info.width, height: info.height, duration: info.duration });
  const words = readJson(path.join(proj, "transcript.json"), []);
  const { leaks: pl, panel, intro } = await stage(proj, spec, info);
  const leaks = fx(proj, spec, info, pl, intro, words);
  hostBlock(proj, "stage", { z: 1, track: 1 });
  hostBlock(proj, "fx", { z: 3, track: 3 });
  log(`stage: ${(spec.panels || []).length} panel(s), ${(spec.camera || []).length} camera event(s), ${leaks.length} leak(s)${intro ? `, intro push-in to ${intro.end}s` : ""}; panel slot ${panel.w}×${panel.h}@${panel.x},${panel.y} (safe height ${panel.safe}px)`);
}

if (isMain(import.meta.url)) main().catch(exitOnError);
