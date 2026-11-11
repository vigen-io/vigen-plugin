---
name: viz-cards
description: Motion-graphic cards for explainer videos in HyperFrames — brand logo rows (marks fetched from Simple Icons), a big number counting up, bar charts, step flows with arrows, composed scenes of photos and speech bubbles, and hand-written evolving cards — each a sub-composition whose reveals land on the spoken words. Use when a narrated line names brands or products, gives a number, compares values, describes a process, or states an abstract idea that found footage would only symbolise.
---

# Viz cards — show the idea, timed to the words

`<skill>` = this skill's base directory. Times come from `transcript.json` (**talking-head** skill); cards
are placed on screen as panels by the **shots** skill. Ships Be Vietnam Pro.

```bash
node <skill>/scripts/logo.mjs videos/<slug> openai claude googlegemini   # brand marks -> assets/media/logos/<slug>.svg
node <skill>/scripts/logo.mjs --find "gemini"                            # look up Simple Icons slugs
node <skill>/scripts/viz.mjs videos/<slug> [id …]                        # cards.json -> compositions/cards/<id>.html
```

Then in shots.json: `{ "comp": "cards/<id>", "start": <same>, "end": <same>, "in": …, "out": … }` and rerun
shots. viz.mjs says which cards aren't placed yet.

## cards.json

```jsonc
{ "accent": "#0E78D0", "statColor": "#0A1F6E",        // optional
  "size": { "w": 928, "h": 616, "safe": 441 },        // optional; default: the shots panel / default slot
  "cards": [ { "id": "n277", "kind": "stat", "start": 24.6, "end": 27.0, "text": "277", "count": true }, … ] }
```

The template's `brand` (`accent`, `statColor`) and `cards` section are defaults under cards.json, found from
`"format"` in cards.json or the project's `meta.json`. Every time (`start`, `end`, each item's `at`) is on the video clock, so the talking-head retime moves them;
each card's own timeline starts at its `start`. `safe` is the height above the presenter's head when the panel
is tucked behind it: layouts stay inside it.

## Pick the kind

| The line… | Kind |
|---|---|
| names products / brands / platforms | `logos`: marks pop in, each on the word naming it |
| gives a number that matters ("gấp 100 lần") | `stat` + `count`: a huge number counting up, 1.5–2.5 s |
| compares numbers, before/after, a ranking | `chart`: bars grow, values count up, the winner highlighted |
| describes a process, "từ A qua B tới C" | `flow`: 2–4 steps with arrows, each on its word |
| is abstract, a metaphor ("AI hiểu ngôn ngữ AI") | `compose`: 2–3 photos/logos + bubbles/labels arranged into the idea |
| builds an idea over several sentences, old way vs new way | `html`: ONE card that evolves (`references/evolving-cards.md`) |

A template may ship its own starter cards (`formats/<name>/cards/`, e.g. a call-to-action card): copy one into
the project's `cards/` and retime it like the examples.

App walkthroughs ("mở ChatGPT, tạo project…") are the **ui-demo** skill. Filmable things are found media
(**stock-media** skill). Schemas and layout rules per kind: `references/kinds.md`.

## Rules of thumb
- One idea per card, ≤ 4 items/bars/steps, labels ≤ 3 words.
- Time each reveal to its word: a logo appearing as its name is said is the whole point.
- Whatever must be read stays ≥ 2.5 s after it's complete; a step in the last half-second of a card is lost.
- Cards share one look per video (theme, accent, font); `theme: "light"` for a light set.
- Never cut objects out of photos (they come out ghosted): compose whole framed photos or transparent PNG/SVG.
- Items of one card share one pop sound (sound skill accents: same file, same level, all or none).
- Logos are trademarks: fine for naming a product, never imply endorsement. Not in Simple Icons → Wikimedia
  "<brand> logo" (stock-media), or a text tile `{ "text": "Mj", "label": "Midjourney" }`.

Check: `npx hyperframes snapshot --at <card start + item at + 0.3>` once placed; content below the safe line
is hidden by the head.
