# Layouts — where a panel sits and where the presenter goes

**One sentence:** each panel picks a layout; the presenter either stays in front of it (`behind`, `card`),
moves aside for it (`split`), leaves the frame (`full`) or stays under it (`over`). Which layouts a video uses, and their shares, are
the template's.

| `layout` | Panel | Presenter | Inside the camera? |
|---|---|---|---|
| `behind` (default) | the slot in the upper band, its bottom tucked ≈ 0.085 H behind the head (`panel`, or the default slot the run prints with its *safe height*) | in front, the matte overlaps the panel's bottom edge | yes: punch-ins scale it with the presenter |
| `card` | a card at `brand.card` (`x, y, w, h, r`; default top band), with a drop shadow | cut out in front of `brand.bg`, which replaces the set for the panel's stay | yes |
| `split` | the top band, `split.h` of the height (default 0.5), edge to edge; the bottom band with `split.media: "bottom"` | the camera slides the take so the face lands `split.faceAt` (default 0.36) into the other part | panel fixed on screen; presenter moves |
| `full` | the whole frame | hidden | fixed on screen |
| `window` | a box under the window (`window.panel`: default the window's width, 13 px below it, `h: "auto"` = the media's own shape up to `maxH` 980) | seen through a window (`window`: `x, y, w, h, r`) in a page of `window.bg` (default `brand.bg`); the take is moved so the face sits mid-window, `faceAt` down it, at `zoom` | panel fixed on screen; camera moves still act inside the window |
| `over` | the whole frame, transparent: hand-drawn marks, labels, rings drawn *over* the presenter (a `comp` with no background, or a transparent PNG/WebM) | in full view underneath | fixed on screen |

## Brand background (`card`)
- `brand.bg`: any CSS background (a gradient or a colour). The template sets it; without one it is a neutral
  near-black.
- `brand.plate`: a green-screen take already keyed onto the brand background (same length as the plate). When
  set, it swaps in under the card instead of painting `bg` behind the matte: cleaner hair edges.

## Presenter placements (`presenter`)
The cutout moved on its own while the panels stay put: the presenter sitting small in front of a poster, bigger
under a screen, or only their head under a call to action. A placement is a name in `presenters` (or an
object on the panel); `presenter` at the top level is the placement between panels that set their own.
- `top`: where the head top lands (× H). `height`: the figure's height from the head top to the matte's
  lowest point (× H), which sets the scale (or a plain `scale`). `x`: where the head centre lands (× W).
  Measured from `talking.json` `layout` (`headTop`, `bodyBottom`, `headCenterX`), so the same placement fits
  any take of the same framing. A full-length take (a whole seated figure) placed bigger than the frame is
  how a "desk" shot cuts it at the lap.
- `sticker: true` draws `sticker` (`color`, `width` in the take's px, `soft`) round the matte: a cut-out
  sticker look; it scales with the figure. The outline **boils** (a hand-cut line that never sits still, even
  when the presenter does): `boil` px of jitter on its edge (default 3, `0` = static), redrawn `boilFps`
  times a second (default 8), `boilFreq` the wobble's size (default 0.025: bumps ≈ 40 px apart).
- `head: { h, w }` keeps only the head: a clip `h` below the head top and `w` either side of the head
  centre, both in figure heights (≈ 0.26 / 0.125 for a seated full-length take: just below the chin). No sticker with it.
- The cutout is the take's matte: in `card` the brand background is behind it, in `behind` the plate is
  (and the plate doesn't move with it, so use placements with `card`).

## Rules in every layout
- Content that must be read stays inside the safe part of the panel (`behind`: above the head line).
- Anything at the top of the frame stays below ≈ 12 % of the height (cards, cover) and titles below ≈ 16 %:
  the platform's top bar (TikTok, Shorts) covers the rest. Move `panel.y` / `brand.card.y` down rather than up.
- `split`, `full` and `over` sit above the cutout and outside the camera: a punch-in doesn't scale them.
  `hold` never stretches an `over` layer, and it can run on top of any other panel. Put camera
  changes on the cuts between layouts.
- `z` on a panel sets its stacking (default: later start = on top, cards from 10, outer layers from 200): e.g. `"z": 150`
  keeps a screen panel above the layout cards that cut under it (desk-collage's walkthrough across the close and desk shots).
- `rect` on a panel overrides its box in any layout; `rect.h: "auto"` takes the media's shape (up to `rect.maxH`).
- `backdrop` on a panel: a colour over the whole frame behind it for its stay, e.g. a `full` panel with a
  smaller `rect` shown on black.
