// Headless Chrome without npm: the binary HyperFrames/Puppeteer already downloaded, run from the CLI.
//   measure  --dump-dom on a page whose own script writes its result into the DOM
//   shot     --screenshot of a page (file:// or a public URL)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const vnum = (s) => (s.match(/\d+/g) || []).map(Number);
const newestFirst = (a, b) => {
  const x = vnum(a), y = vnum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};

let found;
/** Path of a Chrome that runs headless: $CHROME_PATH, Puppeteer's cache (headless shell first), installed Chrome. */
export function findChrome() {
  if (found) return found;
  const cands = [];
  if (process.env.CHROME_PATH) cands.push(process.env.CHROME_PATH);
  const cache = path.join(os.homedir(), ".cache", "puppeteer");
  for (const [kind, rels] of [
    ["chrome-headless-shell", ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-headless-shell-mac-x64/chrome-headless-shell", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-headless-shell-win64/chrome-headless-shell.exe"]],
    ["chrome", ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-linux64/chrome", "chrome-win64/chrome.exe"]],
  ]) {
    const dir = path.join(cache, kind);
    if (!fs.existsSync(dir)) continue;
    for (const v of fs.readdirSync(dir).sort(newestFirst)) for (const r of rels) cands.push(path.join(dir, v, r));
  }
  cands.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser");
  found = cands.find((p) => fs.existsSync(p));
  if (!found) {
    const err = new Error("NEEDS INPUT: no headless Chrome found. Run any `npx hyperframes snapshot` once (it downloads one into ~/.cache/puppeteer) or set CHROME_PATH.");
    err.needsInput = true;
    throw err;
  }
  return found;
}

const BASE = ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--mute-audio", "--force-device-scale-factor=1"];

/** Load `html` (a full document) and return the base64 JSON its script put in <pre id="__out">. */
export function measure(html, { width = 1600, height = 1200, budget = 3000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ui-demo-"));
  const file = path.join(dir, "measure.html");
  fs.writeFileSync(file, html);
  try {
    const dom = execFileSync(findChrome(), [...BASE, `--window-size=${width},${height}`, `--virtual-time-budget=${budget}`, "--dump-dom", `file://${file}`],
      { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"], timeout: 60000 });
    const m = dom.match(/<pre id="__out">([A-Za-z0-9+/=]*)<\/pre>/);
    if (!m || !m[1]) throw new Error("measure page produced no result (did a screen script throw?)");
    return JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Screenshot a URL (file:// or https://) at width×height into `out` (PNG). */
export function shot(url, out, { width, height, budget = 4000, userAgent } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = [...BASE, `--window-size=${width},${height}`, `--virtual-time-budget=${budget}`, `--screenshot=${out}`];
  if (userAgent) args.push(`--user-agent=${userAgent}`);
  execFileSync(findChrome(), [...args, url], { stdio: ["ignore", "ignore", "ignore"], timeout: 90000 });
  if (!fs.existsSync(out)) throw new Error(`no screenshot written for ${url}`);
  return out;
}
