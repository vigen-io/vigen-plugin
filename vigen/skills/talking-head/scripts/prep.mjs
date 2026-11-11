#!/usr/bin/env node
// A talking-head clip (or several takes in a row) -> the layers an edit needs, in a HyperFrames project.
//
//   node <skill>/scripts/prep.mjs <project> --video take.mp4 [--video take2.mp4 …] --script script.txt
//        [--seams 31.4,62.0 | --seams-from parts.json] [--lang vi] [--model medium] [--canvas 1080x1920]
//   node <skill>/scripts/prep.mjs <project>          rerun: redo only what is missing or out of date
//
// Writes, each step cached:
//   assets/talking.mp4          the plate: CFR 30 fps, a keyframe every second (seek-safe), takes joined
//   assets/voice.m4a            its audio (also placed in index.html as <audio id="voice">)
//   assets/talking_cutout.webm  the presenter matted out (AI, ~6 fps on Apple silicon: minutes)
//   talking.json                { plate, cutout, voice, duration, width, height, seams, layout, sources }
//                               layout = where the subject sits (headTop, faceY, headCenterX, body box)
//   transcript.json / .txt      the SCRIPT's words with whisper's timings (never whisper's spelling)
// Seams are the joins between takes (the pose resets there): computed when several --video are given,
// or passed in (vigen's parts tool reports them). A new plate keeps the old timings in work/prev-<time>/
// and prints the retime command that moves every spec onto the new take.
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseArgs, log, readJson, writeJson, probe, ffmpeg, f3, projectDir, ensureIndex, setBlock, NeedsInput, exitOnError, cmd } from "./lib/util.mjs";
import { speakable, transcribe, removeBackground, measureCutout } from "./lib/media.mjs";
import { tokenizeScript, alignWords, phrases } from "./lib/align.mjs";

const SPECS = ["shots.json", "captions.json", "cards.json", "sound.json"];

async function main() {
  const args = parseArgs();
  const proj = projectDir(args._[0], "prep.mjs <project> --video take.mp4 --script script.txt");
  const assets = path.join(proj, "assets"), work = path.join(proj, "work");
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const infoPath = path.join(proj, "talking.json");
  const info = readJson(infoPath, {});
  const videos = [].concat(args.video || []).map((v) => path.resolve(ROOT, v));
  for (const v of videos) if (!fs.existsSync(v)) throw new NeedsInput(`video ${v} does not exist.`);
  const plate = path.join(assets, "talking.mp4");
  if (!videos.length && !fs.existsSync(plate)) throw new NeedsInput("no plate yet: pass --video <talking-head clip> (several --video are joined in order).");

  // the script: kept in the project, it is what captions and timings are written from
  if (args.script) {
    const s = path.resolve(ROOT, args.script);
    if (!fs.existsSync(s)) throw new NeedsInput(`script ${args.script} does not exist: ask the user for it (paste or path).`);
    if (path.resolve(proj, "script.txt") !== s) fs.copyFileSync(s, path.join(proj, "script.txt"));
  }
  const scriptPath = path.join(proj, "script.txt");

  // ── 1. Plate ──────────────────────────────────────────────────────────────
  const sources = videos.map((v) => ({ file: path.relative(proj, v), size: fs.statSync(v).size, mtime: fs.statSync(v).mtimeMs }));
  const changed = videos.length && JSON.stringify(sources) !== JSON.stringify(info.sources);
  if (changed || !fs.existsSync(plate)) {
    const first = await probe(videos[0]);
    const W = first.video.width, H = first.video.height;
    const chains = videos.map((_, i) => `[${i}:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(";");
    const cat = videos.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${videos.length}:v=1:a=1[v][a]`;
    log(`plate: ${videos.length} take(s) -> assets/talking.mp4`);
    await ffmpeg([...videos.flatMap((f) => ["-i", f]), "-filter_complex", `${chains};${cat}`, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-crf", "15", "-preset", "slow", "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", plate]);
    let t = 0;
    const joins = [];
    for (const [i, v] of videos.entries()) {
      t += (await probe(v)).duration;
      if (i < videos.length - 1) joins.push(f3(t));
    }
    const given = args["seams-from"] ? readJson(path.resolve(ROOT, args["seams-from"]), {}).seams || [] : String(args.seams || "").split(",").filter(Boolean).map(Number);
    info.seams = [...joins, ...given].sort((a, b) => a - b);
    info.sources = sources;
    for (const f of ["talking_cutout.webm", "voice.m4a"]) fs.rmSync(path.join(assets, f), { force: true });
    delete info.layout;
    // a new take moves every time after the change: keep the old timings so the edit can be retimed
    if (fs.existsSync(path.join(proj, "transcript.json"))) {
      const prev = path.join(work, `prev-${Date.now()}`);
      fs.mkdirSync(prev, { recursive: true });
      for (const f of ["transcript.json", "transcript.txt", ...SPECS])
        if (fs.existsSync(path.join(proj, f))) fs.copyFileSync(path.join(proj, f), path.join(prev, f));
      fs.rmSync(path.join(proj, "transcript.json"));
      info.retimeFrom = path.relative(ROOT, path.join(prev, "transcript.json"));
    }
  } else if (args.seams || args["seams-from"]) {
    info.seams = args["seams-from"] ? readJson(path.resolve(ROOT, args["seams-from"]), {}).seams || [] : String(args.seams).split(",").filter(Boolean).map(Number);
  }
  const meta = await probe(plate);
  const [cw, ch] = String(args.canvas || "").match(/^(\d+)x(\d+)$/)?.slice(1).map(Number)
    || (info.width ? [info.width, info.height] : meta.video.height >= meta.video.width ? [1080, 1920] : [1920, 1080]);
  Object.assign(info, { plate: "assets/talking.mp4", cutout: "assets/talking_cutout.webm", voice: "assets/voice.m4a",
    duration: f3(meta.duration), width: cw, height: ch, seams: info.seams || [] });
  writeJson(infoPath, info);

  // ── 2. Voice ──────────────────────────────────────────────────────────────
  const voice = path.join(assets, "voice.m4a");
  if (!fs.existsSync(voice)) await ffmpeg(["-i", plate, "-vn", "-c:a", "copy", voice]);

  // ── 3. Layout: where the subject sits (graphics go around/behind it, the camera punches in on the face) ──
  // a stand-in's flat silhouette can't be matted: its standin.json brings the layout of the real frame
  const givenLayout = args["seams-from"] ? readJson(path.resolve(ROOT, args["seams-from"]), {}).layout : null;
  if (givenLayout) {
    info.layout = givenLayout;
    writeJson(infoPath, info);
  } else if (!info.layout) {
    log("layout: matting one frame…");
    const still = path.join(work, "layout_frame.png"), cut = path.join(work, "layout_cutout.png");
    await ffmpeg(["-ss", String(Math.min(0.5, meta.duration / 2)), "-i", plate, "-frames:v", "1", still]);
    await removeBackground(still, cut);
    info.layout = await measureCutout(cut);
    writeJson(infoPath, info);
    log(`layout: headTop=${info.layout.headTop} faceY=${info.layout.faceY} headCenterX=${info.layout.headCenterX}`);
  }

  // ── 4. Matte ──────────────────────────────────────────────────────────────
  const cutout = path.join(assets, "talking_cutout.webm");
  if (!fs.existsSync(cutout)) {
    log("matting the presenter (minutes)…");
    await removeBackground(plate, cutout, { quality: "best" });
  }

  // ── 5. Word timings on the script's own words ─────────────────────────────
  const txPath = path.join(proj, "transcript.json");
  if (!fs.existsSync(txPath)) {
    if (!fs.existsSync(scriptPath)) throw new NeedsInput("no script: pass --script <file> (captions and timings use the script's own words; whisper misspells names).");
    log("transcribing for word timings…");
    const heard = await transcribe(voice, { language: args.lang || info.language || "vi", model: args.model || "medium", outJson: path.join(work, "whisper.json") });
    const words = alignWords(tokenizeScript(speakable(fs.readFileSync(scriptPath, "utf8"))), heard);
    writeJson(txPath, words);
    fs.writeFileSync(path.join(proj, "transcript.txt"),
      phrases(words).map((p) => `[${p.start.toFixed(2)}–${p.end.toFixed(2)}] ${p.text}`).join("\n") + "\n");
    info.language = args.lang || info.language || "vi";
    writeJson(infoPath, info);
  }

  // ── 6. Project: root length + the voice track ─────────────────────────────
  ensureIndex(proj, { width: info.width, height: info.height, duration: info.duration });
  setBlock(proj, "voice", `<audio id="voice" class="clip" src="${info.voice}" data-start="0" data-duration="${info.duration}" data-track-index="4" data-volume="1"></audio>`);

  log(`ready: ${path.relative(ROOT, proj)} — ${info.duration}s, seams ${JSON.stringify(info.seams)}, transcript.txt has the timed phrases.`);
  if (info.retimeFrom) {
    log(`the plate changed: move the edit onto it with ${cmd("retime", path.relative(ROOT, proj), "--from", info.retimeFrom)}, then rerun each skill's generator.`);
    delete info.retimeFrom;
    writeJson(infoPath, info);
  }
}

main().catch(exitOnError);
