// Loudness helpers on ffmpeg: RMS profiles, a file's speech/music body level, dB -> data-volume.
import { run } from "./util.mjs";

/** Per-window RMS (dBFS) over the whole file: [{ t, db }], window = `step` seconds. */
export async function rmsFrames(file, step = 0.1) {
  const sr = 16000, n = Math.round(sr * step);
  const { stderr } = await run("ffmpeg", [
    "-hide_banner", "-i", file, "-ac", "1", "-ar", String(sr),
    "-af", `asetnsamples=n=${n}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`,
    "-f", "null", "-",
  ]);
  const out = [];
  let t = null;
  for (const line of stderr.split("\n")) {
    const pt = line.match(/pts_time:([\d.]+)/);
    if (pt) t = +pt[1];
    const m = line.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (m && t != null) out.push({ t, db: m[1] === "-inf" ? -120 : +m[1] });
  }
  return out;
}

export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const cache = new Map();
/** 50 ms RMS profile of a file -> { med (the body: speech or music), max (loudest 50 ms) }. */
export async function levels(file) {
  if (!cache.has(file)) {
    const fr = (await rmsFrames(file, 0.05)).map((f) => f.db);
    const body = fr.filter((d) => d > -50);
    cache.set(file, { med: body.length ? median(body) : -60, max: Math.max(...fr) });
  }
  return cache.get(file);
}

/** dB -> data-volume (1 = 0 dB, capped at +12 dB). */
export const gain = (db) => +Math.min(3.98, Math.max(0.02, 10 ** (db / 20))).toFixed(3);
