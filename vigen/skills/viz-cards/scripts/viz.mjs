#!/usr/bin/env node
// cards.json -> one HyperFrames sub-composition per card: compositions/cards/<id>.html.
//
//   node <skill>/scripts/viz.mjs <project> [id …]      all cards, or only these
//
// cards.json: { "accent"?, "statColor"?, "size"?: { "w", "h", "safe" }, "cards": [ { "id", "kind", "start", "end", … } ] }
// Times (start, end, every item `at`) are seconds on the VIDEO clock, like transcript.json, so the talking-head
// retime moves them with everything else; each card's own timeline starts at its `start`. Card size: `size`,
// else the panel of shots.json / the default panel (above the presenter's head), else 928×600.
// Place a card with the shots skill: a panel { "comp": "cards/<id>", "start", "end", "in", "out" } with the same times.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, f3, projectDir, talkingInfo, localize, shipFonts, loadFormat, underlay, NeedsInput, exitOnError, isMain } from "./lib/util.mjs";
import { KINDS, buildCard, vizBaseCss } from "./lib/cards.mjs";

const TIME_FIELDS = ["at", "countAt"];

/** Card size: cards.json size > shots.json panel > the default panel tucked behind the head (as in shots.mjs). */
function cardSize(proj, spec) {
  if (spec.size) return { w: spec.size.w, h: spec.size.h, sh: spec.size.safe ?? spec.size.h };
  const info = talkingInfo(proj);
  const W = info?.width ?? 1080, H = info?.height ?? 1920;
  const headTop = info?.layout?.headTop ?? 0.41, overlap = 0.085;
  const bottom = (headTop + overlap) * H, top = Math.max(0.07 * H, bottom - 0.321 * H);
  const def = { w: Math.round(0.86 * W), h: Math.round(bottom - top), sh: Math.round(bottom - top - (overlap * H + 12)) };
  const p = readJson(path.join(proj, "shots.json"), {}).panel;
  return p ? { w: p.w ?? def.w, h: p.h ?? def.h, sh: p.safe ?? (p.h ? p.h : def.sh) } : def;
}

/** Card spec with every item time moved onto the card's own clock (0 = start). */
function local(c) {
  const shift = (o) => {
    if (Array.isArray(o)) return o.map(shift);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, TIME_FIELDS.includes(k) && typeof v === "number" ? f3(v - c.start) : shift(v)]));
    return o;
  };
  return { ...shift(c), start: 0, end: f3(c.end - c.start) };
}

export function writeCard(proj, c, { size, accent = "#0E78D0", statColor = "#0A1F6E" }) {
  if (!KINDS.has(c.kind)) throw new Error(`card ${c.id}: kind "${c.kind}" is not one of ${[...KINDS].join(", ")}`);
  if (!(c.end > c.start)) throw new Error(`card ${c.id}: needs start < end (video seconds)`);
  const id = String(c.id).replace(/[^a-zA-Z0-9_-]/g, "-");
  const dur = f3(c.end - c.start);
  const out = buildCard(local(c), {
    id, s: 0, e: dur, abs: { s: f3(c.start), e: f3(c.end) }, card: size, st: { accent, statColor },
    src: (p) => localize(proj, p),
    readFile: (rel) => fs.readFileSync(path.isAbsolute(rel) ? rel : fs.existsSync(path.join(proj, rel)) ? path.join(proj, rel) : path.resolve(ROOT, rel), "utf8"),
  });
  const faces = shipFonts(proj);
  const file = path.join(proj, "compositions", "cards", `${id}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<!doctype html>
<html>
  <body>
    <template>
      <style>
      ${faces}
      #card-${id} { position: absolute; inset: 0; overflow: hidden; background: ${out.bg}; }${vizBaseCss()}
      ${out.css || ""}
      </style>
      <div id="card-${id}" data-composition-id="card-${id}" data-width="${size.w}" data-height="${size.h}">
        <div class="viz">
          ${out.html}
        </div>
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.to({}, { duration: ${dur} }, 0);
        const TL = tl;
        // html cards write times on the video clock: this tl shifts them onto the card's own
        const shifted = (S) => { const p = (t) => (typeof t === "number" ? t - S : t);
          return { fromTo: (a, b, c, t) => TL.fromTo(a, b, c, p(t)), to: (a, b, t) => TL.to(a, b, p(t)), from: (a, b, t) => TL.from(a, b, p(t)),
            set: (a, b, t) => TL.set(a, b, p(t)), call: (f, x, t) => TL.call(f, x, p(t)) }; };
        ${out.js.join("\n        ")}
        window.__timelines["card-${id}"] = tl;
      </script>
    </template>
  </body>
</html>
`);
  return { file, comp: `cards/${id}`, cid: `card-${id}` };
}

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "viz.mjs <project> [id …]");
  const raw = readJson(path.join(proj, "cards.json"), null);
  // the template's brand colours and cards section are defaults under cards.json
  const fmt = raw ? loadFormat(proj, raw) : {}, brand = fmt.brand || {};
  const spec = raw && underlay(underlay({ accent: brand.accent, statColor: brand.statColor }, fmt.cards || {}), raw);
  if (!spec?.cards?.length) throw new NeedsInput(`${path.relative(ROOT, proj)}/cards.json has no cards: write them first (references/kinds.md).`);
  const only = new Set(args._.slice(1));
  const size = cardSize(proj, spec);
  const panels = readJson(path.join(proj, "shots.json"), {}).panels || [];
  for (const c of spec.cards.filter((x) => !only.size || only.has(x.id))) {
    const { file, comp } = writeCard(proj, c, { size, accent: spec.accent, statColor: spec.statColor });
    const p = panels.find((x) => x.comp === comp);
    const note = !p ? ` — not placed yet: shots.json panel { "comp": "${comp}", "start": ${c.start}, "end": ${c.end} }`
      : Math.abs(p.start - c.start) > 0.01 ? ` — ! its panel starts at ${p.start}s, the card at ${c.start}s: give them the same start` : "";
    log(`${path.relative(proj, file)}: ${c.kind}, ${f3(c.end - c.start)}s${note}`);
  }
  log(`card size ${size.w}×${size.h} (safe ${size.sh}px). Rerun the shots skill after adding panels.`);
}

if (isMain(import.meta.url)) main().catch(exitOnError);
