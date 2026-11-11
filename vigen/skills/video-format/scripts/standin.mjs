#!/usr/bin/env node
// A stand-in plate: the whole edit, previewed before any lipsync credit is spent.
//
//   node <skill>/scripts/standin.mjs <parts dir> --koi <koiDir> [--still] [--color 9AA3AD] [--look NAME]
//
// For every part (vigen parts.mjs: parts.json + part-NN.mp3, made by `parts.mjs voice`), the frame it will be
// lipsynced from (the part's look in <parts dir>/looks.json, else --look, else the koi's avatar) is held for the
// length of its voice. By default the presenter is a flat silhouette over the real set (matted with
// `hyperframes remove-background`, cached in <parts dir>/standin/), so the preview shows where they sit without
// pretending to be the take; --still keeps the frame as it is. Writes <parts dir>/standin.mp4 (30 fps, a
// keyframe every second, the parts' voice as its audio) and <parts dir>/standin.json { video, seams, duration,
// parts }, which talking-head prep takes like a real take:
//
//   node <talking-head>/scripts/prep.mjs videos/<slug> --video <parts dir>/standin.mp4 --script … --seams-from <parts dir>/standin.json
//
// After the lipsync, prep the real talking.mp4 and run talking-head retime.mjs: the edit moves onto the take.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { parseArgs, readJson, writeJson, ffmpeg, probe, run, log, NeedsInput, exitOnError, ROOT } = await import(
  path.join(SKILLS, "talking-head/scripts/lib/util.mjs")
);
const { removeBackground, measureCutout } = await import(path.join(SKILLS, "talking-head/scripts/lib/media.mjs"));

const FPS = 30;

async function seconds(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

async function main() {
  const args = parseArgs();
  const dir = args._[0] && path.resolve(ROOT, args._[0]);
  if (!dir || !fs.existsSync(path.join(dir, "parts.json")))
    throw new NeedsInput("standin.mjs <parts dir> --koi <koiDir>: the parts dir needs parts.json and the voices (vigen parts.mjs voice).");
  if (!args.koi) throw new NeedsInput("Missing --koi <koiDir>.");
  const koiDir = path.resolve(ROOT, args.koi);
  const koi = readJson(path.join(koiDir, "koi.json"), null);
  if (!koi) throw new NeedsInput(`No koi.json in ${args.koi}.`);
  const state = readJson(path.join(dir, "parts.json"));
  const looks = readJson(path.join(dir, "looks.json"), {});
  const style = args.still ? "still" : "silhouette";
  const color = String(args.color || "9AA3AD").replace(/^#/, "");
  const work = path.join(dir, "standin");
  fs.mkdirSync(work, { recursive: true });

  // the frame each part is lipsynced from, exactly as parts.mjs picks it
  const frameOf = (p) => {
    const look = looks[p.index] ?? looks[String(p.index)] ?? (typeof args.look === "string" ? args.look : null);
    const rel = look ? koi.looks?.[look]?.frame : koi.avatar?.frame;
    if (!rel) throw new NeedsInput(look ? `The koi has no look "${look}" (part ${p.index}): add it first (vigen.mjs koi add-look).` : "The koi has no avatar frame.");
    return { look: look ?? "avatar", file: path.join(koiDir, rel) };
  };

  // one picture per look: the silhouette over the set, or the frame itself
  const pictures = new Map();
  let W, H;
  for (const p of state.parts) {
    const { look, file } = frameOf(p);
    if (pictures.has(look)) continue;
    const info = await probe(file);
    // libx264 with yuv420p needs even sides (a 768×1357 photo fails to encode)
    W ??= info.video.width & ~1;
    H ??= info.video.height & ~1;
    if (style === "still") { pictures.set(look, file); continue; }
    const cut = path.join(work, `${look}-cutout.png`), sil = path.join(work, `${look}-silhouette.png`);
    if (!fs.existsSync(cut)) {
      log(`matting the ${look} frame…`);
      await removeBackground(file, cut);
    }
    if (!fs.existsSync(sil) || fs.statSync(sil).mtimeMs < fs.statSync(cut).mtimeMs)
      await ffmpeg(["-i", file, "-i", cut, "-filter_complex",
        `[1:v]format=rgba,scale=${info.video.width}:${info.video.height},format=rgba,alphaextract,format=gray[m];` +
        `color=c=0x${color}:s=${info.video.width}x${info.video.height},format=rgb24[c];[c][m]alphamerge[s];[0:v][s]overlay=format=auto`,
        "-frames:v", "1", sil]);
    pictures.set(look, sil);
  }

  // one segment per part: its picture held for whole frames covering its voice, picture and sound cut to the
  // same length in one pass (encoding segments separately lets AAC padding push every seam a frame or two late)
  const inputs = [], chains = [], parts = [];
  let frames = 0;
  for (const [i, p] of state.parts.entries()) {
    const id = String(p.index).padStart(2, "0");
    // an interview part's sound is both voices (part-NN.full.mp3); the koi-only part-NN.mp3 is for the lipsync
    const full = path.join(dir, `part-${id}.full.mp3`);
    const mp3 = fs.existsSync(full) ? full : path.join(dir, `part-${id}.mp3`);
    if (!fs.existsSync(mp3)) throw new NeedsInput(`No voice for part ${p.index}: run vigen parts.mjs voice first.`);
    const { look } = frameOf(p);
    const n = Math.round((await seconds(mp3)) * FPS), d = (n / FPS).toFixed(6);
    inputs.push("-loop", "1", "-framerate", String(FPS), "-i", pictures.get(look), "-i", mp3);
    chains.push(`[${2 * i}:v]scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p,trim=end_frame=${n},setpts=PTS-STARTPTS[v${i}];` +
      `[${2 * i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${d},atrim=0:${d},asetpts=PTS-STARTPTS[a${i}]`);
    parts.push({ index: p.index, look, startsAt: +(frames / FPS).toFixed(3), seconds: +(n / FPS).toFixed(3) });
    frames += n;
  }
  const video = path.join(dir, "standin.mp4");
  await ffmpeg([...inputs, "-filter_complex",
    chains.join(";") + ";" + parts.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${parts.length}:v=1:a=1[v][a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-g", String(FPS),
    "-keyint_min", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", video]);
  const seams = parts.slice(1).map((p) => p.startsAt);
  const out = { video: path.relative(ROOT, video), style, duration: +(frames / FPS).toFixed(3), seams, parts };
  // where the presenter sits, measured on the first part's real matte: matting the flat silhouette finds no head
  // (it kept only the fingers on the desk and put the face at 93 % down), so prep takes this layout instead
  if (style === "silhouette") out.layout = await measureCutout(path.join(work, `${frameOf(state.parts[0]).look}-cutout.png`));
  writeJson(path.join(dir, "standin.json"), out);
  console.log(JSON.stringify(out, null, 2));
}

main().catch(exitOnError);
