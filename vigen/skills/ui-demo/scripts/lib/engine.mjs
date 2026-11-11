// UI demo engine: a static mock screen (HTML + CSS, no script) + a list of steps -> a seek-safe GSAP
// walkthrough (virtual camera that pans/zooms, a 3D tilt of the whole screen, a cursor that moves, hovers
// and clicks, typing, pasting, modals, components lifted off the screen, highlight rings with labels,
// key badges).
//
//   uiDemo(spec, ctx) -> { html, css, js, bg, events }
//     spec: { screen, steps[], view?, tilt?, cursor?, hover?, shown?, hidden?, bg?, maxZoom? }   (see SKILL.md)
//     ctx:  { id, s, e, w, h, sh?, accent?, readFile(rel) }   s/e = start/end seconds on the timeline `tl`,
//           w×h = the box the demo fills, sh = how much of it from the top is unobstructed (default h)
//
// The screen is laid out once in headless Chrome at build time: every step target is measured there, so
// the camera, cursor and ring positions are plain numbers in fromTo tweens — nothing is measured while
// rendering, nothing depends on the order frames are seeked in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "./chrome.mjs";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ACTIONS = ["focus", "click", "type", "paste", "show", "hide", "scroll", "highlight", "lift", "tilt", "text", "key", "wait"];
const NEEDS_TARGET = new Set(["click", "type", "paste", "show", "hide", "scroll", "highlight", "lift", "text"]);
// tilt: degrees around the card's x (lean back), y (turn) and z axes + a scale that shows the backdrop around it
const TILT_DEFAULT = { x: 14, y: -16, z: 3, scale: 0.84 };
const LIFT_TILT = { x: 16, y: -12, z: 2, scale: 0.94 }; // the screen while a component floats off it
const TILT_BG = "radial-gradient(120% 120% at 30% 0%, #f5f7fb 0%, #dfe4ec 58%, #c8d0dc 100%)";

const f3 = (n) => +Number(n).toFixed(3);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const UI_FONT = `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const TAG_FONT = `"Be Vietnam Pro", ${UI_FONT}`;
const CURSOR_SVG = `<svg width="26" height="34" viewBox="0 0 26 34"><path d="M2 2 L2 27 L8.6 21 L13 31.5 L17.6 29.6 L13.3 19.4 L22 19.4 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
// pointing hand shown while hovering something clickable; fingertip at (10, 2.5), drawn so it lands on the arrow's tip
const HAND_SVG = `<svg width="28" height="32" viewBox="0 0 28 32"><path d="M10 2.5c-1.4 0-2.5 1.1-2.5 2.5v12.2l-1.6-1.7c-1-1-2.6-1.1-3.6-.2-1 .9-1.1 2.4-.3 3.5l5.4 7.4c1.5 2.1 3.9 3.3 6.5 3.3h3.6c4.1 0 7.5-3.4 7.5-7.5v-7c0-1.4-1.1-2.5-2.5-2.5s-2.5 1.1-2.5 2.5v-1c0-1.4-1.1-2.5-2.5-2.5s-2.5 1.1-2.5 2.5v-1c0-1.4-1.1-2.5-2.5-2.5-.6 0-1.1.2-1.5.5V5c0-1.4-1.1-2.5-2.5-2.5Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

export function listScreens() {
  const dir = path.join(SKILL_DIR, "screens");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")) : [];
}

/** "chatgpt-project" -> the skill's screens/chatgpt-project.html; anything with a slash or .html -> readFile(ref). */
export function loadScreen(ref, readFile) {
  if (!ref) throw new Error(`ui demo needs "screen": a built-in name (${listScreens().join(", ")}) or a path like ui/app.html`);
  if (!/[/\\]|\.html?$/i.test(ref)) {
    const p = path.join(SKILL_DIR, "screens", `${ref}.html`);
    if (!fs.existsSync(p)) throw new Error(`no built-in screen "${ref}" (have: ${listScreens().join(", ") || "none"})`);
    return fs.readFileSync(p, "utf8");
  }
  return readFile(ref);
}

function splitScreen(raw) {
  if (/<script/i.test(raw)) throw new Error("a screen is static markup + <style>: no <script> (all motion comes from steps)");
  const css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const markup = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (/@keyframes|animation\s*:/i.test(css)) throw new Error("screen CSS has animations: they are not seek-safe; use steps");
  return { css, markup };
}

/** Engine CSS + the screen's CSS nested under the card's scope class (native CSS nesting). */
function demoCss(scope, screenCss, accent) {
  const S = `.${scope}`;
  return `
      ${S} { position: absolute; inset: 0; overflow: hidden; perspective: 1800px; }
      :where(${S}, ${S} *) { margin: 0; padding: 0; box-sizing: border-box; }
      ${S} .uid-tilt { position: absolute; inset: 0; transform-style: preserve-3d; }
      ${S} .uid-cam { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform-style: preserve-3d; }
      ${S} .uid-dim { position: absolute; left: 0; top: 0; z-index: 990; background: rgb(10,14,22); opacity: 0; pointer-events: none; }
      ${S} .uid-cast { position: absolute; z-index: 991; background: rgba(0,0,0,0.5); filter: blur(16px); opacity: 0; pointer-events: none; }
      ${S} .uid-float { position: absolute; z-index: 992; opacity: 0; pointer-events: none; }
      ${S} .uid-float > :first-child { position: absolute; left: 0; top: 0; margin: 0; }
      ${S} .uid-cur > span { position: absolute; left: 0; top: 0; }
      ${S} .uid-cur > .uid-hand { left: -8px; top: -0.5px; opacity: 0; }
      ${S} .uid-hv { position: absolute; z-index: 996; background: rgba(120,120,120,0.16); opacity: 0; pointer-events: none; }
      ${S} :where(.uid-cam > :first-child) { position: relative; overflow: hidden; font-family: ${UI_FONT}; font-size: 14px;
        font-weight: 400; line-height: 1.45; letter-spacing: normal; color: #0d0d0d; text-align: left; }
      ${S} :where([data-off]) { opacity: 0; }
      ${S} :where(.uid-ph) { color: #8f8f8f; }
      ${S} :where(.uid-sk) { display: block; height: 0.6em; margin: 0.5em 0; border-radius: 0.3em; background: currentColor; opacity: 0.16; }
      ${S} .uid-caret { display: inline-block; width: 2px; height: 1.15em; margin-left: 1px; vertical-align: -0.2em; background: currentColor; }
      ${S} .uid-cur { position: absolute; left: 0; top: 0; width: 26px; height: 34px; z-index: 1003; transform-origin: 2px 2px;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
      ${S} .uid-rip { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; z-index: 1002;
        background: ${accent}; opacity: 0; }
      ${S} .uid-ring { position: absolute; z-index: 1000; border: 4px solid ${accent}; box-shadow: 0 0 0 6px ${accent}38; opacity: 0; }
      ${S} .uid-tag { position: absolute; z-index: 1001; transform: translateX(-50%); background: ${accent}; color: #fff; font-family: ${TAG_FONT};
        font-weight: 800; line-height: 1.1; padding: 0.35em 0.7em; border-radius: 0.5em; white-space: nowrap; opacity: 0;
        box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
      ${S} .uid-key { position: absolute; right: 30px; top: 30px; z-index: 1004; background: rgba(17,17,17,0.88); color: #fff;
        font-family: ${TAG_FONT}; font-weight: 800; font-size: 38px; line-height: 1; padding: 16px 24px; border-radius: 20px; opacity: 0;
        box-shadow: 0 10px 24px rgba(0,0,0,0.35); }
      ${S} {
${screenCss}
      }`;
}

/** The page Chrome lays out once: tags every target with data-uk, prepares text slots, measures boxes. */
function measurePage(scope, css, markup, job) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 2400px; height: 1800px; overflow: hidden; }
${css}
</style></head><body>
<div class="${scope}"><div class="uid-cam">${markup}</div></div>
<pre id="__out"></pre>
<script>
(() => {
  const JOB = ${JSON.stringify(job)};
  const root = document.querySelector(".uid-cam").firstElementChild;
  const q = (sel) => { if (sel === "screen") return [root]; try { return [...root.querySelectorAll(sel)]; } catch { return []; } };
  for (const sel of JOB.shown) q(sel).forEach((e) => e.removeAttribute("data-off"));
  for (const sel of JOB.hidden) q(sel).forEach((e) => e.setAttribute("data-off", ""));
  // items that get inserted into a list (data-off + data-grow) start collapsed: no gap before they appear
  root.querySelectorAll("[data-grow][data-off]").forEach((e) => {
    e.setAttribute("data-grow-h", e.offsetHeight);
    Object.assign(e.style, { height: "0px", minHeight: "0px", overflow: "hidden" });
  });
  // every field's placeholder is drawn (absolute, so typed text starts where the placeholder starts)
  root.querySelectorAll("[data-placeholder]").forEach((el) => {
    if (el.querySelector(":scope > .uid-ph")) return;
    const ph = document.createElement("span"); ph.className = "uid-ph"; ph.textContent = el.getAttribute("data-placeholder");
    el.prepend(ph);
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const er = el.getBoundingClientRect(), r = ph.getBoundingClientRect(), padR = parseFloat(getComputedStyle(el).paddingRight) || 0;
    const x = r.left - er.left - el.clientLeft, y = r.top - er.top - el.clientTop;
    Object.assign(ph.style, { position: "absolute", left: x + "px", top: y + "px", width: Math.max(r.width, el.clientWidth - x - padR) + "px" });
  });
  const R = root.getBoundingClientRect();
  const out = { w: R.width, h: R.height, bg: getComputedStyle(root).backgroundColor, boxes: [], missing: [], inside: [], fonts: [], overflow: [], radius: [], under: [], clones: [] };
  const clear = (c) => !c || c === "transparent" || /rgba\\([^)]*,\\s*0\\)$/.test(c);
  const first = [];
  JOB.targets.forEach((sel, k) => {
    if (sel == null) { out.boxes.push(null); first.push(null); return; }
    const els = q(sel);
    if (!els.length) { out.boxes.push(null); first.push(null); out.missing.push(sel); return; }
    els.forEach((e) => e.setAttribute("data-uk", ((e.getAttribute("data-uk") || "") + " " + k).trim()));
    const r = els[0].getBoundingClientRect(), gh = els[0].getAttribute("data-grow-h");
    out.boxes.push({ x: r.left - R.left, y: r.top - R.top, w: r.width, h: gh ? +gh : r.height, n: els.length, grow: gh ? +gh : 0 });
    // smallest text size inside the target (for the readability check)
    const sizes = [els[0], ...els[0].querySelectorAll("*")].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => parseFloat(getComputedStyle(n).fontSize));
    out.fonts[k] = sizes.length ? Math.min(...sizes) : parseFloat(getComputedStyle(els[0]).fontSize);
    out.radius[k] = parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) || 0;
    // a lifted element with no background of its own gets the colour it sits on, so it reads as a chip
    let n = els[0];
    while (n && clear(getComputedStyle(n).backgroundColor) && n !== root) n = n.parentElement;
    out.under[k] = clear(getComputedStyle(els[0]).backgroundColor) ? (n && !clear(getComputedStyle(n).backgroundColor) ? getComputedStyle(n).backgroundColor : "#ffffff") : null;
    first.push(els[0]);
  });
  // which scroll targets contain each target (their scroll moves it)
  first.forEach((el, k) => out.inside.push(el ? JOB.scrolls.filter((j) => first[j] && first[j] !== el && first[j].contains(el)) : []));
  // text slots: placeholder span (from data-placeholder), original content wrapper, the typed/pasted span
  JOB.slots.forEach(({ k, kind, html, replace }) => {
    const el = first[k]; if (!el) return;
    if (replace && !el.querySelector(":scope > .uid-orig")) {
      const o = document.createElement("span"); o.className = "uid-orig";
      [...el.childNodes].filter((n) => !(n.classList && (n.classList.contains("uid-ph") || n.classList.contains("uid-in")))).forEach((n) => o.appendChild(n));
      el.appendChild(o);
    }
    // placeholder / replaced text stay where they were drawn but leave the flow, so new text starts at the start
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const er = el.getBoundingClientRect(), padR = parseFloat(getComputedStyle(el).paddingRight) || 0;
    el.querySelectorAll(":scope > .uid-ph, :scope > .uid-orig").forEach((n) => {
      if (n.style.position === "absolute") return;
      const r = n.getBoundingClientRect();
      const x = r.left - er.left - el.clientLeft, y = r.top - er.top - el.clientTop; // absolute = from the padding box
      Object.assign(n.style, { position: "absolute", left: x + "px", top: y + "px", width: Math.max(r.width, el.clientWidth - x - padR) + "px" });
    });
    const s = document.createElement("span"); s.className = "uid-in"; s.setAttribute("data-in", k);
    s.innerHTML = html;
    el.appendChild(s);
    out.overflow[k] = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1; // the full text doesn't fit
    if (kind === "paste") s.style.opacity = "0"; else s.innerHTML = "";
  });
  // lift: the target leaves the screen as a copy of its own DOM with every computed style inlined (it is
  // drawn outside its CSS context), holding the text typed/pasted into it before the lift
  const base = {};
  const SVGNS = "http://www.w3.org/2000/svg";
  const baseline = (n) => {
    const key = n.namespaceURI + n.tagName;
    if (base[key]) return base[key];
    const host = n.namespaceURI === SVGNS && n.tagName.toLowerCase() !== "svg" ? document.body.appendChild(document.createElementNS(SVGNS, "svg")) : document.body;
    const d = host.appendChild(document.createElementNS(n.namespaceURI, n.tagName));
    const cs = getComputedStyle(d), o = {};
    for (const p of cs) o[p] = cs.getPropertyValue(p);
    d.remove(); if (host !== document.body) host.remove();
    return (base[key] = o);
  };
  const KEEP = ["font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "color", "text-align", "white-space", "visibility", "fill", "stroke"];
  const SKIP = /^(transition|animation|will-change|cursor|pointer-events|user-select|-webkit-user|caret|outline|perspective|transform|translate|rotate|scale|view-transition|inset|top|right|bottom|left|position|z-index|opacity|margin)/;
  const inline = (o, c) => {
    const cs = getComputedStyle(o), b = baseline(o);
    let css = "";
    for (const p of cs) { const v = cs.getPropertyValue(p); if (!SKIP.test(p) && (KEEP.includes(p) || v !== b[p])) css += p + ":" + v + ";"; }
    // keep descendants placed the way they were (absolute placeholders, slot spans)
    if (o !== c.__root) for (const p of ["position", "left", "top", "width", "z-index", "opacity", "margin-top", "margin-right", "margin-bottom", "margin-left"]) css += p + ":" + cs.getPropertyValue(p) + ";";
    // text on one line stays on one line in the copy: drawn on its own layer it can come out a hair wider than its
    // measured box, which would wrap it or cut it to an ellipsis
    if ([...o.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      if (o.getBoundingClientRect().height < lh * 1.6) css += "white-space:nowrap;overflow:visible;text-overflow:clip;";
    }
    c.setAttribute("style", css);
    [...o.children].forEach((oc, i) => c.children[i] && inline(oc, Object.assign(c.children[i], { __root: c.__root })));
  };
  JOB.lifts.forEach(({ k, done, states }) => {
    const el = first[k]; if (!el) return;
    // the screen as it is at the lift: show/hide steps before it applied for the copy, then put back
    const flips = [];
    for (const { k: k2, off } of states) document.querySelectorAll('[data-uk~="' + k2 + '"]').forEach((n) => {
      flips.push([n, n.hasAttribute("data-off"), n.style.height]);
      if (off) n.setAttribute("data-off", "");
      else { n.removeAttribute("data-off"); const g = n.getAttribute("data-grow-h"); if (g) n.style.height = g + "px"; }
    });
    const c = el.cloneNode(true);
    c.__root = c;
    inline(el, c);
    flips.reverse().forEach(([n, wasOff, h]) => { if (wasOff) n.setAttribute("data-off", ""); else n.removeAttribute("data-off"); n.style.height = h; });
    for (const d of done) {
      const slot = c.querySelector('[data-in="' + d.k + '"]'); if (!slot) continue;
      if (d.kind === "type") slot.innerHTML = d.html;
      slot.style.opacity = "1";
      slot.parentElement.querySelectorAll(":scope > .uid-ph, :scope > .uid-orig").forEach((n) => (n.style.opacity = "0"));
    }
    [c, ...c.querySelectorAll("*")].forEach((n) => { n.removeAttribute("data-uk"); n.removeAttribute("data-in"); n.removeAttribute("data-off"); n.removeAttribute("data-ui"); });
    const b = out.boxes[k];
    c.style.width = b.w + "px"; c.style.height = b.h + "px"; c.style.opacity = "1";
    if (out.under[k]) { c.style.backgroundColor = out.under[k]; c.style.borderRadius = Math.max(out.radius[k], 10) + "px"; }
    out.clones[k] = c.outerHTML;
  });
  out.markup = root.outerHTML;
  document.getElementById("__out").textContent = btoa(unescape(encodeURIComponent(JSON.stringify(out))));
})();
</script></body></html>`;
}

const textHtml = (t) => esc(t).replace(/\n/g, "<br>");
// A paste without `text`: content the narration never spells out (the prompt, the "secret") shows as
// unreadable placeholder lines instead of words someone made up.
const SK_WIDTHS = [94, 86, 97, 72, 90, 81, 95, 64, 88, 77];
const redacted = (n = 5) => Array.from({ length: Math.max(1, n) }, (_, i) => `<span class="uid-sk" style="width:${i === n - 1 ? 46 : SK_WIDTHS[i % SK_WIDTHS.length]}%"></span>`).join("");

export function uiDemo(spec, ctx) {
  const { id, w: W, h: H } = ctx;
  const SH = ctx.sh ?? H;
  const s = f3(ctx.s ?? 0), e = f3(ctx.e ?? (ctx.s ?? 0) + 6);
  const accent = ctx.accent || "#0E78D0";
  const scope = `uid-${id}`, CAM = `#card-${id}-cam`, CUR = `#card-${id}-cur`;
  const { css: screenCss, markup } = splitScreen(loadScreen(spec.screen, ctx.readFile));
  const css = demoCss(scope, screenCss, accent);

  // ── steps, in time order, with default times ──
  const raw = (spec.steps || []).map((st, i) => ({ ...st, i }));
  let tPrev = s + 0.15;
  const steps = raw.map((st) => {
    if (!ACTIONS.includes(st.do)) throw new Error(`ui ${id}: step ${st.i + 1} has do: "${st.do}" (use ${ACTIONS.join(" | ")})`);
    if (NEEDS_TARGET.has(st.do) && !st.target) throw new Error(`ui ${id}: step ${st.i + 1} (${st.do}) needs a target selector`);
    if (st.do === "text" && st.text == null) throw new Error(`ui ${id}: step ${st.i + 1} (text) needs text`);
    const at = f3(st.at ?? tPrev + 1);
    tPrev = at;
    return { ...st, at, text: st.text != null ? String(st.text).normalize("NFC") : st.text };
  }).sort((a, b) => a.at - b.at || a.i - b.i);

  const view = spec.view && typeof spec.view === "object" ? spec.view : null;
  const targets = [...steps.map((st) => st.target ?? null), view?.target ?? null];
  const job = {
    targets,
    shown: [].concat(spec.shown || []), hidden: [].concat(spec.hidden || []),
    scrolls: steps.map((st, k) => (st.do === "scroll" ? k : -1)).filter((k) => k >= 0),
    lifts: [], // filled below: which typed/pasted text each lifted copy already shows
    // no text = what the narration leaves vague: unreadable placeholder lines (typed out, or pasted at once)
    slots: steps.map((st, k) => (st.do === "type" || st.do === "paste" ? { k, kind: st.text == null ? "paste" : st.do, html: st.text == null ? redacted(st.lines ?? (st.do === "type" ? 1 : 5)) : textHtml(st.text), replace: !!st.replace } : null)).filter(Boolean),
  };
  steps.forEach((st, k) => {
    if (st.do !== "lift") return;
    const done = job.slots.filter((sl) => steps[sl.k].at < st.at).map((sl) => ({ k: sl.k, kind: sl.kind, html: sl.html }));
    const states = steps.map((s2, k2) => ({ s2, k2 })).filter(({ s2 }) => (s2.do === "show" || s2.do === "hide") && s2.at < st.at).map(({ s2, k2 }) => ({ k: k2, off: s2.do === "hide" }));
    job.lifts.push({ k, done, states });
  });
  const m = measure(measurePage(scope, css, markup, job));
  if (m.missing.length) throw new Error(`ui ${id}: no element matches ${m.missing.map((x) => JSON.stringify(x)).join(", ")} in screen ${spec.screen}`);
  if (!(m.w > 0 && m.h > 0)) throw new Error(`ui ${id}: the screen root has no size — give its top element a width and height in CSS`);
  const sw = m.w, sh = m.h;

  // ── virtual camera: translate(x, y) scale(s), origin 0 0; zoom numbers are multiples of the overview ──
  const sMin = Math.max(W / sw, H / sh), sMax = sMin * (spec.maxZoom ?? 3);
  const place = (sc, cx, cy) => {
    sc = clamp(sc, sMin, sMax);
    return { x: f3(clamp(W / 2 - cx * sc, W - sw * sc, 0)), y: f3(clamp(SH / 2 - cy * sc, H - sh * sc, 0)), scale: f3(sc) };
  };
  const fit = (b, pad = 36) => Math.min((W * 0.94) / (b.w + 2 * pad), (SH * 0.9) / (b.h + 2 * pad));
  const frame = (b, zoom) => (zoom === "out" || !b ? place(sMin, sw / 2, sh / 2)
    : place(zoom == null || zoom === "fit" ? fit(b) : sMin * zoom, b.x + b.w / 2, b.y + b.h / 2));
  const inView = (c, b, pad = 14) => {
    const X = c.x + (b.x - pad) * c.scale, Y = c.y + (b.y - pad) * c.scale;
    return X >= -1 && Y >= -1 && X + (b.w + 2 * pad) * c.scale <= W + 1 && Y + (b.h + 2 * pad) * c.scale <= SH + 1;
  };

  const vk = targets.length - 1;
  let cam = view ? frame(view.target ? m.boxes[vk] : null, view.zoom ?? (view.target ? undefined : "out")) : frame(null, "out");
  const cam0 = cam;
  const useCursor = spec.cursor !== false;
  // default cursor: right of centre in the unobstructed band of the first view
  let cur = Array.isArray(spec.cursor) ? { x: spec.cursor[0], y: spec.cursor[1] }
    : { x: f3((W * 0.62 - cam.x) / cam.scale), y: f3((SH * 0.62 - cam.y) / cam.scale) };
  const cur0 = cur;

  const js = [], extra = [], keys = [], events = [];
  // QA: deterministic problems (lints) and one checkpoint per step = the moment its effect has settled
  const lints = [], checks = [];
  const lint = (st, msg) => lints.push({ step: st.i + 1, t: st.at, msg });
  const minPx = spec.minTextPx ?? 24; // smallest UI text worth showing on a 1080-wide phone frame
  const tw = (sel, from, to, t, dur, ease = "power2.out", more = "") =>
    js.push(`tl.fromTo(${JSON.stringify(sel)}, ${JSON.stringify(from)}, { ...${JSON.stringify(to)}, duration: ${f3(dur)}, ease: "${ease}", immediateRender: false${more} }, ${f3(t)});`);
  const T = (sel) => `${CAM} [data-uk~="${sel}"]`;
  let camFree = s, curFree = s;
  const scrolled = {}, scrollTotal = {}; // scroll step k -> px it scrolled; target selector -> px scrolled so far
  const boxAt = (k) => {
    const b = m.boxes[k];
    if (!b) return null;
    const dy = (m.inside[k] || []).reduce((a, j) => a + (scrolled[j] || 0), 0);
    return { ...b, y: b.y - dy };
  };
  const moveCam = (to, start, end) => {
    if (to.x === cam.x && to.y === cam.y && to.scale === cam.scale) return;
    start = Math.max(start, camFree, s);
    if (end - start < 0.25) end = start + 0.25;
    tw(CAM, cam, to, start, end - start, "power3.inOut");
    cam = to;
    camFree = end;
  };
  /** Bring box b into the unobstructed view before time `by` (keeps the zoom unless the step sets one). */
  const follow = (st, b, by, prevAt) => {
    if (!b || st.cam === false) return;
    let to = null;
    if (st.zoom != null) to = frame(b, st.zoom);
    else if (!inView(cam, b)) to = place(Math.min(cam.scale, fit(b, 24)), b.x + b.w / 2, b.y + b.h / 2);
    if (to) moveCam(to, Math.max(prevAt, by - 0.75), by);
  };
  const point = (st, b) => {
    const [fx, fy] = st.point || [0.5, 0.5];
    return { x: f3(b.x + b.w * fx), y: f3(b.y + b.h * fy) };
  };
  // ── hover: hand cursor + a tint on the button from the moment the cursor arrives until just after the click ──
  let handOff = null; // pending "back to the arrow" time; merged when the next hover starts before it
  const flushHand = () => {
    if (handOff == null) return;
    tw(`${CUR} > .uid-hand`, { opacity: 1 }, { opacity: 0 }, handOff, 0.06, "none");
    tw(`${CUR} > .uid-arrow`, { opacity: 0 }, { opacity: 1 }, handOff, 0.06, "none");
    handOff = null;
  };
  const hover = (k, b, st, on, off) => {
    if (!useCursor || spec.hover === false || st.hover === false) return;
    on = Math.max(s, on);
    extra.push(`<div id="card-${id}-hv${k}" class="uid-hv" style="left:${f3(b.x)}px;top:${f3(b.y)}px;width:${f3(b.w)}px;height:${f3(b.h)}px;border-radius:${f3(m.radius[k] || 8)}px"></div>`);
    tw(`#card-${id}-hv${k}`, { opacity: 0 }, { opacity: 1 }, on, 0.12, "power1.out");
    tw(`#card-${id}-hv${k}`, { opacity: 1 }, { opacity: 0 }, off, 0.12, "power1.in");
    if (handOff != null && on <= handOff + 0.06) handOff = off; // still a hand from the last click: stay a hand
    else {
      flushHand();
      tw(`${CUR} > .uid-arrow`, { opacity: 1 }, { opacity: 0 }, on, 0.06, "none");
      tw(`${CUR} > .uid-hand`, { opacity: 0 }, { opacity: 1 }, on, 0.06, "none");
      handOff = off;
    }
  };
  /** Cursor glides to p and clicks at tc (ripple + press on the target); buttons get a hover first. */
  const clickAt = (k, b, st, tc, prevAt, isButton = true) => {
    const p = point(st, b);
    let arrive = tc - 0.25;
    if (useCursor) {
      const dist = Math.hypot(p.x - cur.x, p.y - cur.y);
      if (dist > 2) {
        const end = tc - 0.05, dur = clamp(0.25 + dist / 1800, 0.3, 0.75);
        const start = Math.max(curFree, prevAt, end - dur, s);
        tw(CUR, { x: cur.x, y: cur.y }, { x: p.x, y: p.y }, start, Math.max(0.12, end - start), "power2.inOut");
        if (dist * cam.scale > 160 && end - start < 0.22) lint(st, `cursor jumps ${Math.round(dist * cam.scale)} px in ${f3(end - start)} s: leave ~0.4 s before this step`);
        cur = p;
        arrive = start + Math.max(0.12, end - start) * 0.8; // power2.inOut: over the target for the last ~fifth
      }
      // the tint goes right after the press (menus and dialogs often close on the click)
      if (isButton) hover(k, b, st, Math.min(arrive, tc - 0.08), tc + 0.1);
      js.push(`tl.fromTo(${JSON.stringify(CUR)}, { scale: 1 }, { scale: 0.82, duration: 0.08, ease: "power1.out", yoyo: true, repeat: 1, immediateRender: false }, ${f3(tc)});`);
      curFree = tc + 0.16;
    }
    extra.push(`<div id="card-${id}-rip${k}" class="uid-rip" style="left:${p.x}px;top:${p.y}px"></div>`);
    tw(`#card-${id}-rip${k}`, { opacity: 0.45, scale: 0.2 }, { opacity: 0, scale: 1.35 }, tc, 0.5);
    js.push(`tl.fromTo(${JSON.stringify(T(k))}, { filter: "brightness(1)" }, { filter: "brightness(0.9)", duration: 0.09, ease: "power1.out", yoyo: true, repeat: 1, immediateRender: false }, ${f3(tc)});`);
    events.push({ t: f3(tc), kind: "click", target: st.target });
  };
  const keyBadge = (k, label, at, dur = 1) => {
    keys.push(`<div id="card-${id}-key${k}" class="uid-key">${esc(label)}</div>`);
    tw(`#card-${id}-key${k}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }, at, 0.25, "back.out(2)");
    tw(`#card-${id}-key${k}`, { opacity: 1 }, { opacity: 0 }, Math.min(e - 0.2, at + dur), 0.2, "power1.in");
  };
  // ── 3D tilt of the whole screen (a layer around the camera, rotating about the clear band's centre) ──
  const TL = `#card-${id}-tilt`, ROOT = `${CAM} > :first-child`;
  const FLAT = { x: 0, y: 0, z: 0, scale: 1 };
  const tiltOf = (t) => ({ x: t.x ?? 0, y: t.y ?? 0, z: t.z ?? 0, scale: t.scale ?? 1 });
  const isFlat = (t) => !t.x && !t.y && !t.z && t.scale === 1;
  const tilt0 = spec.tilt ? tiltOf(spec.tilt === true ? TILT_DEFAULT : { ...TILT_DEFAULT, ...spec.tilt }) : FLAT;
  const usesTilt = !isFlat(tilt0) || steps.some((st) => st.do === "tilt" || (st.do === "lift" && st.screen !== false));
  const TILT_R = 18; // screen corner radius while tilted (screen px)
  const gs = (t) => ({ rotationX: t.x, rotationY: t.y, rotation: t.z, scale: t.scale });
  let tiltNow = tilt0;
  const tiltSpans = [];
  const tiltTo = (to, start, dur) => {
    start = Math.max(s, start);
    tw(TL, gs(tiltNow), gs(to), start, dur, "power3.inOut");
    if (isFlat(tiltNow) !== isFlat(to)) tw(ROOT, { borderRadius: isFlat(tiltNow) ? 0 : TILT_R }, { borderRadius: isFlat(to) ? 0 : TILT_R }, start, dur, "power3.inOut");
    tiltSpans.push([start, start + dur]);
    tiltNow = to;
    return start + dur;
  };
  // a tilted start lands flat just before the first action, unless that action is a tilt (it takes over)
  // or a lift (it tilts the screen anyway, and lands flat when it settles)
  const first = steps.find((st) => ["click", "type", "paste", "highlight", "lift", "tilt"].includes(st.do));
  if (!isFlat(tilt0) && first?.do !== "tilt" && first?.do !== "lift") {
    const end = first ? Math.max(s + 0.6, first.at - (first.do === "paste" ? 0.25 : first.do === "type" ? 0.2 : 0) - 0.3) : s + 1.6;
    const dur = Math.min(end - s, spec.tilt?.dur ?? 1.2);
    tiltTo(FLAT, end - dur, dur);
  }
  const tilted = usesTilt ? `transform-origin:${f3(W / 2)}px ${f3(SH / 2)}px;transform:rotate(${tilt0.z}deg) rotateY(${tilt0.y}deg) rotateX(${tilt0.x}deg) scale(${tilt0.scale})` : "";

  /** A label tag above (or below) box rb, from at to until. */
  const tag = (k, st, rb, at, until, scale = cam.scale) => {
    const fs = f3((st.size ?? 34) / scale);
    const above = rb.y * scale + cam.y > fs * scale * 2.2;
    const ty = above ? f3(rb.y - fs * 2.1) : f3(rb.y + rb.h + fs * 0.5);
    extra.push(`<div id="card-${id}-tg${k}" class="uid-tag" style="left:${f3(rb.x + rb.w / 2)}px;top:${ty}px;font-size:${fs}px">${esc(st.label)}</div>`);
    tw(`#card-${id}-tg${k}`, { opacity: 0, y: above ? 12 : -12 }, { opacity: 1, y: 0 }, at + 0.1, 0.3, "back.out(1.8)");
    tw(`#card-${id}-tg${k}`, { opacity: 1 }, { opacity: 0 }, until, 0.22, "power1.in");
    const cx = cam.x + (rb.x + rb.w / 2) * scale, half = String(st.label).length * (st.size ?? 34) * 0.29 + 26;
    if (cx - half < 0 || cx + half > W || cam.y + ty * scale < 0) lint(st, `label "${st.label}" is clipped by the card edge`);
  };

  const phDone = new Set(), origDone = new Set(), textNow = {};
  const hideOnce = (set, k, sel, at) => {
    const key = steps[k].target;
    if (set.has(key)) return;
    set.add(key);
    tw(sel, { opacity: 1 }, { opacity: 0 }, at, 0.12, "power1.out");
  };

  let prevAt = s, lastAct = -Infinity;
  steps.forEach((st, k) => {
    const at = st.at;
    const b = st.target ? boxAt(k) : null;
    let settle = at + 0.3;
    switch (st.do) {
      case "focus":
        moveCam(st.target === "screen" ? frame(null, "out") : frame(b, st.zoom ?? (b ? undefined : "out")), at, at + (st.dur ?? 0.8));
        settle = camFree + 0.05;
        break;
      case "click":
        follow(st, b, at - 0.15, prevAt);
        clickAt(k, b, st, at, prevAt);
        break;
      case "type":
      case "paste": {
        const tc = at - (st.do === "paste" ? 0.25 : 0.2);
        follow(st, b, tc - 0.1, prevAt);
        if (st.click !== false) {
          clickAt(k, b, st, tc, prevAt, false);
          if (useCursor) { // step off the field so the text stays readable
            const to = { x: f3(cur.x + 46), y: f3(b.y + b.h + 26) };
            tw(CUR, { x: cur.x, y: cur.y }, to, tc + 0.17, 0.35, "power2.out");
            cur = to;
            curFree = tc + 0.52;
          }
        }
        const slot = `${CAM} [data-in="${k}"]`;
        if (st.replace) hideOnce(origDone, k, `${T(k)} > .uid-orig`, at);
        js.push(`if (document.querySelector(${JSON.stringify(`${T(k)} > .uid-ph`)})) {`);
        hideOnce(phDone, k, `${T(k)} > .uid-ph`, at);
        js.push(`}`);
        if (st.do === "type" && st.text == null) {
          // placeholder lines grow in one after another, like text being typed
          const n = Math.max(1, st.lines ?? 1), dur = st.dur ?? Math.min(2.6, 0.55 * n), per = dur / n;
          tw(slot, { opacity: 0 }, { opacity: 1 }, at, 0.01, "none");
          for (let i = 0; i < n; i++) {
            const wPct = i === n - 1 ? 46 : SK_WIDTHS[i % SK_WIDTHS.length];
            tw(`${slot} > .uid-sk:nth-child(${i + 1})`, { width: "0%" }, { width: `${wPct}%` }, at + i * per, per, "none");
          }
          prevAt = at + dur;
          settle = at + dur + 0.15;
        } else if (st.do === "type") {
          const chars = [...st.text].map((c) => (c === "\n" ? "<br>" : esc(c)));
          const dur = st.dur ?? Math.min(2.6, Math.max(0.4, chars.length / (st.cps ?? 18)));
          js.push(`{ const el = document.querySelector(${JSON.stringify(slot)}), p = { n: 0 }, C = ${JSON.stringify(chars)};
          tl.fromTo(p, { n: 0 }, { n: C.length, duration: ${f3(dur)}, ease: "none", immediateRender: false,
            onUpdate: () => { const n = Math.round(p.n); el.innerHTML = C.slice(0, n).join("") + (p.n > 0 && n < C.length ? '<span class="uid-caret"></span>' : ""); } }, ${f3(at)}); }`);
          prevAt = at + dur;
          settle = at + dur + 0.15;
        } else {
          settle = at + 0.45;
          if (st.key !== false) keyBadge(k, st.key || "Ctrl + V", at - 0.18, 1.1);
          tw(slot, { opacity: 0 }, { opacity: 1 }, at, 0.16, "power1.out");
          tw(slot, { backgroundColor: `${accent}48` }, { backgroundColor: `${accent}00` }, at, 0.9, "power1.in");
        }
        break;
      }
      case "show": {
        const d = st.dur ?? 0.28;
        const from = { opacity: 0 }, to = { opacity: 1 };
        const dirs = { up: ["y", 24], down: ["y", -24], left: ["x", 24], right: ["x", -24] };
        if (st.from === "pop") Object.assign(from, { scale: 0.95 }), Object.assign(to, { scale: 1 });
        else if (dirs[st.from]) (from[dirs[st.from][0]] = dirs[st.from][1]), (to[dirs[st.from][0]] = 0);
        if (b?.grow) (from.height = 0), (to.height = b.grow); // an item inserted into a list pushes the rest down
        tw(T(k), from, to, at, d, st.from === "pop" ? "back.out(1.6)" : "power2.out");
        settle = at + d + 0.05;
        break;
      }
      case "hide":
        tw(T(k), b?.grow ? { opacity: 1, height: b.grow } : { opacity: 1 }, b?.grow ? { opacity: 0, height: 0 } : { opacity: 0 }, at, st.dur ?? 0.2, "power1.in");
        break;
      case "scroll": {
        // the target is the scrolling CONTENT (it moves up by `by` px); later targets inside it are measured
        // unscrolled, and boxAt subtracts every scroll step that contains them
        const by = st.by ?? 300, done = scrollTotal[st.target] || 0;
        tw(T(k), { y: -done }, { y: -(done + by) }, at, st.dur ?? 0.7, "power2.inOut");
        settle = at + (st.dur ?? 0.7) + 0.05;
        scrollTotal[st.target] = done + by;
        scrolled[k] = by;
        break;
      }
      case "highlight": {
        follow(st, b, at, prevAt);
        const pad = st.pad ?? 8, r = st.radius ?? 14;
        const rb = { x: f3(b.x - pad), y: f3(b.y - pad), w: f3(b.w + 2 * pad), h: f3(b.h + 2 * pad) };
        const until = Math.min(e - 0.05, st.until ?? at + (st.dur ?? 1.8));
        extra.push(`<div id="card-${id}-hl${k}" class="uid-ring" style="left:${rb.x}px;top:${rb.y}px;width:${rb.w}px;height:${rb.h}px;border-radius:${r}px;border-width:${f3(4 / cam.scale * 1.4)}px"></div>`);
        tw(`#card-${id}-hl${k}`, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1 }, at, 0.32, "back.out(1.8)");
        tw(`#card-${id}-hl${k}`, { opacity: 1 }, { opacity: 0 }, until, 0.22, "power1.in");
        if (st.label) tag(k, st, rb, at, until);
        settle = at + 0.45;
        break;
      }
      case "lift": {
        // The component leaves the screen: a copy of its own DOM (made at measure time) on a 3D layer in front
        // of the screen rises in Z, scales up and turns to face the camera, while the screen tilts back and
        // dims, the slot it left stays empty and its shadow falls on the surface below — then it settles back.
        follow(st, b, at - 0.1, prevAt);
        if (b.n > 1) lint(st, `lift matches ${b.n} elements: target one (only the first is lifted)`);
        const sc = st.scale ?? 1.15, dim = st.dim ?? 0.4, Z = st.z ?? 90;
        const up = 0.55, down = 0.45, until = Math.min(e - down - 0.02, st.until ?? at + (st.dur ?? 1.8));
        const lt = st.screen === false ? null : tiltOf({ ...LIFT_TILT, ...(typeof st.screen === "object" ? st.screen : {}) });
        const back = first === st && !isFlat(tilt0) ? FLAT : tiltNow; // a tilted start that opens on a lift lands flat after it
        if (lt) { tiltTo(lt, at - 0.05, up + 0.15); tiltSpans.pop(); }
        const [rx, ry] = st.tilt ?? (lt ? [-lt.x * 0.6, -lt.y * 0.6] : [6, -8]);
        const dy = -f3(Math.min(16, b.h * 0.2)), r = Math.max(m.radius[k] || 0, 10), pad = 16;
        // grow from the side that keeps the lifted copy on the screen
        const grow = (lo, size, full) => sc <= 1 ? 0.5
          : clamp(Math.min(0.5, (lo - pad) / (size * (sc - 1))), 1 - (full - pad - lo - size) / (size * (sc - 1)), 1);
        const fx = f3(clamp(grow(b.x, b.w, sw), 0, 1)), fy = f3(clamp(grow(b.y + dy, b.h, sh), 0, 1));
        const F = `#card-${id}-fl${k}`, D = `#card-${id}-dm${k}`, C = `#card-${id}-cs${k}`;
        let label = "";
        if (st.label) { // rides on the copy, above it (or below when there is no room)
          const k2 = cam.scale * sc, fs = f3((st.size ?? 34) / k2);
          const above = (b.y + dy - b.h * (sc - 1) * fy) * cam.scale + cam.y > (st.size ?? 34) * 2.2;
          label = `<div id="card-${id}-tg${k}" class="uid-tag" style="left:${f3(b.w / 2)}px;top:${above ? f3(-fs * 2.1) : f3(b.h + fs * 0.5)}px;font-size:${fs}px">${esc(st.label)}</div>`;
          tw(`#card-${id}-tg${k}`, { opacity: 0, y: above ? 12 : -12 }, { opacity: 1, y: 0 }, at + 0.15, 0.3, "back.out(1.8)");
          tw(`#card-${id}-tg${k}`, { opacity: 1 }, { opacity: 0 }, until, 0.22, "power1.in");
          const cx = cam.x + (b.x + b.w / 2) * cam.scale, half = String(st.label).length * (st.size ?? 34) * 0.29 + 26;
          if (cx - half < 0 || cx + half > W) lint(st, `label "${st.label}" is clipped by the card edge`);
        }
        extra.push(`<div id="card-${id}-dm${k}" class="uid-dim" style="width:${f3(sw)}px;height:${f3(sh)}px"></div>`);
        extra.push(`<div id="card-${id}-cs${k}" class="uid-cast" style="left:${f3(b.x)}px;top:${f3(b.y + 12)}px;width:${f3(b.w)}px;height:${f3(b.h)}px;border-radius:${f3(r)}px"></div>`);
        extra.push(`<div id="card-${id}-fl${k}" class="uid-float" style="left:${f3(b.x)}px;top:${f3(b.y)}px;width:${f3(b.w)}px;height:${f3(b.h)}px;transform-origin:${f3(fx * 100)}% ${f3(fy * 100)}%">${m.clones[k] || ""}${label}</div>`);
        const flat = { z: 0, scale: 1, y: 0, rotationX: 0, rotationY: 0 }, high = { z: Z, scale: sc, y: dy, rotationX: rx, rotationY: ry };
        tw(T(k), { opacity: 1 }, { opacity: 0 }, at, 0.01, "none"); // the slot it leaves stays empty
        tw(F, { opacity: 0 }, { opacity: 1 }, at, 0.01, "none");
        tw(F, flat, high, at, up, "back.out(1.3)");
        tw(D, { opacity: 0 }, { opacity: dim }, at, up, "power2.out");
        tw(C, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1.04 }, at, up, "power2.out");
        tw(F, high, flat, until, down, "power2.inOut");
        tw(D, { opacity: dim }, { opacity: 0 }, until, down, "power2.in");
        tw(C, { opacity: 1, scale: 1.04 }, { opacity: 0, scale: 0.94 }, until, down, "power2.in");
        tw(F, { opacity: 1 }, { opacity: 0 }, until + down, 0.01, "none");
        tw(T(k), { opacity: 0 }, { opacity: 1 }, until + down, 0.01, "none");
        if (lt) { tiltTo(back, until, down + 0.15); tiltSpans.pop(); }
        events.push({ t: f3(at), kind: "lift", target: st.target });
        settle = at + up + 0.15;
        break;
      }
      case "tilt":
        settle = tiltTo(tiltOf(st), at, st.dur ?? 1.0) + 0.05;
        break;
      case "text": {
        const prev = textNow[st.target];
        const B = textHtml(st.text);
        js.push(`{ const el = document.querySelector(${JSON.stringify(T(k))}), A = ${prev != null ? JSON.stringify(prev) : "el.innerHTML"}, p = { v: 0 };
          tl.fromTo(p, { v: 0 }, { v: 1, duration: 0.02, ease: "none", immediateRender: false, onUpdate: () => { el.innerHTML = p.v < 0.5 ? A : ${JSON.stringify(B)}; } }, ${f3(at)}); }`);
        textNow[st.target] = B;
        break;
      }
      case "key":
        keyBadge(k, st.key || st.text || "Enter", at, st.dur ?? 1);
        break;
      case "wait":
        break;
    }
    // ── QA lints for actions the viewer has to see ──
    const ACT = { click: at, type: at - 0.2, paste: at - 0.25, highlight: at, lift: at }[st.do];
    if (ACT != null && b) {
      if (camFree > ACT + 0.02) lint(st, `camera still moving at the ${st.do} (until ${f3(camFree)} s): move the step later or the previous one earlier`);
      const sp = tiltSpans.find(([a, z]) => ACT > a + 0.02 && ACT < z - 0.02);
      if (sp) lint(st, `screen still tilting at the ${st.do} (until ${f3(sp[1])} s): move the step later or the tilt earlier`);
      if (!inView(cam, b, 0)) lint(st, b.w * cam.scale > W || b.h * cam.scale > SH ? "target is bigger than the clear band at this zoom" : "target is not fully in the clear band (behind the head or off the card)");
      const px = (m.fonts[k] || 14) * cam.scale;
      if (st.text != null && px < minPx) lint(st, `${st.target} text is ${Math.round(px)} px on the frame (< ${minPx}): unreadable on a phone — zoom ≥ ${f3(minPx / (m.fonts[k] || 14) / sMin)} or frame a smaller region`);
      if (ACT - lastAct < 0.45) lint(st, `only ${f3(ACT - lastAct)} s after the previous action: viewers can't follow`);
      lastAct = ACT;
    }
    if ((st.do === "type" || st.do === "paste") && m.overflow[k]) lint(st, "the full text overflows the field: shorten it, fewer lines, or a taller field");
    if (at < s - 0.01 || at > e - 0.15) lint(st, `at ${at} s is outside the card (${s}–${e})`);
    checks.push({ step: st.i + 1, do: st.do, target: st.target, at, t: f3(Math.min(e - 0.05, Math.max(s + 0.05, settle))), label: st.label, text: (st.do === "paste" || st.do === "type") && st.text == null ? `[${st.lines ?? (st.do === "type" ? 1 : 5)} redacted lines]` : st.text });
    prevAt = Math.max(prevAt, at);
  });

  flushHand();
  const cursor = useCursor ? `<div id="card-${id}-cur" class="uid-cur" style="transform:translate(${f3(cur0.x)}px, ${f3(cur0.y)}px)"><span class="uid-arrow">${CURSOR_SVG}</span><span class="uid-hand">${HAND_SVG}</span></div>` : "";
  const html = `<div id="card-${id}-ui" class="${scope}">
            <div id="card-${id}-tilt" class="uid-tilt" style="${tilted}">
            <div id="card-${id}-cam" class="uid-cam" style="width:${f3(sw)}px;height:${f3(sh)}px;transform:translate(${cam0.x}px, ${cam0.y}px) scale(${cam0.scale})">
              ${m.markup}
              ${extra.join("\n              ")}
              ${cursor}
            </div>
            </div>
            ${keys.join("\n            ")}
          </div>`;
  // tilted: the screen floats on a soft backdrop with rounded corners and a shadow (both off-card once flat)
  const tiltCss = usesTilt ? `
      .${scope} .uid-cam { box-shadow: 0 40px 90px rgba(15,23,42,0.35), 0 8px 24px rgba(15,23,42,0.18); }
      .${scope} #card-${id}-cam > :first-child { border-radius: ${isFlat(tilt0) ? 0 : TILT_R}px; }` : "";
  const bg = spec.bg || (usesTilt ? TILT_BG : m.bg && m.bg !== "rgba(0, 0, 0, 0)" ? m.bg : "#ffffff");
  return { html, css: css + tiltCss, js, bg, events, lints, checks, size: { w: sw, h: sh, overview: f3(sMin) } };
}

export const QA_STRIP = 150; // px under the card for the QA caption

/** A standalone page that plays (or, with #<seconds> in the URL, shows one moment of) the demo. */
export function previewPage(spec, { id = "demo", w, h, sh, s = 0, e, accent, readFile, base, bare = false }) {
  const out = uiDemo(spec, { id, s, e, w, h, sh, accent, readFile });
  const fonts = path.join(SKILL_DIR, "assets", "fonts");
  const face = (wt, f) => (fs.existsSync(path.join(fonts, f)) ? `@font-face { font-family: "Be Vietnam Pro"; font-weight: ${wt}; src: url("file://${path.join(fonts, f)}"); }` : "");
  const page = `<!doctype html><html><head><meta charset="utf-8">${base ? `<base href="file://${base.replace(/\/?$/, "/")}">` : ""}
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
${face(800, "BeVietnamPro-ExtraBold.ttf")}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: #111; }
#card-${id} { position: absolute; left: 0; top: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: ${out.bg}; }
#safe { position: absolute; left: 0; right: 0; top: ${sh}px; bottom: 0; background: rgba(0,0,0,0.35); border-top: 3px dashed #ff3b6b; display: ${sh < h ? "block" : "none"}; }
#qa { position: absolute; left: 0; top: ${h}px; width: ${w}px; height: ${QA_STRIP}px; padding: 12px 16px; background: #1b1b1b; color: #eee;
  font: 500 21px/1.35 ui-sans-serif, -apple-system, sans-serif; overflow: hidden; display: none; }
#qa b { color: #fff; } #qa .w { color: #9fd0ff; } #qa .l { color: #ff8a8a; display: block; }
#clock { position: absolute; right: 10px; top: ${h - 44}px; font: 700 22px ui-monospace, monospace; color: #fff; background: rgba(0,0,0,0.6); padding: 3px 9px; border-radius: 6px; }
${out.css}
</style></head><body>
<div id="card-${id}">
          ${out.html}
</div>
${bare ? "" : '<div id="safe"></div><div id="clock"></div>'}<div id="qa"></div>
<script>
const tl = gsap.timeline({ paused: true });
${out.js.join("\n")}
const clock = document.getElementById("clock") || {}, S = ${s}, E = ${e ?? s + 6};
const [tq, cap] = decodeURIComponent(location.hash.slice(1)).split("|");
const at = parseFloat(tq);
if (cap) { const q = document.getElementById("qa"); q.innerHTML = decodeURIComponent(escape(atob(cap))); q.style.display = "block"; }
if (!isNaN(at)) { tl.seek(at, false); clock.textContent = at.toFixed(2) + "s"; }
else { let t0 = null; const loop = (now) => { t0 ??= now; const t = S + ((now - t0) / 1000) % (E - S + 0.8); tl.seek(Math.min(t, E), false); clock.textContent = t.toFixed(2) + "s"; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
</script></body></html>`;
  return { page, ...out };
}

/**
 * A HyperFrames sub-composition. Step times may be on the video clock (s = the demo's start): the card's own
 * timeline starts at s, and the `tl` the steps write to shifts them onto it. `fontFaces`: @font-face rules
 * for the tag font (Be Vietnam Pro), resolved from the project root.
 */
export function subComposition(spec, { id, w, h, sh, s = 0, e, accent, readFile, fontFaces = "" }) {
  const out = uiDemo(spec, { id, s, e, w, h, sh: sh ?? h, accent, readFile });
  const duration = f3(e - s);
  return `<!doctype html>
<html>
  <body>
    <template>
      <style>
      ${fontFaces}
      #root-${id} { position: absolute; inset: 0; overflow: hidden; background: ${out.bg}; }
${out.css}
      </style>
      <div id="root-${id}" data-composition-id="${id}" data-width="${w}" data-height="${h}">
          ${out.html}
      </div>
      <script>
        const TL = gsap.timeline({ paused: true });
        TL.to({}, { duration: ${duration} }, 0);
        const S = ${f3(s)}, p = (t) => (typeof t === "number" ? t - S : t);
        const tl = { fromTo: (a, b, c, t) => TL.fromTo(a, b, c, p(t)), to: (a, b, t) => TL.to(a, b, p(t)), set: (a, b, t) => TL.set(a, b, p(t)) };
        ${out.js.join("\n        ")}
        window.__timelines["${id}"] = TL;
      </script>
    </template>
  </body>
</html>
`;
}
