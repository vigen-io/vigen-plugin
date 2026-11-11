# Effects — palette, cues, accents

## Palette (`sfx-pool.mjs`)
Roles, each searched with several descriptions so neighbours differ: `slide` (whoosh away), `swoop` (whoosh
in), `riser`, `click`, `sweep` (sub drop), `build` (noise riser), `pop`, `hit`, `tick`, `mouse` (a real computer mouse: press and release), `paper` (a soft page turn: the shots paper pass, placed by `cues: "auto"` to peak on the cut, ≈ 8 dB under the voice). Shrill sounds (> 30 %
of energy above 4 kHz) are dropped. Each entry knows its peak (and a sub drop its onset). A rejected sound:
`--ban "<name>"` replaces it in its own slot and keeps it out of later pulls; re-point any accent that named it.

## `cues: "auto"` — from shots.json
| Event | Sound | Peaks |
|---|---|---|
| panel out `whip`/`lift` | `slide` (airy whoosh away) | 0.06 s before the panel is gone |
| panel in `whip`/`drop` | `swoop` (prefers whooshes ending on a thud) | 0.08 s after the new one starts |
| every leak flash | `riser`, muffled, tail ≤ 0.5 s and stopped before the next word | on the flash |
| intro | see `intro-hook.md` | |
In-place cuts, white flashes and camera cuts get nothing. Same-kind sounds < 0.35 s apart merge.

## Accents — your judgement, every video
After the picture is set, go through it and give a sound to the moments that land, and only those:
`pop` as logos, flow steps, bubbles or a CTA element appear (their `at`s); a soft `hit` (thud) or a quiet
`click` on the one or two lines that land hardest or a number finishing its count; `tick` on a small reveal.
- **Items of one card share one sound**: same file (`src`), same level, all or none (a different pop on the
  last step sounded like a mistake).
- How many accents a video gets is the template's pacing; never within 0.4 s of another sound, and leave
  quiet stretches.
- Each entry: `t` (peak), `role` or `src` (+ `peak`), optional `gain` dB, and `why`.

## `uiClicks` — the presenter doing it
When the template sets `sound.uiClicks` (tutorial), every click of a ui-demo card placed in shots.json gets a
real mouse click: `click` steps on their `at`, `type`/`paste` steps on the field click just before (0.2/0.25 s).
The press lands on the click (each sound's onset), the release follows; the palette's `mouse` sounds take turns so
no two in a row are the same. Not a UI tick or a synth blip: a physical mouse. Don't add click accents on top.

## Levels (loudest 50 ms vs the voice's median 50 ms, dB)
`slide −5 · swoop −2 · leak −3 · caption −3 · click +6 · sweep +10 · build +7 · pop −4 · hit 0 · tick −6 · mouse −12` (mouse: at −4 the user found it too loud).
Risers and builds play through a low-pass (~2.6 kHz): full-band noise read as loud and oppressive.

## Captions
No caption sounds unless the user picked the file by ear: `captionSfx: ["assets/sfx/<file>"]`, one on each
keyword line as it enters, ≥ 2.5 s apart.
