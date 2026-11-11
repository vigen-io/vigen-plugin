# Format: desk-collage (a paper-collage desk: laptop doodle, sticker presenter, magazine posters)

A fast product or how-to short told as a paper collage. The presenter, cut out like a sticker with a thick
cream outline, sits cross-legged on a green cutting mat under a hand-drawn paper laptop. The laptop's screen
shows the result first: a picture with lime word stickers, then a white blink and the keyword on a lime card.
Then the frame turns white for two or three magazine **posters** with the presenter sitting small in front of
them. A hand cursor clicks a part of a poster and that part changes on the word. Back at the desk, the
presenter sits closer while the screen runs the walkthrough. The video ends on the presenter's head alone on
the mat, with the call to action hand-written under it: **"Comment KEYWORD"**. There are no subtitles: the
only words on screen are the hook's stickers, the keyword, the poster headlines and the CTA.

Measured from two references by the same channel (English, 32 s at 600×1066 and 24 s at 1080×1920; called
ref-1 and ref-2 below, not shipped): ~207–269 words/min, 3–4 hard cuts (only between layouts), no flashes,
the presenter on screen 100 % of the time.

Proof (§ A.6 of the skill): `videos/desk-collage-proof/renders/proof-4.mp4`, approved.

## 0. Before the first video

- **The koi's look** (`looks.json`, required): the koi sitting cross-legged on the floor, a laptop on the
  lap, the whole figure in frame on a plain light backdrop. Every layout is a placement of this one take
  (§ 1), and the posters need the whole seated figure, so the koi's own photo can't stand in.
  `vigen.mjs koi looks <koiDir> --template desk-collage` first: a `desk-collage-desk` look already made is
  offered before a new one (one standard image ≈ 22 credits, said and agreed first).
- **The template's shot** is `shots/desk.jpg`: a generated presenter (not a frame of the references) in the
  pose and framing every look copies: sitting cross-legged on a plain light-grey floor, a plain silver
  laptop on the lap, the hands resting loosely on the knees, the head top at 28.5 % and the feet at 91.7 %. It
  is image 2 of the look's image-gen formula (`looks.json`). The rest pose matters: every gesture starts and
  ends in it, so it shows through the whole take. The first shot had both hands raised stiffly in front of
  the chest, and the user rejected the take for it; the shot is now a koi look (vigen-promo, 2026-11-10)
  re-posed with relaxed hands on the knees.
- **The project**: copy `fonts/*.ttf` into `assets/fonts/`, `assets/mat.jpg` and `assets/laptop.png` into
  `assets/desk/`, and `cards/*.html` into `cards/`. `assets/make.py` redraws the mat and the laptop.

## 1. Four layouts, one take

Every second is one of four layouts. Each is a viz-cards `html` card placed with the shots layout `card`
and `rect` = the whole frame (format.json `brand.card`), with its presenter placement. `hold: true` keeps one
on screen at all times. The cuts between them are the video's only cuts.

| layout | share (ref-1 / ref-2) | card | presenter (format.json `shots.presenters`) |
|---|---|---|---|
| **desk**: mat, laptop, the hook and title on its screen | 12 % (0–3.8 s / 0–3.0 s) | `laptop.html` | `desk`: head top at 48 %, the lap at the frame's bottom edge |
| **poster**: white page, the magazine poster | 27 % (3.8–12.9 / 3.0–9.0 s) | `poster.html`, `bg` white | `poster`: small, the whole figure, head top at 52 % |
| **close**: the same desk, the presenter ≈ 1.2× bigger, the walkthrough on screen | 50 % (12.9–29.0 / 9.0–20.6 s) | `laptop.html` again | `close`: head top at 50 % |
| **cta**: mat only, the presenter's head, the hand-written CTA | 11 % (last 2.9 / 3.2 s) | `cta.html` | `head`: the head alone, no outline, top at 14 % |

- The presenter is a **sticker** in every layout but the last: a ≈ 15 px cream outline `#F5F2B4`
  (`shots.sticker`; it scales with the figure, ≈ 8 px on the posters), soft-edged, hard against the mat.
  The outline **boils** like a hand-cut edge: it wobbles ≈ 3 px and is redrawn 8 times a second, so it never
  sits still even while the presenter does (`sticker.boil` / `boilFps`).
- The camera never moves. The step from desk to close is a cut, landing on the first walkthrough screen.
- The layouts run in this order, every time: desk → poster → close → cta. A longer script can repeat
  poster → close once, never more.

## 2. The desk and its screen (`cards/laptop.html`)

A hand-drawn paper laptop (crumpled cream paper `#E0D1B6` cut out round a thick black doodle, 1080×830 at
y 150) on the mat (`#5E825A`: a fine grid every 54 px, a brighter line every 270 px, ruler numbers on the top
and left edges). The screen is 750×396 at (165, 207). One file serves every desk stretch: each card shows the
`SCREENS` that fall inside its own start–end.

- **Hook (0 – ≈ 1.7 s)**: the *result* the video promises fills the screen (the finished poster, the packed
  gift box, the full meal-prep boxes): an `image`. Its key words pop on as **lime stickers** (`#D4F842`,
  white heavy italic Archivo (900, the title's family) with an 8 px black outline, tilted 2–3°; the
  references' Playfair Display looked clogged under the outline and crowded the Vietnamese accents, so the
  user had it replaced), one per word group, each on its spoken
  word: "MAKE IT" / "PERSONAL", "Higgsfield" / "just made" / "the thing". 2–3 stickers, ≤ 2 words each.
- **Title (≈ 1.7 s to the cut)**: a white blink (0.1 s), then a lime gradient (`#EDFFC2 → #B6F51F`, a faint
  dot texture) wipes in from the right in 0.16 s. The keyword (the CTA's keyword) slides in after it, blurred,
  in heavy black italic Archivo, with a thin outlined echo below it; four black sparkles pop in one by one.
  It lands on the hook's last line ("Look at this.", "Build the gift around it.") and holds ≥ 1 s. `kicker`
  is an optional small line above it (the product's name).
- **Walkthrough (the close stretch)**: the real app on the screen, ~one action per spoken clause ("Swap the
  product. Change the text."), ending on the finished result. It is a shots panel on rect
  `{ x: 165, y: 207, w: 750, h: 396, r: 18 }`, listed after the laptop card, over a `slot` screen
  (`{ at: <cut>, kind: "slot" }` in `SCREENS`), `in`/`out` cut. In order:
  1. The user's own screen recording of the app.
  2. Else a **ui-demo** card of the *real* UI (ui-demo § 2–3): reference screenshots of today's screens
     first (the user's, a public page via `ref`, or the app rendered from its own source), a screen matched
     against them with `match`, steps that pass `qa`, then `compose --size 750x396 --safe 396` (the
     presenter never covers the laptop screen). Vigen itself: start from the built-in `vigen-app` screen.
  3. Never invented stills drawn for the video (an imagined editor reads as fake next to the real app; the
     user rejected them).
  On a 750×396 screen the app shows small: frame each action (`focus` / `zoom` 1.6–3: a paste at ≈ 3 on the
  field's top rows, not the whole field), keep the camera still for ≥ 0.6 s on what the line names, and
  `highlight` the real button with the narration's word as its label when they differ ("Tải xuống" ←
  "Đăng TikTok").

## 3. The posters (`cards/poster.html`)

A magazine poster on white: two colour blocks (690×975 at (300, 385), split at 65 %: a light pastel over a
strong colour), a huge black uppercase headline in two lines (Archivo 900, 118 px, line height 0.9, auto-fit)
over the blocks' top-left corner, a product photo (cut out) standing on the blocks, and the presenter
sitting small in front of all of it.

**The 3D is a stack of cut-outs, not one flat card.** Each part sits at its own depth: the blocks at the back
(and anything printed on them), the headline ≈ 70 px in front, the kicker ≈ 120, the product ≈ 170, the
tagline ≈ 260; the presenter is flat on top (shots). When the poster turns, the layers slide past each other:
the headline pokes out past the block's edge, the product drifts across the panel (ref-2's "AIRY", ref-1's
"GOOD CLEAN" swinging in). The turns:
- **swing-in** ≈ 0.6 s from ≈ 38° (alternating sides), easing back with a slight overshoot;
- **swing-out** the last ≈ 0.3 s before the next poster, the same way round, so the cut lands mid-turn like a
  page turning;
- **sway** between them: ±6–8° around the vertical axis, ±2° the others, ≈ 1.2 s a move, never still;
- a **sideways motion blur** on every layer during the swings (heavy at the turn, gone as it settles).
A poster can also take the headline in the lower block's colour (`ink: "bottom"`) and print it again upside
down in the lower block in the upper block's colour (`mirror: true`), as "AIRY" in ref-2.

- **2–3 posters**, one per example or variation in the script, each 1.5–3.5 s (refs: 1.0–5.5 s).
  Headline = the example in 2–3 words ("A GOOD STORY", "A LITTLE COMFORT", "STAY GOLDEN", "AIRY").
- **In-place edits** are the point when the video is about a tool: the hand cursor travels to a part and
  clicks it 0.15 s before the word, and that part changes on the word (product, headline or colours). One
  change per spoken instruction ("Swap the product." → img, "Change the text." → headline). At least one
  per video.
- Hold each headline ≥ 1.2 s before it changes (HyperFrames' craft check flags shorter; the proof's
  0.87 s "A GOOD BASE" was the stand-in script's pace).
- **Colours**: `PALETTE` in the card (cream/teal, sage/coral, cream/dusty blue, butter/hot pink,
  cream/red, cream/sky), a different pair per poster.
- **Product photos**: one object per poster, cut out (transparent PNG), centred in a 640 px box over the
  blocks so its top half stays clear of the presenter's head. Prefer **tall** things (a bottle, a book, a
  bookmark, a jar with a dipper): every reference product stands upright; `rot` stands a wide one up.
  1. **Stock first** (stock-media, `media_queries.json` with "<thing> white background" / "<thing>
     isolated"): a photo of the thing alone on plain white. The keyless sources (Openverse, Wikimedia) are
     thin here: in the proof, 1 of 6–15 results per product was usable. `PEXELS_API_KEY` / `PIXABAY_API_KEY`
     in `.env` give many more isolated product shots.
  2. **Cut it out with `assets/cutout.py`** (`python3 -I formats/desk-collage/assets/cutout.py <photo>
     assets/media/<id>.png`): it floods the white background in from the edges, so white *inside* the object
     stays. **Not `remove-background`**: it is a person matte, and on products it punched holes (the rice out
     of a pot, a hole in a fruit bowl, carrot tops eaten away). Look at every cutout on a bright colour.
  3. Nothing usable after two rounds of queries: an image-gen product shot on plain white (say it's
     generated), then the same cutout.
- Optional `kicker` (a brand word above the headline) and `tagline` (a small tilted line under the poster),
  as in ref-1 (a brand word and a three-word slogan).

## 4. The sign-off (`cards/cta.html`)

The laptop and the outline gone: the presenter's head alone (cut off below the chin, talking) high on the mat,
and under it, written on line by line on their words (a left-to-right reveal, ≈ 0.06 s a letter), white:

1. **"Comment"**: brush script (Caveat Brush) 120 px at (180, 1060),
2. **the KEYWORD**: big brush caps 150 px, set right (ending near x 790), the same word as the title card,
3. **a short last line**: 72–84 px ("I'll send you the link.", "Who's yours for?").

Each line gets two quick red strokes under it (`#D60C28`) right after it's written. Vietnamese lines switch to
Sriracha by themselves (Caveat Brush has no Vietnamese). The CTA starts on its first word and runs to the end
(≈ 3 s).

## 5. The script

- **Topic**: a tool, product or method the viewer can get from the creator (a link or template sent on a
  comment: that's what the keyword is for), or a how-to with a payoff (a gift box, a meal plan).
- **Shape (24–32 s, ≈ 210–260 words/min English; Vietnamese ≈ 17 characters a second)**:
  1. **Hook, 2–3 s**: the result in one line ("Higgsfield just made the thing I've been waiting for
     somebody to make.", "Start with one thing they love."), then a turn to the screen ("Look at this.",
     "Build the gift around it.") for the title.
  2. **Examples, 5–9 s**: 2–4 very short sentences, one per poster or edit ("Swap the product. Change the
     text. Completely different poster.", "Pick a book, something to sip, and a bookmark.").
  3. **Walkthrough, 11–16 s**: what you do in it, a clause per action, ending on the payoff ("And it turns a
     selfie into a full YouTube banner.", "Leave a little space so each piece feels chosen.").
  4. **CTA, ≈ 3 s**: "Comment KEYWORD and I'll send you the link." / "Comment GIFT and tell me who yours is
     for." The keyword is one short word in caps and is the title card's word.
- No intro, no "hi guys", no subtitles to write.
- Parts split at the layout changes (the cuts hide the seams). A walkthrough longer than ≈ 17 s is two parts:
  the close shot for the app steps, then the desk shot for the rest (a cut on the seam), the walkthrough card
  running across both above the laptop cards (`"z": 150` on its shots panel).

## 6. Sound

- A light music bed under everything, ≈ 15 dB under the voice (dissect's upper bounds: 9 dB on ref-1, whose
  speech has no gaps; 17 dB on ref-2).
- The cut from the desk to the posters is a **paper pass** (`"in": "paper"` on the posters panel): a torn sheet
  sweeps up over the frame on the hook's last words and lifts off as the first poster swings in. The references
  hard-cut there; the user found that too abrupt and approved the paper pass with a soft page-turn sound
  (`cues: "auto"` places it; vigen-promo, 2026-11-10).
- Likely effects on the edits (✂ at the cut to the posters, 3.2 s; at the walkthrough's reveal, 19.7 s) and on
  poster swaps (5.3 s): a soft swipe or click. Unconfirmed by ear: offer them, and let the user pick by
  ear (no caption sounds without the user's ear).

## 7. Numbers to hit (dissect + compare on the render)

- 4–14 cuts a minute (the layout changes only), the longest shot ≤ 17 s, no flashes.
- Bed 9–18 dB under the voice (dissect's upper bound).
- By eye on the motion sheets: the stickers popping on their words, the blink, wipe and slide of the title,
  every poster swinging in and every click changing its part on its word, the presenter bigger in the
  close stretch, the CTA lines written on in order with their red strokes.
