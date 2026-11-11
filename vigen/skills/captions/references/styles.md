# Caption styles — every setting

The template's `format.json` sets these as defaults (`brand.font`, `brand.accent`, `captions.style`);
captions.json `style` overrides them; a group's `top` / `exit` and a line's `size` override per item.

## Global

| key | default | |
|---|---|---|
| `font` | Be Vietnam Pro | shipped with the skill; another family must be installed/loaded by the project |
| `top` | on the chest: `layout.headTop + 0.245`, kept in 0.56–0.70 | fraction of the height for the first line |
| `maxWidth` | 940 | px a line may take before its size shrinks to fit |
| `accent` | `#ffffff` | `b`'s colour unless `b.color`; the glitch streak's colour |
| `highlight` | `accent` | colour of `{words in braces}` inside any line (`subtitles.mjs` adds the braces from `highlights.json`) |
| `entrance` | `cut` | `cut` (appears), `pop` (scale 0.6 → 1, back.out, 0.3 s), `slide` (rises 40 px, 0.3 s), `glitch` (smears in from the left with a stepped scan and a pixel streak, 0.26 s) |
| `exit` | `cut` | `cut` (gone at `end`), `smear` (smears right with blur, 0.16 s, gone at `end`) |

## Per line style

| style | default | look |
|---|---|---|
| `w` | 96 px, 800, white | soft dark shadow; `outline` (a colour, `outlineWidth` px, default 3) adds a ring around the letters |
| `b` | 140 px, 800, `accent` | `outline` ring around the letters (default `rgba(0,0,0,0.55)`), `glow: true` adds a white halo |
| `s` | 64 px, 700, white | soft dark shadow |
| `t` | 124 px, 900, white | uppercase, tight, heavy dark ring + drop shadow; for headlines over media |
| `h` | 120 px, 400, white | hand-lettered accent: set `font` to a handwriting family; `hollow: true` draws outlined letters |

Every style also takes `upper: true` (shown in capitals) and `tracking` (letter-spacing in em, e.g. `-0.05`
for tight, heavy subtitles).

A line in captions.json may take its own `color` (a whole subtitle in another colour, e.g. a question).
Every style also takes `color`, `box` (a CSS colour: a rounded label box behind the text, shadow off) and
`font` (its own family, e.g. a handwriting face for `h`). Families other than Be Vietnam Pro go in the global
`fonts: [{ "family", "file", "weight"? }]`: each `file` (found from the project, else the workspace) is copied
into `assets/fonts/`, so cards can use the same `url("assets/fonts/<file>")`.

## Word by word

In a `words` group, every word but the last flashes in (scale 1.18 → 1, blur, ≤ 0.12 s) and is replaced by
the next; the last enters with the group's `entrance` and holds. It is busier than lines: a template opts in.
