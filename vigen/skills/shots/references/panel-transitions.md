# Panel transitions — swap in place, slide, flash

**One sentence:** a panel change is either a swap in place (the slot stays, its content changes) or a slide
(the old panel leaves, a new one arrives). The mix and how often a slide comes are the template's pacing.

## Swap in place — `out: cut|white|leak` → `in: cut|white|leak`
| Move | Look | Use |
|---|---|---|
| `cut` | hard swap of the content | the default; most changes |
| `white` | the panel exposes up to white (0.4 s), the next one comes out of white (0.35 s) | a reveal ("và đây là…") |
| `leak` | warm full-frame flash, content swaps under it | a turn in the story (`light-leak.md`) |

Silent, except the leak.

## Slide — `out: whip|lift` → `in: whip|drop`
| Move | Look | Timing |
|---|---|---|
| `whip` out | slides off right, heavy horizontal blur | 0.26 s, power3.in, ends at `end` |
| `whip` in | slides in from the left, blurred | 0.36 s, expo.out, from `start` |
| `lift` out | rises off the top, blurred | 0.28 s |
| `drop` in | falls in from above | 0.42 s; good after an empty moment |

Always a sound: a whoosh away on the exit and a swoop in on the entrance (sound skill, `cues: "auto"`).
Whips close together read frantic.

## Paper pass — `in: "paper"`
A sheet of off-white paper with torn top and bottom edges sweeps up over the whole frame (laptop, set and
presenter: it is drawn in the fx layer above everything), tilted a few degrees with a soft shadow on the torn
edge and a faint grain. It covers the frame for ≈ 0.08 s around the panel's `start` (0.32 s up, power3.in), so
the swap, and a part seam on it, happen under the paper; then it lifts off the top fast (0.45 s, power2.out)
and the new panel shows through mid-entrance. A paper-collage cut (desk-collage's desk → posters); it counts as
hiding a seam. Sound: a soft page turn (sound skill, role `paper`, placed by `cues: "auto"`).

## Others
`fade` (0.25–0.3 s) for calm content, `pop` (scale 0.82 → 1, back.out) for a single object, `shrink` out
(0.22 s) to dismiss.

## B&W grade — `"grade": { "at", "to": "bw", "dur": 0.5 }`
The media desaturates over ~0.5 s for a dark beat ("là quái vật", death, failure). A greyscale copy is
pre-baked (no CSS filters on footage). `"dur": 0` shows it graded from `at` on (a B&W montage).

## Blur grade — `"grade": { "at", "to": "blur", "dur": 0.15 }`
The media defocuses heavily behind big type laid over it (an `over` card). For the presenter themself, use a
`full` panel of the plate (`"src": "assets/talking.mp4"`, `"mediaStart"` = the panel's `start` so it stays in
sync) graded to blur: the take keeps moving, out of focus, under the words. Pre-baked like B&W.

## Hold and breathe
Off by default: a panel shows from its `start` to its `end` and the presenter has the frame in between.
With `hold: true` a panel is always on screen: each holds until the next arrives, the first from 0, the last
to the end; `breathe: [[s, e]]` keeps deliberate empty stretches. Change panels when the subject changes,
never mid-word.
