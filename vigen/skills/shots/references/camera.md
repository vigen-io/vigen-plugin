# Camera — framings and moves

**One sentence:** the camera scales plate, panels and presenter together around the face; framings change
on sentence turns, mostly by hard cut.

**Use when:** every talking-head edit; a static wide frame for a whole video reads as a webcam recording.

## Framings
| `to` | Scale | Reads as |
|---|---|---|
| `wide` | 1 | establishing; the panel fully visible above the head |
| `punch` | ≈ 1.27 | emphasis: the face stays put, everything grows around it, the panel goes full-bleed and is cut by the top edge |
| `tight` | ≈ 1.45 | the one line that matters most; rare |

The origin is the face (`layout.headCenterX`, `faceY`), so the eyes don't jump on a cut.

## Moves
- **Cut** (`move: "cut"`, default): on a new sentence, a question, an emphatic word. The most common move.
- **Ease** (`move: "ease"`, `dur` 0.5–0.6 s, power2.inOut): returning to wide after a punch, mid-thought.
- **Push-in**: only the intro (`intro-hook.md`). No slow drifts, no shake elsewhere: they fight the lipsync.

## Placing them
How often the camera changes is the template's pacing (its FORMAT.md). These hold in every template:
- Punch on the emphatic sentence or the question; back to wide on the next sentence (cut) or within it (ease).
- A cut on **every seam** (`seam-cut.md`).
- One thing moves at a time: no camera move during a whip, a drop or a leak flash.

## Sound
Camera cuts are silent. An accent (soft hit, quiet click) only when the line itself lands hard — the
sound skill's accents, your call.
