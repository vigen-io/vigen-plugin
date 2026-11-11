---
name: shots
description: Camera and transitions for a talking-head edit in HyperFrames — punch-ins centred on the face, cuts vs eases, an intro push-in, panels of media or cards in five layouts (behind the presenter, a card on a brand background, split screen, full frame, a transparent layer over the shot) with whip/drop/lift/white/fade/pop/leak/paper transitions, a B&W grade, and warm light-leak flashes — written from a shots.json into the stage composition. Recipe cards for each move (what it does, its timing, the sound it pairs with); how often to use each is the template's call. Use when a talking-head video needs camera moves, b-roll/graphics panels, transitions or flashes, or to fix how one of those looks or lands.
---

# Shots — camera, panels, transitions, flashes

`<skill>` = this skill's base directory. Needs a project prepared by the **talking-head** skill (`talking.json`:
plate, cutout, layout, seams). Node ≥ 20, ffmpeg.

```bash
node <skill>/scripts/shots.mjs videos/<slug> --draft   # starter shots.json: wide, a cut on every seam
node <skill>/scripts/shots.mjs videos/<slug>           # shots.json -> compositions/stage.html + fx.html (+ hosts in index.html)
```

Edit `shots.json`, never the generated HTML (it is rewritten every run). Times are seconds on the video clock
(`transcript.txt`).

This skill is the mechanism. Which layouts, how often the camera moves, how many flashes: the template's
`FORMAT.md` decides (the **video-format** skill). Its `format.json` (`brand` + `shots`, same keys as
shots.json) supplies defaults, found from `"format"` in shots.json or the project's `meta.json`.

## shots.json

```jsonc
{
  "camera": [                                       // framings by scale around the face (layout.faceY)
    { "t": 0, "to": "wide" },
    { "t": 12.0, "to": "punch", "move": "cut" },    // to: wide | punch | tight | <scale>; move: cut | ease
    { "t": 17.3, "to": "wide", "move": "ease", "dur": 0.6 }
  ],
  "frames": { "punch": 1.27, "tight": 1.45 },       // optional: scale per framing
  "origin": "50% 52%",                              // optional: camera centre (default: the face)
  "intro": { "end": 5.08, "zoom": 1.27 },           // optional push-in from 0 landing under a flash at `end`
  "panel": { "x": 76, "y": 334, "w": 928, "h": 616, "r": 64, "bg": "#0b1b2b" },  // optional: the slot (default below)
  "brand": { "bg": "linear-gradient(…)", "card": { "x": 76, "y": 230, "w": 929, "h": 557, "r": 40 } },  // card layout
  "split": { "h": 0.5, "faceAt": 0.36 },           // split layout: media height, where the face lands below it (media: "bottom" puts the media under the presenter)
  "window": { "x": 95, "y": 104, "w": 890, "h": 503, "faceAt": 0.45, "zoom": 1, "bg": "#0400F1",
              "panel": { "y": 620, "h": "auto", "maxH": 980 } },  // window layout: the presenter in a window on a page, media below
  "drift": 1.07,                                    // optional: stills push in slowly over their stay
  "presenters": { "small": { "top": 0.52, "height": 0.34, "x": 0.5, "sticker": true } },  // optional: named placements of the cutout
  "presenter": "small",                             // optional: the placement between panels that set their own
  "sticker": { "color": "#F5F2B4", "width": 14, "boil": 3 },   // optional: the outline a placement with sticker: true draws (boil: its edge jitters, 0 = static)
  "panels": [
    { "id": "sheep", "start": 0, "end": 5.0, "src": "assets/media/sheep.jpg", "in": "cut", "out": "leak" },
    { "id": "lab", "start": 5.0, "end": 11.0, "src": "assets/media/lab.mp4", "mediaStart": 2.0,
      "focus": "40% 50%", "in": "leak", "out": "whip", "grade": { "at": 9.6, "to": "bw", "dur": 0.5 } },
    { "id": "n277", "start": 11.0, "end": 13.4, "comp": "cards/n277", "in": "whip", "out": "cut" },
    { "id": "demo", "start": 31.75, "end": 35.4, "comp": "ui-gpt", "in": "whip", "out": "cut", "rect": { "y": 200 } },
    { "id": "rig", "start": 40.0, "end": 42.6, "src": "assets/media/rig.mp4", "layout": "full" },
    { "id": "end", "start": 44.0, "end": 47.0, "src": "assets/media/result.mp4", "layout": "full",
      "rect": { "x": 50, "y": 470, "w": 980, "h": 980 }, "backdrop": "#000" }
  ],
  "hold": true,                                     // optional: close gaps so a panel is always on screen (off by default)
  "breathe": [[57.4, 63.7]],                        // …except here (with hold)
  "leaks": [63.9]                                   // extra flashes; panel in/out "leak" add their own
}
```

- **A panel** is media (`src`: image or video, muted; `mediaStart` trims, `focus` = object-position) or a
  sub-composition (`comp`: `cards/<id>` from the **viz-cards** skill, a **ui-demo** `compose` output, any file
  in `compositions/`). Its own timeline starts at the panel's `start`; give it the same start as the card.
- **The default slot** is the frame's upper band with its bottom edge tucked ≈ 0.085 H behind the
  presenter's head (from `layout.headTop`): a depth composite. The run prints the slot and its *safe height*
  (the part above the head); cards keep their content inside it. `rect` overrides per panel.
- **Layouts** (`layout` per panel, `references/layouts.md`): `behind` (default: the slot above, behind the
  head), `card` (the brand background replaces the set, the presenter cut out in front, the media in a card
  above), `split` (media fills the top band, the presenter slides into the bottom part), `full` (media fills
  the frame, presenter hidden), `over` (a transparent full-frame layer on top of the presenter: drawings and
  labels over the shot).
- `presenter` on a panel (a name in `presenters`, or the object itself): the cutout alone is moved, scaled,
  outlined like a sticker or cut down to the head for the panel's stay, the panels staying put
  (`references/layouts.md` § Presenter placements). Mostly with `card` on a full-frame `brand.card`.
- `in`: `cut | whip | drop | fade | pop | white | leak`. `out`: `cut | whip | lift | fade | shrink | white | leak`.
  Exits finish exactly at `end`, so the next panel can start on the same frame.

## Recipes (references/)

| Card | Use it for |
|---|---|
| `layouts.md` | behind / card / split / full: geometry, brand background, the presenter's place in each |
| `camera.md` | wide / punch / tight, cut vs ease, one move at a time |
| `seam-cut.md` | hiding the pose jump where takes join |
| `panel-transitions.md` | swap in place vs slide; cut, whip, drop/lift, white, fade, pop, shrink; the B&W and blur grades; hold & breathe |
| `light-leak.md` | the warm flash: what it marks, swaps under it |
| `intro-hook.md` | the opening push-in that lands on the first flash (picture side; sound skill does the audio) |

Each card says when to use the move, its timing and the sound it pairs with (the **sound** skill derives slide
whooshes, leak risers and the intro sounds from this same shots.json).

## Check before showing

1. `npx hyperframes check --json` in the project. Expected info noise: `canvas_overflow` /
   `panel_out_of_canvas` from whips and punch-ins, `canvas_covered` from the plate. Fix every error.
2. `npx hyperframes snapshot --at <each panel start + 0.3, each camera cut>` and look: a panel's content
   hidden behind the head (use the safe height, or move `panel.y` up), a whip that ends mid-frame, missing media.
3. Known 0.9.x preview bug: a panel can vanish in Studio/snapshot while a sound effect plays across it; the
   rendered MP4 is right. Check a frame of the render (`ffmpeg -ss <t> -i render.mp4 -frames:v 1 x.png`)
   before changing the edit.
