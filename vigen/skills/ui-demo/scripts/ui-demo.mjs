#!/usr/bin/env node
// UI demo CLI — build, look at and reuse step-by-step app walkthroughs made from a mock screen.
//
//   node <skill>/scripts/ui-demo.mjs screens
//       built-in screens (screens/*.html) and their data-ui targets
//   node <skill>/scripts/ui-demo.mjs shot <demo.json> [--at 22.4,24.3 | --every 0.5]
//       [--size 929x616 --safe 441] [--out <dir>]
//       frames at those times (+ sheet.jpg) and the click times (for sound accents). Look at every frame.
//   node <skill>/scripts/ui-demo.mjs match <screen> --ref ui-refs/<real>.png [--show sel,sel] [--hide sel,sel] [--name <state>]
//       FIDELITY: the mock in one state next to a screenshot of the real app (+ 50/50 overlay, SSIM) and
//       match.md, the scorecard Claude fills in; edit the screen until PASS (SKILL.md § 3)
//   node <skill>/scripts/ui-demo.mjs qa <same input> [--ref ui-refs/a.png,ui-refs/b.png] [--out <dir>]
//       visual QA: automatic findings + a frame per step at the moment it settles, captioned with the step and
//       the words spoken (from transcript.json) -> qa.jpg + qa.md, the scorecard Claude fills in (SKILL.md § 4)
//   node <skill>/scripts/ui-demo.mjs preview <same input> [--out <dir>]
//       preview.html that loops the demo in a browser (open it, or hand it to the user)
//   node <skill>/scripts/ui-demo.mjs ref <https://public.page> [--size 1280x800] [--out <dir>]
//       screenshot of a PUBLIC page as a layout reference (robots.txt is honoured; logins/bot walls: ask the user)
//   node <skill>/scripts/ui-demo.mjs compose <demo.json> [--id <name>] [--size WxH --safe <px>] [--out <file>]
//       a HyperFrames sub-composition: <project>/compositions/ui-<id>.html, its timeline starting at the demo's
//       start; place it as a shots panel { "comp": "ui-<id>", "start", "end" } (or mount it by hand)
//
// A demo.json is { "id", "screen", "steps", "view", "cursor", "shown", "hidden", "bg", "start", "end" }, times on
// the video clock (transcript.json). It lives in a project (videos/<slug>/ui/<id>.json): the size defaults to
// the project's panel (shots.json, else the slot above the presenter's head), else 929×616 (safe 441).
// --size/--safe override (--safe = the height above the presenter's head). Exit 3 + "NEEDS INPUT:" = ask the user.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { previewPage, subComposition, listScreens, SKILL_DIR, QA_STRIP } from "./lib/engine.mjs";
import { shot } from "./lib/chrome.mjs";

const CWD = process.cwd();
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
const need = (msg) => die(`NEEDS INPUT: ${msg}`, 3);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2), v = argv[i + 1];
      if (v == null || v.startsWith("--")) out[k] = true; else { out[k] = v; i++; }
    } else out._.push(a);
  }
  return out;
}
const size = (s, d) => { const m = String(s || d).match(/^(\d+)x(\d+)$/); if (!m) need(`--size must look like 929x616 (got ${s})`); return [+m[1], +m[2]]; };

/** The project a demo.json sits in (the nearest folder up with talking.json), or null. */
function projectOf(dir) {
  for (let d = dir; d !== path.dirname(d); d = path.dirname(d)) if (fs.existsSync(path.join(d, "talking.json"))) return d;
  return null;
}

/** The panel the demo will fill: shots.json panel, else the default slot tucked behind the presenter's head. */
function panelOf(proj) {
  if (!proj) return { w: 929, h: 616, sh: 441 };
  const info = JSON.parse(fs.readFileSync(path.join(proj, "talking.json"), "utf8"));
  const W = info.width ?? 1080, H = info.height ?? 1920, headTop = info.layout?.headTop ?? 0.41, overlap = 0.085;
  const bottom = (headTop + overlap) * H, top = Math.max(0.07 * H, bottom - 0.321 * H);
  const def = { w: Math.round(0.86 * W), h: Math.round(bottom - top), sh: Math.round(bottom - top - (overlap * H + 12)) };
  const shots = path.join(proj, "shots.json");
  const p = fs.existsSync(shots) ? JSON.parse(fs.readFileSync(shots, "utf8")).panel : null;
  return p ? { w: p.w ?? def.w, h: p.h ?? def.h, sh: p.safe ?? p.h ?? def.sh } : def;
}

/** demo.json -> { spec, root (for relative screen paths), proj, w, h, sh, s, e, id }. */
function loadInput(args) {
  const file = args._[1];
  if (!file) need("which demo? give a demo.json (videos/<slug>/ui/<id>.json)");
  const abs = path.resolve(CWD, file);
  if (!fs.existsSync(abs)) need(`${file} does not exist`);
  const json = JSON.parse(fs.readFileSync(abs, "utf8"));
  const proj = projectOf(path.dirname(abs));
  const slot = panelOf(proj);
  const [w, h] = args.size ? size(args.size) : [slot.w, slot.h];
  const s = json.start ?? 0;
  return { spec: json, root: args.root ? path.resolve(CWD, args.root) : proj || path.dirname(abs), proj, w, h,
    sh: args.safe ? +args.safe : args.size ? h : slot.sh, s, e: json.end ?? Math.max(s + 2, ...(json.steps || []).map((x) => (x.at ?? 0) + 1.5)),
    id: String(args.id || json.id || path.basename(abs, ".json")), accent: json.accent };
}

function build(args) {
  const inp = loadInput(args);
  const readFile = (rel) => fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(inp.root, rel), "utf8");
  const out = path.resolve(CWD, args.out || path.join(inp.root, "work", "ui", inp.id));
  fs.mkdirSync(out, { recursive: true });
  const id = inp.id.replace(/[^A-Za-z0-9_-]/g, "-");
  const res = previewPage(inp.spec, { id, w: inp.w, h: inp.h, sh: inp.sh, s: inp.s, e: inp.e, accent: inp.accent, readFile, base: inp.root });
  const file = path.join(out, "preview.html");
  fs.writeFileSync(file, res.page);
  return { inp, res, out, file };
}

const rel = (p) => path.relative(CWD, p) || p;

function cmdShot(args) {
  const { inp, res, out, file } = build(args);
  let times = args.at ? String(args.at).split(",").map(Number) : null;
  if (!times) {
    const step = +(args.every || 0), pts = new Set([inp.s + 0.3]);
    for (const st of inp.spec.steps || []) if (st.at != null) pts.add(+(st.at + 0.35).toFixed(2));
    if (step > 0) for (let t = inp.s; t <= inp.e; t += step) pts.add(+t.toFixed(2));
    pts.add(+(inp.e - 0.1).toFixed(2));
    times = [...pts].filter((t) => t >= inp.s && t <= inp.e).sort((a, b) => a - b);
  }
  for (const f of fs.readdirSync(out)) if (/^f\d+\.png$/.test(f)) fs.rmSync(path.join(out, f));
  const frames = times.map((t, i) => {
    const png = path.join(out, `f${String(i).padStart(2, "0")}.png`);
    shot(`${pathToFileURL(file).href}#${t}`, png, { width: inp.w, height: inp.h });
    return { t, png };
  });
  let sheet = "";
  try {
    const cols = Math.min(3, frames.length), rows = Math.ceil(frames.length / cols);
    sheet = path.join(out, "sheet.jpg");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(out, "f%02d.png"), "-vf", `scale=${Math.round(inp.w / 2)}:-1,tile=${cols}x${rows}:padding=6:color=0x222222`, "-frames:v", "1", "-q:v", "3", sheet]);
  } catch { sheet = ""; }
  console.log(`screen ${res.size.w}×${res.size.h}, overview zoom ${res.size.overview}; card ${inp.w}×${inp.h}, clear band ${inp.sh}px (below the dashed line the presenter's head covers it)`);
  frames.forEach((f) => console.log(`  ${f.t.toFixed(2)}s  ${rel(f.png)}`));
  if (sheet) console.log(`sheet: ${rel(sheet)} (frames in time order, left to right)`);
  const clicks = res.events.filter((x) => x.kind === "click"), lifts = res.events.filter((x) => x.kind === "lift");
  if (clicks.length) console.log(`clicks (a soft "click" accent can land on these): ${clicks.map((x) => `${x.t}s ${x.target}`).join(", ")}`);
  if (lifts.length) console.log(`lifts (a soft "pop"/"swoop" can land on these): ${lifts.map((x) => `${x.t}s ${x.target}`).join(", ")}`);
}

const escH = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (s, n = 48) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Visual QA: a frame per step at the moment it settles, captioned with the step, the words spoken around it
 *  and the automatic findings; references first. Writes qa.jpg + qa.md (the scorecard Claude fills in). */
function cmdQa(args) {
  const { inp, res, out, file } = build(args);
  const tPath = path.join(inp.root, "transcript.json");
  const words = fs.existsSync(tPath) ? JSON.parse(fs.readFileSync(tPath, "utf8")) : [];
  const said = (t) => words.filter((w) => w.start >= t - 1.3 && w.start <= t + 0.3).map((w) => w.text).join(" ");
  const lintsOf = (n) => res.lints.filter((l) => l.step === n);
  const H = inp.h + QA_STRIP;
  const shots = [{ t: +(inp.s + 0.3).toFixed(2), step: 0, cap: `<b>#0 start</b> — first view${said(inp.s + 0.3) ? `<br><span class="w">said: ${escH(said(inp.s + 0.6))}</span>` : ""}` }];
  for (const c of res.checks) {
    const what = [escH(c.target || ""), c.text ? `"${escH(short(c.text))}"` : "", c.label ? `label "${escH(c.label)}"` : ""].filter(Boolean).join(" ");
    const ls = lintsOf(c.step).map((l) => `<span class="l">! ${escH(l.msg)}</span>`).join("");
    shots.push({ t: c.t, step: c.step, cap: `<b>#${c.step} ${c.do}</b> ${what} · at ${c.at}s, frame ${c.t}s${words.length ? `<br><span class="w">said: ${escH(said(c.at)) || "—"}</span>` : ""}${ls}` });
  }
  for (const f of fs.readdirSync(out)) if (/^q\d+\.png$/.test(f)) fs.rmSync(path.join(out, f));
  let n = 0;
  const pngs = [];
  for (const r of String(args.ref || "").split(",").filter(Boolean)) { // references first, letterboxed to the tile size
    const png = path.join(out, `q${String(n++).padStart(2, "0")}.png`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.resolve(CWD, r), "-vf", `scale=${inp.w}:${H}:force_original_aspect_ratio=decrease,pad=${inp.w}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x1b1b1b`, png]);
    pngs.push({ png, label: `reference ${path.basename(r)}` });
  }
  for (const sh of shots) {
    const png = path.join(out, `q${String(n++).padStart(2, "0")}.png`);
    shot(`${pathToFileURL(file).href}#${sh.t}|${Buffer.from(sh.cap, "utf8").toString("base64")}`, png, { width: inp.w, height: H }); // caption as base64: quotes/parens break the URL
    pngs.push({ png, label: `#${sh.step} @${sh.t}s` });
  }
  const sheet = path.join(out, "qa.jpg");
  const cols = Math.min(+(args.cols || 3), pngs.length), rows = Math.ceil(pngs.length / cols);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(out, "q%02d.png"), "-vf", `scale=${Math.round(inp.w * 0.6)}:-1,tile=${cols}x${rows}:padding=8:color=0x000000`, "-frames:v", "1", "-q:v", "3", sheet]);

  const row = (sh) => `| ${sh.step} | ${sh.t}s | ${sh.step ? `${res.checks.find((c) => c.step === sh.step).do} ${(res.checks.find((c) => c.step === sh.step).target || "").replace(/\|/g, "\\|")}` : "start"} |  |  |  |  |  |  |`;
  const md = `# UI demo QA — ${inp.id}

Card ${inp.s}–${inp.e} s · screen \`${inp.spec.screen}\` · sheet \`${rel(sheet)}\`${args.ref ? ` (first tile${String(args.ref).split(",").length > 1 ? "s" : ""}: reference)` : " · no reference given"}

## Automatic checks
${res.lints.length ? res.lints.map((l) => `- [ ] step ${l.step} @${l.t}s: ${l.msg}`).join("\n") : "- none"}

## Per frame — ✅ or ❌ + what is wrong
1 the thing the narration names is visible and is the focus · 2 above the head line and readable at phone size ·
3 the right state (dialog open, text in, page switched) · 4 nothing invented beyond the script ·
5 clean: no clipping, overlap, cursor over the text, empty card edge, half-finished motion

| # | frame | step | 1 | 2 | 3 | 4 | 5 | notes |
|---|---|---|---|---|---|---|---|---|
${shots.map(row).join("\n")}

## Whole card
- 6 Looks like the app today (vs reference: labels, layout, colours, icons):
- 7 Pacing: each action lands on its words; ≥ 0.5 s between visible events; the camera is calm:
- 8 Says no more than the script (no made-up prompt, secret, data or results):
- 9 Follows at phone size without pausing; a first-time viewer could repeat the steps:

## Verdict: PASS | FIX
Fixes:
`;
  const mdPath = path.join(out, "qa.md");
  fs.writeFileSync(mdPath, md);
  console.log(`QA ${inp.id}: ${shots.length} frames${args.ref ? " + reference" : ""} -> ${rel(sheet)}`);
  console.log(res.lints.length ? `automatic findings (${res.lints.length}):\n${res.lints.map((l) => `  ! step ${l.step} @${l.t}s: ${l.msg}`).join("\n")}` : "automatic findings: none");
  console.log(`NOW JUDGE: open ${rel(sheet)} (and each q*.png that looks off), fill in ${rel(mdPath)}, fix the steps/screen and rerun until the verdict is PASS.`);
}

const ff = (a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);

/** Fidelity: the mock in one state, rendered at its own viewport, next to a screenshot of the real app.
 *  -> side.png (left real, right mock), blend.png (50/50 overlay), an SSIM trend number and match.md,
 *  the scorecard Claude fills in (SKILL.md § 3). */
function cmdMatch(args) {
  const screen = args._[1];
  if (!screen || !args.ref) need("match <screen name | ui/app.html> --ref <real screenshot.png> [--show sel,sel] [--hide sel,sel] [--name <state>]");
  const refAbs = path.resolve(CWD, args.ref);
  if (!fs.existsSync(refAbs)) need(`${args.ref} does not exist`);
  const list = (v) => (v && v !== true ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);
  const readFile = (r) => fs.readFileSync(path.resolve(CWD, r), "utf8");
  const name = args.name || path.basename(args.ref).replace(/\.[^.]+$/, "");
  const out = path.resolve(CWD, args.out || path.join("ui-refs", "match", `${path.basename(screen, ".html")}-${name}`));
  fs.mkdirSync(out, { recursive: true });
  const spec = { screen, steps: [], cursor: false, shown: list(args.show), hidden: list(args.hide) };

  // render the mock 1:1 at its own size
  const { size } = previewPage(spec, { id: "m", w: 100, h: 100, readFile, bare: true });
  const sw = Math.round(size.w), sh = Math.round(size.h);
  // base = where the command runs (the project), so a screen's own image files (ui/<file>) load
  const page = previewPage(spec, { id: "m", w: sw, h: sh, sh, s: 0, e: 1, readFile, bare: true, base: CWD }).page;
  const pageFile = path.join(out, "mock.html");
  fs.writeFileSync(pageFile, page);
  const mock = path.join(out, "mock.png");
  shot(`${pathToFileURL(pageFile).href}#0.5`, mock, { width: sw, height: sh });

  // the reference at the same CSS width (screenshots are often 2× device pixels), top-aligned
  const [rw, rh] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", refAbs], { encoding: "utf8" }).trim().split(",").map(Number);
  const refS = path.join(out, "ref.png");
  ff(["-i", refAbs, "-vf", `scale=${sw}:-2,crop=${sw}:'min(ih,${sh})':0:0,pad=${sw}:${sh}:0:0:color=white`, refS]);
  ff(["-i", refS, "-i", mock, "-filter_complex", "[0]pad=iw+16:ih:0:0:color=0xff3b6b[a];[a][1]hstack", path.join(out, "side.png")]);
  ff(["-i", refS, "-i", mock, "-filter_complex", "[0][1]blend=all_mode=average", path.join(out, "blend.png")]);
  const log = spawnSync("ffmpeg", ["-i", refS, "-i", mock, "-lavfi", "ssim", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
  const ssim = (log.match(/All:([\d.]+)/) || [])[1] || "?";

  const dpr = Math.round((rw / sw) * 2) / 2;
  const aspectOff = Math.abs(rh / rw - sh / sw) / (sh / sw);
  const warn = aspectOff > 0.04 ? `\n> ⚠ The reference is ${rw}×${rh} (≈ ${Math.round(rw / dpr)}×${Math.round(rh / dpr)} CSS px at ${dpr}×) but the screen is ${sw}×${sh}: layouts reflow with the viewport, so the overlay will not line up. Ask for a screenshot at ${sw}×${sh} (browser window) or resize the screen root to the reference's CSS size.\n` : "";
  const md = `# Fidelity — \`${screen}\` · state "${name}"

Reference \`${args.ref}\` (${rw}×${rh}) vs mock ${sw}×${sh}${spec.shown.length ? ` · shown: ${spec.shown.join(", ")}` : ""}${spec.hidden.length ? ` · hidden: ${spec.hidden.join(", ")}` : ""}
SSIM ${ssim} — a trend between rounds only (invented content and simplified icons keep it below 1).
Files: \`side.png\` (left = real, right = mock) · \`blend.png\` (50/50 overlay: doubled edges = misplaced) · \`ref.png\` / \`mock.png\` 1:1 for zoomed looks.
${warn}
Score 0 wrong · 1 close · 2 matches, and say exactly what to change (element, property, value):

| | criterion | score | change |
|---|---|---|---|
| A | Layout skeleton: region sizes and positions (sidebar width, header height, content column, dialog size and position, gaps) | | |
| B | Every element a step touches: same label text, same place, same look — viewers must find it in the real app | | |
| C | Other labels, their order and grouping (menu items, section titles, buttons) | | |
| D | Colour: backgrounds, text greys, borders, accent, overlay darkness | | |
| E | Shape: corner radii, borders vs shadows, dividers, control heights | | |
| F | Typography: size/weight hierarchy, line height (the system font is fine) | | |
| G | Icons: same metaphor and position (simplified line icons are fine) | | |
| H | Nothing personal copied from the reference (names, emails, avatars, chat/project titles, files) | | |

PASS = B and H are 2, nothing is 0, total ≥ 13/16. Allowed differences: invented content, simplified icons,
fewer list rows, no hover states, items the video never shows near the edges.

## Verdict: PASS | FIX
Changes:
`;
  fs.writeFileSync(path.join(out, "match.md"), md);
  console.log(`match ${screen} "${name}": SSIM ${ssim} -> ${rel(path.join(out, "side.png"))} (left real, right mock), ${rel(path.join(out, "blend.png"))}`);
  if (warn) console.log(warn.replace(/\n> ⚠ /, "! ").trim());
  console.log(`NOW JUDGE: open side.png, blend.png (and ref.png/mock.png for detail), fill in ${rel(path.join(out, "match.md"))}, edit the screen and rerun until PASS.`);
}

function cmdPreview(args) {
  const { file, res } = build(args);
  console.log(`preview: ${rel(file)} — open it in a browser (loops; add #<seconds> to the URL to freeze a moment)`);
  const clicks = res.events.filter((x) => x.kind === "click"), lifts = res.events.filter((x) => x.kind === "lift");
  if (clicks.length) console.log(`clicks: ${clicks.map((x) => x.t).join(", ")}`);
  if (lifts.length) console.log(`lifts: ${lifts.map((x) => x.t).join(", ")}`);
}

function robotsRules(txt) {
  const groups = [];
  let g = null, lastWasUa = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (k === "user-agent") {
      if (!lastWasUa) groups.push((g = { ua: [], rules: [] }));
      g.ua.push(v.toLowerCase());
      lastWasUa = true;
    } else {
      lastWasUa = false;
      if (g && (k === "allow" || k === "disallow")) g.rules.push({ allow: k === "allow", path: v });
    }
  }
  return (groups.filter((x) => x.ua.includes("*")).flatMap((x) => x.rules));
}
function robotsAllows(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function cmdRef(args) {
  const url = args._[1];
  if (!url || !/^https?:\/\//.test(url)) need("ref needs a public https:// URL");
  const u = new URL(url);
  let rules = [];
  try {
    const r = await fetch(new URL("/robots.txt", u), { signal: AbortSignal.timeout(10000) });
    if (r.ok) rules = robotsRules(await r.text());
  } catch { /* no robots.txt reachable: allowed */ }
  if (!robotsAllows(rules, u.pathname + u.search)) {
    need(`${u.host}'s robots.txt disallows ${u.pathname} for crawlers. Don't capture it: ask the user for a screenshot of the screen (their own account, personal data blurred), or use the vendor's help-centre images.`);
  }
  const [w, h] = size(args.size, "1280x800");
  const out = path.resolve(CWD, args.out || "ui-refs");
  const n = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.startsWith(u.host)).length : 0;
  const png = path.join(out, `${u.host}${n ? `-${n + 1}` : ""}.png`);
  shot(u.href, png, { width: w, height: h, budget: 8000 });
  console.log(`reference: ${rel(png)} — look at it: a login wall, cookie banner or "verify you are human" page is no reference (ask the user for a screenshot instead).`);
}

function cmdCompose(args) {
  const inp = loadInput(args);
  const id = `ui-${inp.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const proj = inp.proj || CWD;
  const out = path.resolve(CWD, args.out || path.join(proj, "compositions", `${id}.html`));
  // the tag font, shipped into the project (sub-compositions resolve paths from the project root)
  const fonts = path.join(SKILL_DIR, "assets", "fonts"), dest = path.join(proj, "assets", "fonts");
  fs.mkdirSync(dest, { recursive: true });
  const faces = fs.readdirSync(fonts).filter((f) => f.endsWith(".ttf")).map((f) => {
    if (!fs.existsSync(path.join(dest, f))) fs.copyFileSync(path.join(fonts, f), path.join(dest, f));
    const wt = { Bold: 700, ExtraBold: 800, Black: 900 }[f.match(/-(\w+)\.ttf$/)?.[1]];
    return wt ? `@font-face { font-family: "Be Vietnam Pro"; font-weight: ${wt}; src: url("assets/fonts/${f}") format("truetype"); }` : "";
  }).join("\n      ");
  const html = subComposition(inp.spec, { id, w: inp.w, h: inp.h, sh: inp.sh, s: inp.s, e: inp.e, accent: inp.accent, fontFaces: faces,
    readFile: (r) => fs.readFileSync(path.isAbsolute(r) ? r : path.join(inp.root, r), "utf8") });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`wrote ${rel(out)} (${inp.w}×${inp.h}, ${inp.s}–${inp.e}s). Place it: shots.json panel { "comp": "${id}", "start": ${inp.s}, "end": ${inp.e} }, or mount it by hand (data-composition-id="${id}", see /hyperframes-core).`);
}

function cmdScreens() {
  for (const name of listScreens()) {
    const raw = fs.readFileSync(path.join(SKILL_DIR, "screens", `${name}.html`), "utf8");
    const head = (raw.match(/<!--([\s\S]*?)-->/)?.[1] || "").trim().split("\n")[0].trim();
    const ids = [...new Set([...raw.matchAll(/data-ui="([^"]+)"/g)].map((m) => m[1]))];
    console.log(`${name}\n  ${head}\n  targets: ${ids.map((i) => `[data-ui=${i}]`).join(" ")}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const cmds = { match: cmdMatch, qa: cmdQa, shot: cmdShot, preview: cmdPreview, ref: cmdRef, compose: cmdCompose, screens: cmdScreens };
const run = cmds[args._[0]];
if (!run) need(`command? ${Object.keys(cmds).join(" | ")} (see the header of ${rel(fileURLToPath(import.meta.url))})`);
Promise.resolve()
  .then(() => run(args))
  .catch((err) => (err.needsInput || /^NEEDS INPUT/.test(err.message) ? die(err.message.startsWith("NEEDS INPUT") ? err.message : `NEEDS INPUT: ${err.message}`, 3) : die(`ui-demo: ${err.message}`)));
