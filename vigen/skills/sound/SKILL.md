---
name: sound
description: The sound of a narrated edit in HyperFrames — a music bed under the voice (real tracks only, looped and levelled), a varied sound-effect palette pulled from HeyGen's catalog, whooshes on slides and risers on flashes derived from the shots, an intro hook (click, sub drop, noise build), and hand-placed accents — every clip levelled against the voice into index.html. Use when a video needs music, sound effects, an audio pass, or a sound that is too loud, wrong or missing.
---

# Sound — music bed, effects, accents

`<skill>` = this skill's base directory. Needs a project with a voice track (talking-head prep) and the HeyGen
sign-in for the sound catalog (`! npx hyperframes auth login`, the user runs it) plus the **media-use** skill.

```bash
node <skill>/scripts/sfx-pool.mjs videos/<slug>             # the palette -> assets/sfx/pool.json (pulls missing roles only)
node <skill>/scripts/sfx-pool.mjs videos/<slug> --ban "Name"  # the user rejected a sound: replaced in its own slot, banned for this video
node <skill>/scripts/mix.mjs videos/<slug>                  # sound.json -> the "sound" block of index.html
```

## sound.json

```jsonc
{
  "bgm": { "src": "assets/music/bed.mp3", "below": 11 },      // start?, mediaStart?, volume?, fadeIn?, fadeOut?
  "cues": "auto",                                              // slides, leaks, intro: from shots.json
  "accents": [ { "t": 23.75, "role": "pop", "why": "x100 finishes counting" },
               { "t": 40.5, "role": "pop", "why": "logo row: one sound for the card" } ],
  "captionSfx": [],                                            // only files the USER picked by ear
  "clips": [ { "t": 10.6, "src": "assets/sfx/other.mp3", "volume": 0.3 } ],  // exact placements
  "uiClicks": true                                             // a real mouse click on every ui-demo click (template's call)
}
```

The template's `format.json` `sound` section (same keys) is the default under sound.json, found from
`"format"` in sound.json or the project's `meta.json`: the bed level and how busy the effects are belong to
the template (its FORMAT.md). `t` of a cue or accent = where the sound **peaks** (each file's peak is
measured); `clips` take the start.
Every level is relative to the voice's median (no ducking needed): see `references/effects.md` for the table.

## Layers (references/)

| Card | |
|---|---|
| `music.md` | the bed: required, real tracks only (the user's, else the catalog), where it enters, level, looping |
| `effects.md` | the palette, what `cues: "auto"` places (slide pairs, leak risers), accents by judgement, levels, taste |
| `intro-hook.md` | click on frame 1, sub drop with the music, a noise build into the first flash |

## House rules (every template)
- **Never generate music** (Lyria, MusicGen…): real tracks only, the user's or the catalog's.
- `banned.json` is a hard blacklist across all videos (cinematic brass hits, notification chimes, the
  catalog's "Whip swoosh impact"…); `--ban-forever` adds to it.
- No caption sounds unless the user picked the file by ear.
- Risers and builds play muffled (low-passed) and are gone before the next word; leak tails stay quiet.
- The bed sits under the voice (default 11 dB; 8 was too loud next to a TTS voice); the template sets its own.

Check by listening: render, or `npx hyperframes preview` and play the sections with effects. The log line
says where the music enters and where the intro's drop landed.
