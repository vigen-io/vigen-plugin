// Numbered contact sheets: one labelled thumbnail per item, tiled 4 across. The agent reads these to judge
// or label media, so labels carry everything needed to refer back to an item (number / id, kind, length).
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR, ffmpeg } from "./util.mjs";

const FONT = path.join(SKILL_DIR, "template/assets/fonts/BeVietnamPro-Bold.ttf");
export const TW = 400, TH = 266; // ≈ card aspect (0.86 W × 0.321 H of 1080×1920 ≈ 1.5)

// Every thumb is forced to rgb24: mixed pixel formats (jpg vs png/alpha) make ffmpeg reinit the tile
// filter mid-stream, which silently drops every tile before the switch.
const safe = (s) => String(s).replace(/[':\\%]/g, "").slice(0, 46);

/** items: [{ previewFile (absolute), label, contain? (show whole, letterboxed, instead of card-crop) }] -> writes `out` (jpg). Thumbs go in a sibling temp folder. */
export async function contactSheet(out, items, { cols = 4 } = {}) {
  const tdir = `${out}.thumbs`;
  fs.rmSync(tdir, { recursive: true, force: true });
  fs.mkdirSync(tdir, { recursive: true });
  let i = 0;
  for (const it of items) {
    const t = path.join(tdir, `t_${String(++i).padStart(3, "0")}.png`);
    const text = `drawtext=fontfile='${FONT}':text='${safe(it.label)}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6`;
    try {
      await ffmpeg(["-i", it.previewFile, "-frames:v", "1", "-vf",
        (it.contain
          ? `scale=${TW}:${TH}:force_original_aspect_ratio=decrease,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2:color=black,`
          : `scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},`) + text + ",format=rgb24", t]);
    } catch {
      await ffmpeg(["-f", "lavfi", "-i", `color=c=gray:s=${TW}x${TH}`, "-frames:v", "1", "-vf", `${text.replace(safe(it.label), `${safe(it.label)} (no preview)`)},format=rgb24`, t]);
    }
  }
  const c = Math.min(cols, items.length), rows = Math.ceil(items.length / c);
  await ffmpeg(["-i", path.join(tdir, "t_%03d.png"), "-vf", `tile=${c}x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "3", out]);
  fs.rmSync(tdir, { recursive: true, force: true });
  return out;
}
