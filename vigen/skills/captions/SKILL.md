---
name: captions
description: On-screen words for a narrated video in HyperFrames, timed to the voice — caption groups of stacked lines (main, emphasis, small, title) or word-by-word, always-on subtitles chunked from the transcript, and headline titles, with cut / pop / slide / glitch entrances — written from a captions.json. The look (font, colours, sizes, entrances, where words sit) comes from the video's template. Use when a talking-head or narrated video needs captions, subtitles, keyword pop-ups, titles or kinetic text synced to speech.
---

# Captions — words on screen, timed to the voice

`<skill>` = this skill's base directory. Needs word timings (`transcript.json`, from the **talking-head**
skill's prep) and the project length. Ships Be Vietnam Pro (full Vietnamese).

This skill is the mechanism. *Which* words go up, how many and how often is the template's call: read its
`FORMAT.md` (the **video-format** skill) before writing captions.json. Its `format.json` (brand + `captions`)
supplies the look as defaults; without a template the look is plain (white, dark outline, hard cuts).

```bash
node <skill>/scripts/captions.mjs videos/<slug> --draft   # starter captions.json: a group per phrase (main + emphasis)
node <skill>/scripts/subtitles.mjs videos/<slug>          # always-on subtitles + titles.json headlines -> captions.json
node <skill>/scripts/captions.mjs videos/<slug>           # captions.json -> compositions/captions.html (+ host)
```

Edit captions.json, not the HTML. The template is found from `"format"` in captions.json or the project's
`meta.json`; `subtitles.mjs --format <file>` names one directly.

## captions.json

```jsonc
{
  "style": {                                      // all optional: the template's captions.style fills the rest
    "font": "Be Vietnam Pro", "top": 0.655,       // top: fraction of height (default: on the chest, from layout)
    "accent": "#0E78D0",                          // b's colour (and the glitch streak's); #rrggbb
    "entrance": "glitch", "exit": "smear",        // entrance: cut | pop | slide | glitch; exit: cut | smear
    "w": { "size": 96, "weight": 800 },
    "b": { "size": 140, "outline": "#fff", "glow": true },
    "s": { "size": 64 }, "t": { "size": 124 }, "maxWidth": 940
  },
  "groups": [
    { "start": 0.12, "end": 2.9, "lines": [
        { "text": "Vì sao...", "style": "w" },
        { "text": "nhân bản", "style": "b", "at": 0.4 } ] },
    { "start": 10.2, "end": 12.0, "words": [
        { "text": "Mình", "at": 10.22 }, { "text": "tìm", "at": 10.5 }, { "text": "Master Prompt", "style": "b", "at": 10.9 } ] },
    { "start": 13.3, "end": 14.9, "top": 0.16, "lines": [ { "text": "Giàn khoan dầu", "style": "t" } ] }
  ]
}
```

Styles, every setting in `references/styles.md`:
- `w` main line, `b` emphasis (accent colour, larger; `outline` ring and optional white `glow`), `s` small
  qualifier, `t` title (uppercase, heavy shadow), `h` hand-lettered accent (`font` + optional `hollow`). Any
  style takes `size`, `weight`, `color`, `box` (a label box behind the text) and `font` (families beyond Be
  Vietnam Pro are listed in `style.fonts`); `w` and `s` take an `outline` ring.
- **Colour inside a line**: `{words}` in braces show in `style.highlight`; a line's own `color` recolours it.
- **Lines** appear on their `at` without reflowing the ones above; a line wider than `maxWidth` shrinks.
- **Words** instead of lines: one word at a time in the same spot, each replacing the last on its `at`; the
  last one enters with the group's entrance and holds to `end`.
- Times are video seconds. A group is gone at its `end`. `top` and `exit` per group override.
- Layer order: above the stage (presenter, panels), below light-leak flashes.

## Subtitles mode

`subtitles.mjs` chunks the script's own words into short groups (template `captions.chunk`: `maxWords`,
`maxChars`, `minDur`, `lead`: how far a chunk shows ahead of its word; default 4 / 20 / 0.45 s / 0.02 s), breaking
on punctuation and pauses, and places each where the
template puts words for the layout on screen then (`captions.top`: `presenter`, `behind`, `card`, `split`,
`full`; an `over` layer doesn't change it). Headlines from `<project>/titles.json` become `t` groups. Colour by
meaning when the template sets it: `captions.question` colours every chunk of a question; the phrases in
`<project>/highlights.json` (`["turn it on", "half"]`, words of the script) show in `style.highlight` inside
their line. `chunk.keepPunctuation` keeps a chunk's final full stop. The phrases in `<project>/emphasis.json` draw their
chunk bigger (`captions.emphasis.size`). A shots panel with `"subs": false` hides the subtitles while it is on (a chunk running into it ends at its start)
(a card that shows those words itself); `"subColor"` recolours them (dark words on a light card; a dark line
drops its shadow). A title in titles.json may take its own `style` (default `t`) and `size`; `"replace": true` hides
the subtitles it overlaps (a number shown big in place of the word). It overwrites
captions.json: hand edits belong in titles.json, highlights.json, emphasis.json, shots.json or the template.

## Rules for every template

- Text comes from the script, never from whisper (it misspells names).
- Groups never overlap (the run warns); `start` ≈ the first word's start − 0.05 s, `at` = when the line's
  first word is spoken. Whisper drifts up to a syllable: time a hit that must land exactly from the waveform.
- Never over the mouth. Captions don't scale with the camera: check snapshots of punch-ins.
- Titles and anything at the top stay at `top` ≥ 0.16: the platform's top bar (TikTok, Shorts) covers the rest.
- No sounds on captions unless the user picked the file by ear (sound skill, `captionSfx`).
