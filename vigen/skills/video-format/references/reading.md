# Reading a dissected reference

`dissect.mjs` measures what numbers can catch; the rest is looking. Look at every sheet: a format lives in
details a summary misses (a cover frame that lasts one frame, a caption box in only one of three videos).

## What to note, sheet by sheet

- **Layout of each frame**: presenter alone / split (media top, presenter bottom) / full media / card (brand
  background + cutout + card) / picture-in-picture / anything new. Count them: the share of each is a rule.
- **What fills the media**, by the kind of line: abstract idea → concept art or a diagram; a named product →
  a logo or a product shot; a step → a screen; a claim → a title. That mapping is the beat-plan rule. Note
  which module makes each one (SKILL.md § A.3): a screen being used is a **ui-demo** card, a diagram or a
  logo is **viz-cards**, a product shot is **stock-media**, a title is **captions**.
- **Screens**: where the app sits (a rect in px of the 1080-wide frame, a device frame around it), how much
  of the UI shows, how the camera moves on it (a zoom onto the button, a pan), the cursor, typing,
  highlight rings, how often it changes. These become the ui-demo `compose --size` and the steps' `zoom`.
- **Words on screen**: subtitles or keyword callouts? Words per chunk, size (as a fraction of the width),
  weight, colour, outline / shadow / label box, position *per layout*, entrance (cut / pop / slide), exit.
  Titles: how often, on which lines, style, extra marks (arrows, swooshes, circles).
- **The presenter**: framing (where the face sits), background, mic in hand or on a stand, a different set
  per video or one set.
- **Structure**: frame 0 (a cover?), the hook's first 2 s, how the CTA is staged, the sign-off line.

## Motion sheets (`motion/motion-NN.jpg`, 6 frames a second, a row per second, 5 s a sheet)

What the 0.5 s sheets skip: the motion inside a shot. Read a row as one second and look for what changes
across it: a card popping in (blurred or faded on one frame, sharp on the next), something flying from one
place to another (smaller and in between on one or two frames), a reframe (the presenter bigger on the next
frame, nothing else changed), a subtitle swapping, a badge popping. Note each with its time: these are the
format's entrances and their speed (one frame mid-move at 6 fps ≈ a 0.15–0.3 s move). The report's
"changes at" times per shot point to where to look. A video with almost no cuts (one take with graphics) lives
entirely in these sheets.

## Stills and full-size frames

`stills/shot-NN.jpg` is each shot at 540 px; pull full-size frames (`ffmpeg -ss <t> -i ref.mp4 -frames:v 1 -q:v 2
f.jpg`) for anything to copy exactly: font weight, outline, colours, sizes and positions in px of a
1080-wide frame, the corner radius of a card. Measure, don't guess.

## Cut strips (`cuts/cut-NN.jpg`, 9 frames: 4 before, the cut, 4 after)

Stack 12–15 of them (`ffmpeg … vstack`) and read across: a hard cut changes in one frame; a slide, a zoom or
a flash shows over several. Most short-form formats cut hard and move *inside* the shot (a card popping in
after the cut), which the strips show as an empty slot filling over frames 5–9.

## Numbers in `report.md`

- **Cuts/min and median shot**: the pace. A punch-in on the same take also counts as a cut (a small one may
  show only as a "change" inside the shot: check the motion sheet at that time).
- **Motion inside shots**: the mean scene score between cuts (< 0.004 still, 0.004–0.012 a talking take or a
  drift, more = moving) and the moments something changes at once without a cut.
- **Flashes**: luma jumps that come back; check each on the sheet (a white card can look like one).
- **Bed under the voice**: an upper bound from the quietest 8 % of 20 ms frames; fast speech has no real
  gaps. Listen to confirm.
- **Likely sound effects**: energy jumps off a word start or on an edit (✂). Listen; many are just plosives.
- **Words/min**: the voice's pace; a TTS take of the same script runs at its own speed.

Write what you see into FORMAT.md with the numbers next to it, then the same rules into format.json.
