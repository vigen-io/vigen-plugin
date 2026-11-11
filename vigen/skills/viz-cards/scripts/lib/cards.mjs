// Card kinds: motion graphics in a panel instead of one found picture. Each kind returns
// { html (inner markup), css?, js (GSAP lines on the card timeline `tl`) }; viz.mjs wraps them into a
// sub-composition. Times here are LOCAL (0 = the card's start): viz.mjs shifts the absolute `at`s of cards.json.
//
//   logos    brand marks on tiles popping in one by one (on the word that names them); an item without src
//            shows its text as a wordmark
//   stat     one big number, optionally counting up ("x100", "277", "1.000.000", "95%")
//   chart    bar chart, bars grow and values count up
//   flow     2–4 steps joined by arrows (A → B → C), each step an image, a short text or both
//   compose  free layout of framed photos / logos + speech bubbles / labels
//   html     a hand-written fragment (markup + <style> + <script>) for anything else
// Every animated element starts hidden in its markup and is revealed by a fromTo at its time, so scrubbing
// anywhere shows exactly what a straight playthrough shows. Layouts stay inside the SAFE band (card.sh):
// with a panel tucked behind the presenter's head, the bottom of the card is covered.
const FONT = "Be Vietnam Pro";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f3 = (n) => +Number(n).toFixed(3);

export const KINDS = new Set(["logos", "stat", "chart", "flow", "compose", "html"]);

export const THEMES = {
  dark: { bg: "radial-gradient(120% 140% at 20% 0%, #1f5fa8 0%, #0d2a4d 45%, #07162b 100%)", ink: "#ffffff", sub: "rgba(255,255,255,0.78)", tile: "#ffffff", grid: "rgba(255,255,255,0.08)" },
  light: { bg: "linear-gradient(160deg, #ffffff 0%, #e6f2fc 100%)", ink: "#0A1F6E", sub: "rgba(10,31,110,0.7)", tile: "#ffffff", grid: "rgba(10,31,110,0.07)" },
};

/** Shared CSS for every viz card (added once to the stage). */
export function vizBaseCss() {
  return `
      .viz { position: absolute; inset: 0; font-family: "${FONT}"; overflow: hidden; }
      .viz .vt { position: absolute; left: 0; right: 0; top: 34px; text-align: center; font-weight: 800; font-size: 52px; letter-spacing: -0.01em; }
      .viz .lbl { font-weight: 700; text-align: center; line-height: 1.1; }
      .viz .tile { border-radius: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 30px rgba(0,0,0,0.28); }
      .viz .tile img { width: 64%; height: 64%; object-fit: contain; }
      .viz .ly { position: absolute; width: 0; height: 0; }
      .viz .ly > * { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); }
      .viz .bub { background: #fff; color: #0A1F6E; font-weight: 800; border-radius: 28px; padding: 16px 26px; white-space: nowrap; box-shadow: 0 10px 24px rgba(0,0,0,0.25); }
      .viz .bub::after { content: ""; position: absolute; bottom: -18px; width: 0; height: 0; border: 12px solid transparent; border-top: 18px solid #fff; }
      .viz .bub.tl::after { left: 34px; } .viz .bub.tr::after { right: 34px; } .viz .bub.tc::after { left: calc(50% - 12px); }
      .viz .tag { color: #fff; background: #0E78D0; font-weight: 800; border-radius: 18px; padding: 10px 20px; white-space: nowrap; }
      .viz .plain { font-weight: 800; white-space: nowrap; }`;
}

const pop = (sel, at, d = 0.42) =>
  `tl.fromTo("${sel}", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: ${d}, ease: "back.out(1.7)", immediateRender: false }, ${f3(at)});`;
const fromDir = (sel, at, dir, dist = 380) => {
  const v = { left: `x: -${dist}`, right: `x: ${dist}`, top: `y: -${dist}`, bottom: `y: ${dist}` }[dir];
  if (dir === "fade") return `tl.fromTo("${sel}", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out", immediateRender: false }, ${f3(at)});`;
  if (!v) return pop(sel, at);
  const zero = v.replace(/-?\d+/, "0");
  return `tl.fromTo("${sel}", { opacity: 0, ${v} }, { opacity: 1, ${zero}, duration: 0.5, ease: "expo.out", immediateRender: false }, ${f3(at)});`;
};
const timeOf = (item, i, s, step, lead = 0.2) => f3(Math.max(s + 0.05, item.at ?? s + lead + i * step));

// ── logos ─────────────────────────────────────────────────────────────────
function logos(c, ctx) {
  const { id, s, card, theme, src } = ctx;
  const items = c.items || [];
  if (!items.length) throw new Error(`card ${c.id}: logos needs items[]`);
  const rows = items.length > 4 ? 2 : 1, cols = Math.ceil(items.length / rows);
  const top = c.title ? 120 : 40, labelH = items.some((i) => i.label) ? 64 : 0;
  const gap = 40;
  const tile = Math.floor(Math.min(210, (card.w - 90 - gap * (cols - 1)) / cols, (card.sh - top - 40 - rows * labelH - (rows - 1) * 24) / rows));
  const gridW = cols * tile + (cols - 1) * gap, gridH = rows * (tile + labelH) + (rows - 1) * 24;
  const x0 = (card.w - gridW) / 2, y0 = top + (card.sh - top - 30 - gridH) / 2;
  const html = [], js = [];
  if (c.title) {
    html.push(`<div id="card-${id}-tt" class="vt" style="color:${theme.ink};opacity:0">${esc(c.title)}</div>`);
    js.push(fromDir(`#card-${id}-tt`, s + 0.05, "fade"));
  }
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), k = i % cols;
    const inRow = r === rows - 1 ? items.length - cols * (rows - 1) : cols; // centre a short last row
    const rowX = x0 + ((cols - inRow) * (tile + gap)) / 2;
    const x = Math.round(rowX + k * (tile + gap)), y = Math.round(y0 + r * (tile + labelH + 24));
    const bg = it.tile || (c.tile === "none" ? "transparent" : theme.tile);
    html.push(`<div id="card-${id}-i${i}" style="position:absolute;left:${x}px;top:${y}px;width:${tile}px;opacity:0">
            <div class="tile" style="width:${tile}px;height:${tile}px;background:${bg}${bg === "transparent" ? ";box-shadow:none" : ""}">${it.src
              ? `<img src="${src(it.src)}" alt="" />`
              : `<div style="font-weight:900;color:${it.color || "#111"};font-size:${Math.round(tile / Math.max(3.2, String(it.text || it.label || "").length * 0.62))}px;letter-spacing:-0.02em">${esc(it.text || it.label || "")}</div>`}</div>
            ${it.label ? `<div class="lbl" style="margin-top:14px;font-size:${Math.min(40, Math.round(tile / 4.6))}px;color:${theme.ink}">${esc(it.label)}</div>` : ""}
          </div>`);
    js.push(pop(`#card-${id}-i${i}`, timeOf(it, i, s, 0.18)));
  });
  return { html: html.join("\n          "), js };
}

// ── chart ─────────────────────────────────────────────────────────────────
function chart(c, ctx) {
  const { id, s, card, theme, st } = ctx;
  const bars = c.bars || [];
  if (!bars.length) throw new Error(`card ${c.id}: chart needs bars[]`);
  const max = c.max ?? Math.max(...bars.map((b) => b.value)) * 1.08;
  const top = c.title ? 130 : 60, bottom = 86, pad = 70;
  const plotW = card.w - pad * 2, plotH = card.sh - top - bottom - 56; // 56: value labels above bars
  const slot = plotW / bars.length, bw = Math.min(150, slot * 0.62);
  const unit = c.unit || "", dec = c.decimals ?? (bars.some((b) => !Number.isInteger(b.value)) ? 1 : 0);
  const html = [], js = [];
  if (c.title) {
    html.push(`<div id="card-${id}-tt" class="vt" style="color:${theme.ink};opacity:0">${esc(c.title)}</div>`);
    js.push(fromDir(`#card-${id}-tt`, s + 0.05, "fade"));
  }
  html.push(`<div style="position:absolute;left:${pad}px;right:${pad}px;top:${card.sh - bottom}px;height:3px;background:${theme.sub};opacity:0.5"></div>`);
  bars.forEach((b, i) => {
    const h = Math.max(6, Math.round((b.value / max) * plotH));
    const x = Math.round(pad + slot * i + (slot - bw) / 2), y = card.sh - bottom - h;
    const color = b.color || (b.highlight ? st.accent : theme === THEMES.dark ? "rgba(255,255,255,0.88)" : "#9db8d6");
    const at = timeOf(b, i, s, 0.22, 0.25);
    html.push(`<div id="card-${id}-b${i}" style="position:absolute;left:${x}px;top:${y}px;width:${Math.round(bw)}px;height:${h}px;border-radius:14px 14px 4px 4px;background:${color};transform-origin:50% 100%;transform:scaleY(0)"></div>`);
    html.push(`<div id="card-${id}-v${i}" class="lbl" style="position:absolute;left:${x - 40}px;width:${Math.round(bw) + 80}px;top:${y - 58}px;opacity:0;font-size:46px;font-weight:800;color:${b.highlight ? st.accent : theme.ink}">${esc(b.display ?? `${(0).toFixed(dec)}${unit}`)}</div>`);
    html.push(`<div class="lbl" style="position:absolute;left:${Math.round(pad + slot * i)}px;width:${Math.round(slot)}px;top:${card.sh - bottom + 14}px;font-size:${Math.min(36, Math.round(slot / 5.5))}px;color:${theme.sub}">${esc(b.label)}</div>`);
    js.push(`tl.fromTo("#card-${id}-b${i}", { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "power3.out", immediateRender: false }, ${at});`);
    js.push(`tl.fromTo("#card-${id}-v${i}", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, ${at});`);
    if (b.display == null) {
      js.push(`{ const el = document.querySelector("#card-${id}-v${i}"), p = { v: 0 };
          tl.fromTo(p, { v: 0 }, { v: ${b.value}, duration: 0.6, ease: "power3.out", immediateRender: false,
            onUpdate: () => { el.textContent = p.v.toFixed(${dec}).replace(".", ",") + ${JSON.stringify(unit)}; } }, ${at}); }`);
    }
  });
  return { html: html.join("\n          "), js };
}

// ── flow ──────────────────────────────────────────────────────────────────
function flow(c, ctx) {
  const { id, s, card, theme, st, src } = ctx;
  const steps = c.steps || [];
  if (steps.length < 2) throw new Error(`card ${c.id}: flow needs 2+ steps[]`);
  const top = c.title ? 120 : 30, labelH = 70;
  const n = steps.length, arrowW = n > 3 ? 70 : 110;
  const d = Math.floor(Math.min(220, (card.w - 80 - arrowW * (n - 1)) / n, card.sh - top - labelH - 50));
  const rowW = n * d + (n - 1) * arrowW, x0 = (card.w - rowW) / 2, y = Math.round(top + (card.sh - top - labelH - d) / 2);
  const html = [], js = [];
  if (c.title) {
    html.push(`<div id="card-${id}-tt" class="vt" style="color:${theme.ink};opacity:0">${esc(c.title)}</div>`);
    js.push(fromDir(`#card-${id}-tt`, s + 0.05, "fade"));
  }
  const times = steps.map((stp, i) => timeOf(stp, i, s, 0.55));
  steps.forEach((stp, i) => {
    const x = Math.round(x0 + i * (d + arrowW));
    const ring = stp.highlight ? st.accent : theme === THEMES.dark ? "rgba(255,255,255,0.9)" : "#0A1F6E";
    const inner = stp.src
      ? `<img src="${src(stp.src)}" alt="" style="width:100%;height:100%;object-fit:${stp.fit || "cover"};border-radius:50%" />`
      : `<div style="font-weight:900;font-size:${Math.round(d / (String(stp.text || "").length > 3 ? 4.2 : 2.6))}px;color:#0A1F6E">${esc(stp.text || "")}</div>`;
    html.push(`<div id="card-${id}-s${i}" style="position:absolute;left:${x}px;top:${y}px;width:${d}px;opacity:0">
            <div style="width:${d}px;height:${d}px;border-radius:50%;background:#fff;border:8px solid ${ring};box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px rgba(0,0,0,0.3)">${inner}</div>
            <div class="lbl" style="margin:14px -40px 0;font-size:${Math.min(38, Math.round(d / 5))}px;color:${stp.highlight ? st.accent : theme.ink}">${esc(stp.label || "")}</div>
          </div>`);
    js.push(pop(`#card-${id}-s${i}`, times[i]));
    if (i < n - 1) {
      const ax = x + d + 14, aw = arrowW - 28, ay = y + d / 2;
      html.push(`<div id="card-${id}-a${i}" style="position:absolute;left:${ax}px;top:${ay - 6}px;width:${aw}px;height:12px;transform-origin:0 50%;transform:scaleX(0)">
            <div style="position:absolute;left:0;top:0;width:${aw - 16}px;height:12px;border-radius:6px;background:${st.accent}"></div>
            <div style="position:absolute;right:0;top:-12px;width:0;height:0;border-top:18px solid transparent;border-bottom:18px solid transparent;border-left:24px solid ${st.accent}"></div>
          </div>`);
      const at = f3(Math.max(times[i] + 0.2, (steps[i + 1].at ?? times[i + 1]) - 0.28));
      js.push(`tl.fromTo("#card-${id}-a${i}", { scaleX: 0 }, { scaleX: 1, duration: 0.28, ease: "power2.out", immediateRender: false }, ${at});`);
    }
  });
  return { html: html.join("\n          "), js };
}

// ── compose ───────────────────────────────────────────────────────────────
function compose(c, ctx) {
  const { id, s, e, card, theme, src } = ctx;
  const html = [], js = [];
  if (c.bg && !THEMES[c.bg]) html.push(`<img src="${src(c.bg)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />`);
  const items = [
    ...(c.layers || []).map((l) => ({ ...l, type: "img" })),
    ...(c.texts || []).map((t) => ({ ...t, type: "text" })),
  ];
  items.forEach((it, i) => {
    const x = Math.round((it.x ?? 0.5) * card.w), y = Math.round((it.y ?? 0.5) * card.sh);
    const sel = `#card-${id}-l${i}`;
    let inner;
    if (it.type === "img") {
      const w = Math.round((it.w ?? 0.4) * card.w);
      const h = it.h ? `;height:${Math.round(it.h * card.sh)}px;object-fit:cover` : "";
      const tf = `translate(-50%, -50%)${it.flip ? " scaleX(-1)" : ""}${it.rotate ? ` rotate(${it.flip ? -it.rotate : it.rotate}deg)` : ""}`;
      // Photos are framed (rounded + white border + shadow) so different sources sit together as a set;
      // PNG/SVG (logos, already-transparent art) float unframed with a drop shadow.
      const framed = it.frame ?? !/\.(png|svg)$/i.test(it.src);
      const look = framed
        ? `;border-radius:${it.radius ?? 28}px;border:${it.border ?? 6}px solid #fff;box-shadow:0 16px 34px rgba(0,0,0,0.38)`
        : it.shadow === false ? "" : ";filter:drop-shadow(0 14px 22px rgba(0,0,0,0.35))";
      inner = `<img src="${src(it.src)}" alt="" style="width:${w}px${h};transform:${tf}${look}" />`;
    } else {
      const style = it.style || "bubble";
      const size = it.size || 44;
      const cls = style === "bubble" ? `bub ${it.tail === "right" ? "tr" : it.tail === "center" ? "tc" : "tl"}` : style === "tag" ? "tag" : "plain";
      inner = `<div class="${cls}" style="font-size:${size}px${style === "plain" ? `;color:${it.color || theme.ink}` : it.color ? `;background:${it.color}` : ""}">${esc(it.text)}</div>`;
    }
    html.push(`<div id="card-${id}-l${i}" class="ly" style="left:${x}px;top:${y}px;z-index:${it.z ?? i + 1};opacity:0">${inner}</div>`);
    const at = timeOf(it, i, s, 0.25);
    js.push(it.from ? fromDir(sel, at, it.from) : it.type === "text" ? pop(sel, at, 0.36) : fromDir(sel, at, "bottom", 240));
    if (it.float) { // gentle bob for the rest of the card (finite repeats: seek-safe)
      const reps = Math.max(0, Math.floor((e - at - 0.6) / 1.4) - 1);
      if (reps > 0) js.push(`tl.fromTo("${sel}", { y: 0 }, { y: -14, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: ${reps}, immediateRender: false }, ${f3(at + 0.6)});`);
    }
  });
  return { html: html.join("\n          "), js };
}

// ── html (escape hatch) ───────────────────────────────────────────────────
function htmlFragment(c, ctx) {
  const { id, abs, card, readFile } = ctx;
  if (!c.file) throw new Error(`card ${c.id}: html needs file (e.g. cards/${c.id}.html)`);
  const raw = readFile(c.file);
  const css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const code = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const markup = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").trim();
  return {
    html: markup, css,
    // `bg` on an html card: any CSS background, e.g. "transparent" for drawings over the shot (shots layout `over`)
    ...(c.bg && !THEMES[c.bg] ? { bg: c.bg } : {}),
    // the fragment's script runs with S/E (the card's start/end on the VIDEO clock, as in cards.json), CARD (root
    // selector), W/H (card px), SH (safe height) and a `tl` that takes video-clock times (shifted onto the card)
    js: [`{ const S = ${abs.s}, E = ${abs.e}, CARD = "#card-${id}", W = ${card.w}, H = ${card.h}, SH = ${card.sh}; const tl = shifted(S);\n${code}\n        }`],
  };
}

// ── stat ──────────────────────────────────────────────────────────────────
/** Rough advance width of a Be Vietnam Pro Black string in em (good to ~5%). */
function textEm(s) {
  let w = 0;
  for (const ch of String(s).normalize("NFC")) {
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

/** Count-up: "277" / "1.000.000" / "95%" -> JS that counts the number up from 0 (decimals stay static). */
function countUp(sel, text, at, dur = 0.9) {
  const m = String(text).match(/^(\D*)(\d{1,3}(?:([.,])\d{3})+|\d+)(\D*)$/);
  if (!m) return null;
  const [, pre, num, sep, post] = m;
  const target = Number(num.replace(/[.,]/g, ""));
  const fmt = sep ? `String(Math.round(p.v)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ${JSON.stringify(sep)})` : "String(Math.round(p.v))";
  return `{ const el = document.querySelector("${sel}"), p = { v: 0 };
          tl.fromTo(p, { v: 0 }, { v: ${target}, duration: ${dur}, ease: "power2.out", immediateRender: false,
            onUpdate: () => { el.textContent = ${JSON.stringify(pre)} + ${fmt} + ${JSON.stringify(post)}; } }, ${f3(at)}); }`;
}

function stat(c, ctx) {
  const { id, card, st } = ctx;
  if (!c.text) throw new Error(`card ${c.id}: stat needs text`);
  const size = Math.max(40, Math.min(c.size || 210, Math.floor((card.w - 60) / Math.max(0.01, textEm(c.text)))));
  const html = `<div id="card-${id}-t" style="position:absolute;left:0;right:0;top:0;height:${card.sh}px;display:flex;align-items:center;justify-content:center;font-family:'${FONT}';font-weight:900;letter-spacing:-0.02em;line-height:1;font-size:${size}px;color:${c.color || st.statColor};opacity:0;
            text-shadow:0 0 0 #fff,5px 0 0 #fff,-5px 0 0 #fff,0 5px 0 #fff,0 -5px 0 #fff,4px 4px 0 #fff,-4px 4px 0 #fff,4px -4px 0 #fff,-4px -4px 0 #fff,0 14px 22px rgba(0,0,0,0.28)">${esc(c.text)}</div>`;
  const at = c.countAt ?? 0.05;
  const js = [`tl.fromTo("#card-${id}-t", { opacity: 0, x: -160, filter: "blur(16px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.36, ease: "expo.out", immediateRender: false }, ${f3(at)});`];
  if (c.count) { const cj = countUp(`#card-${id}-t`, c.text, at, c.countDur ?? 0.9); if (cj) js.push(cj); }
  return { html, js, bg: "transparent" };
}

/** Build one card. ctx: { id, s: 0, e: duration, card: { w, h, sh }, st: { accent, statColor }, src(path)->project-relative, readFile(rel)->string } */
export function buildCard(c, ctx) {
  const theme = THEMES[c.theme] || (c.kind === "compose" && c.bg && !THEMES[c.bg] ? THEMES.dark : THEMES[c.bg] || THEMES.dark);
  const out = { logos, stat, chart, flow, compose, html: htmlFragment }[c.kind](c, { ...ctx, theme });
  const bg = out.bg ?? (c.kind === "compose" && c.bg && !THEMES[c.bg] ? "#000" : theme.bg);
  return { ...out, bg };
}
