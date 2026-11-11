# Music bed

**One sentence:** a steady instrumental bed under the whole video after the cold open, at the template's
level under the voice (`below`, default 11 dB).

**Required.** A video without one sounds unfinished (mix.mjs logs `NO MUSIC BED`).

## Source — real tracks only
1. The user's own track (ask once).
2. Else HeyGen's catalog via the media-use skill: `npx hyperframes media-use resolve --type bgm --intent "…"`;
   pull 4–6 and compare: a steady groove, no vocals, nothing that peaks over the voice.
Never generate music (Lyria, MusicGen…): the user rejected it.

## Where and how loud
- Enters on the intro's sub drop (`intro-hook.md`), else after the hook sentence (the first sentence end
  within 6 s): the cold open stays dry. `start` overrides; `mediaStart` starts the track on a downbeat.
- `below` (dB under the voice median: the template's, else 11) or a fixed `volume`. 2 s fade-out at the end.
- Shorter than the video: looped on its full-level body (its own intro/outro fades skipped) with 2 s
  equal-power crossfades into one cached file.
