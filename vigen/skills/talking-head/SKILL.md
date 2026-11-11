---
name: talking-head
description: Prepare a talking-head video (a presenter speaking to camera, e.g. a Vigen lipsync result) for a layered edit in HyperFrames — join takes into one seek-safe plate with its seam times, matte the presenter out (so graphics can sit behind them), measure where the head and face are, and time the script's own words to the voice (transcript for captions and cuts); also move a finished edit onto a new take when a part is redone. Use when a talking-head clip needs captions, graphics behind or around the speaker, punch-ins, or when a part of one was replaced.
---

# Talking head — the clip, ready to edit

`<skill>` = this skill's base directory; write it out in full in commands. Needs Node ≥ 20, ffmpeg, python3 +
Pillow, `npx` (hyperframes@0.9.4 for the matte and whisper). No npm install. Paths are relative to the folder
you run from.

The plate comes from wherever the user's video comes from (the **vigen** skill makes them; a long script comes
back in parts with **seams**). This skill turns it into the layers other skills build on; it decides nothing
about the look.

## Prepare

```bash
node <skill>/scripts/prep.mjs videos/<slug> --video <clip.mp4> --script <script.txt> [--seams-from <vigen out>/parts.json] [--lang vi]
```

Several `--video` are joined in order (each join becomes a seam). Every step is cached; rerun freely.

| Output | What it is |
|---|---|
| `assets/talking.mp4` | the plate: CFR 30 fps, a keyframe every second (HyperFrames seeks; long GOPs stutter) |
| `assets/voice.m4a` | the voice, also placed in `index.html` as `<audio id="voice">` |
| `assets/talking_cutout.webm` | the presenter alone (AI matte, alpha); ≈ 6 fps on Apple silicon, so a 110 s plate takes ≈ 11 min. Run it in the background |
| `talking.json` | `plate`, `cutout`, `voice`, `duration`, `width`/`height` (the canvas: 1080×1920 for a portrait plate), `seams`, `layout` |
| `transcript.json` / `.txt` | the **script's** words with whisper's timings (`[0.12–2.90] phrase` lines to read) |

`layout` (fractions of the frame): `headTop`, `faceY`, `headCenterX`, `headWidth`, `neckY`, body box. The
shots skill centres punch-ins on the face and tucks panels behind the head with it; captions sit on the chest.

**Timings come from whisper, words from the script.** Whisper misspells names ("Chuck GPT") and drops
particles (á, nha); the aligner maps its times onto the script's tokens and interpolates the misses. Write every
caption and card from the script. It's ~a syllable off at worst; time precise hits from the waveform.

## The depth stack

The core trick of a layered talking-head edit, back → front:

```
plate (the original video)  →  graphics (panels, cards)  →  cutout (presenter, matted)  →  captions  →  flashes
```

A graphic between plate and cutout sits *behind* the speaker: their head overlaps its bottom edge, so it reads
as part of the set, not a sticker. The plate stays as the back layer (the desk, the light and the shadows stay
real); chroma-keying the wall instead failed on a shirt the same colour. Camera moves must scale plate,
graphics and cutout together (one wrapper), or the matte slides off the plate. The **shots** skill writes this
stack; **captions** and **sound** add their layers to the same `index.html`.

## Seams

A seam is where two takes join: the head pose jumps. Every seam needs a hard camera cut or a flash on it
(shots skill warns about uncovered seams). Keep `talking.json` seams current: `--seams 31.4,62.0` or
`--seams-from parts.json` (vigen's parts tool writes it).

## A take changed — retime

When a part is redone (vigen `parts.mjs run --redo N`), rerun `prep.mjs` with the new video. It keeps the old
transcript and specs in `work/prev-<time>/` and prints:

```bash
node <skill>/scripts/retime.mjs videos/<slug> --from videos/<slug>/work/prev-<time>/transcript.json
```

It pairs old and new words and moves every time in `shots.json`, `captions.json`, `cards.json` and
`sound.json` (keys `t`, `start`, `end`, `at`, `until`, `countAt`, `sweep`, and the `leaks`/`breathe` lists)
through that map; shots cuts within 0.25 s of a seam snap onto it. Then rerun each skill's generator.

## Framing a presenter for layered edits

If you're choosing the presenter's photo (e.g. for a vigen koi) and graphics will go behind them: 9:16, one
person square to camera, eyes to lens, mouth closed and unobstructed; head top at ≈ 40 % of the height with
the upper ~38 % plain and empty; a plain, evenly lit backdrop; a dark top so white captions on the chest read.

## Gotchas

- **Never use an edited video as the plate** (burned-in captions, cards): plates come from the raw take only.
- The matte keeps a thin backdrop-coloured fringe on hair, visible over very dark graphics.
- Whisper medium ≈ 20 s per 85 s once its 1.5 GB model is cached; the first run downloads it.
- Exit 3 + `NEEDS INPUT:` = ask the user for exactly that; exit 1 = a real error.
