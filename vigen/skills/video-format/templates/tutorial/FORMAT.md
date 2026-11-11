# Format: tutorial (How to create this?)

A 35–40 s "how I made this" reel. It opens on the finished result with the question **HOW TO CREATE
THIS?**, walks through the steps on screen recordings while the presenter talks over them from a small
window, and ends by replaying the result on black so the video loops back to its first frame. The result
sells the tutorial; the steps are fast and concrete ("open X, upload Y, press Generate"). Measured from two
English references by different creators in the same style (`ref-1/`, `ref-2/`: 36.9 and 37.0 s; 119 and
150 words a minute; hard cuts only, no flashes).

Proof (§ A.6 of the skill): `videos/tutorial-proof/renders/proof-3.mp4`, approved by the user on 2026-11-10.

## 0. The koi

Two takes, like the references: the **hook** is the koi's own photo talking to the lens, and the **walkthrough**
is a second take in the `screen` look (`looks.json`): the same person, room, clothes and light, turned
three-quarter toward a monitor at the frame's left edge, eyes on the screen, as if doing the steps while they say
them. The parts are split at the hook's last full stop (part 1 = hook, part 2 = walkthrough, `<parts>/looks.json`
`{ "2": "tutorial-screen" }`).
- The look is an **edit of the koi's own photo**, not a recreated set: image 1 = the koi's `frame.*` (who, the
  room, the clothes, the light), image 2 = `shots/screen.jpg` (only the pose, the face angle and where the monitor
  stands, and the framing). `looks.json` has the prompt. Generate it **16:9** at 1K: the window is 16:9 and shows
  the whole frame (head ≈ half its height, chin well clear of the bottom). A square look can't work: the model keeps
  the head ≈ 45 % of a square frame whatever the prompt says, and the window then shows only the face. Check: same
  face, both eyes visible, mouth closed, the mic (if any) clear of the mouth. One image (≈ 22 credits): say it and
  get a yes, like the lipsync.
- **The plate is built per part** (vigen `parts.mjs` joins parts at the first part's size and would squash the
  16:9 one): part 1 fitted to 1080×1920 by width over a blurred copy of itself; part 2 scaled to the window's
  height (503) and placed exactly where the window looks (`window.zoom` 1: x = 95 − clamp(540 − headCenterX·1080,
  −95, 95), y = faceY·1920 − 503·faceAt), over its own blurred copy; then joined at the seam with the parts' audio,
  and prepped as one take. Keep talking.json's `layout` from part 1 (the hook's framing is measured on it).
- Gestures for part 2: the eyes stay on the screen; a glance to the lens only on the payoff line. No hands
  (they are on the mouse and keyboard, below the frame).
- A take that isn't 9:16 (a square koi photo) is fitted by width over a blurred copy of itself before prep, or
  every framing comes out far too tight. Keep the chin well clear of the window's bottom edge.

## 1. Three acts, three layouts, hard cuts between

| act | time | layout | what it looks like |
|---|---|---|---|
| **Hook** | 0 → 7.5 s (6.5–8) | `split`, media at the bottom | presenter fills the top 840 px (1080×840, face ≈ 45 % down it, framed close: `punch`); the **result** fills the bottom 1080×1080 square, edge to edge, no gap |
| **Walkthrough** | 7.5 s → end of speech (≈ 70 %) | `window` | electric-blue page `#0400F1`; the presenter in a window 890×503 at (95, 104), square corners; the step's **screen** in a fixed 890×980 box below it (same x and width, y 620–1600), always full: ≈ 320 px of blue stays at the bottom, where the platform's caption and buttons sit (ref-1: 326 px; ref-2's box was shorter, 473 px left) |
| **Outro** | last 2.5–3.5 s, silent | `full`, `rect` 980² at (50, 470), `backdrop: "#000"`, `subs: false` | the result again, a centred square on black, no presenter, no subtitles; it ends where the video starts, so the reel loops |

Every change is a hard cut. Nothing slides, pops, flashes or zooms between shots. The cuts into the
walkthrough and into the outro fall at the end of a sentence.

## 2. What fills them

- **The result** (hook and outro): the thing the tutorial makes, as a reel of its best moments: 4–8
  clips or stills, hard cuts every 0.15–2 s (fastest in the first 2 s: 0.13 s flicks in both references), the
  same subject throughout. It is the user's own output (a generated video, an avatar, a design): ask for it.
  Never stock footage. Square (1:1) or cropped to square. The outro replays the reel's opening 2.5–3.5 s, so
  its last frame cuts cleanly back to frame 0.
- **The steps** (walkthrough): one screen recording (or screenshot) **per step**, cut on the step's first
  word: the app opening, the button pressed, the field filled, the result appearing. Real screens of the
  real tools, with the cursor. The user's own recordings first (they fill the box, cropped with `focus`);
  otherwise the **ui-demo** skill, one walkthrough card for the whole act, built as a compact screen of
  about the box's shape (≈ 640×700: whole-screen zoom ≈ 1.4) and composed at the box's size:
  `ui-demo.mjs compose <demo.json> --size 890x980 --safe 980` (nothing covers the box, so all of it is safe),
  then one `window` panel `{ "comp": "ui-<id>" }`. ref-1 changes screen every ≈ 2 s (12 screens), ref-2
  every ≈ 4–6 s (6 screens, each one drawn live): ~1 action per clause, a click on each step's verb. Never
  b-roll here: every box is a screen.
- The last line of the walkthrough lands on the finished result inside the box (a player card, the export),
  and then the outro replays the result full size.

## 3. Words on screen

- **Question label, the whole hook** (`cards/label.html`, layout `over`, 0 → hook end): a 12-point red
  starburst `#F0141E` (80 px, at x 152) overlapping a black bar (y 757–838, 81 px tall) of white capitals,
  Be Vietnam Pro ExtraBold 58 px, tracking −0.05 em: **HOW TO CREATE THIS?** It sits on the bottom edge of
  the presenter half, is there from frame 0 and goes on the cut. Change the words only when the topic asks
  for it ("HOW I MADE THIS?"), always a question.
- **Subtitles, always on while they speak** (`subtitles.mjs`): 2–3 words a chunk (≤ 20 characters), white
  capitals, Be Vietnam Pro ExtraBold 58 px, tracking −0.05 em, a soft shadow and no outline or box. They
  change on a cut, no entrance. Hook: just above the label (top 0.33); walkthrough: in the lower part of the
  presenter window (top 0.25, over the chest). None in the outro. (ref-1 has none in the hook; ref-2 has
  them: the template keeps them for the koi.)
- **HUD tags over the result** (`cards/hud.html`, layout `over`, in the hook and again in the outro): game-
  style tags that name the tutorial's steps over the finished result. A dark translucent chip centred near
  the bottom of the square (Russo One, light grey, letter-spaced: "SKY / SUN / STARS", "LEVEL 1",
  "COMPLETE") and a plain word or score in the bottom-right corner ("SUN", "STARS", "+100", "x3").
  Each replaces the last on the reel's cuts. End the hook on the chip with every step's name
  ("SKY / SUN / STARS"), and replay that chip in the outro.
- No titles, no highlights, no drawn marks.

## 4. Camera

- Hook: the presenter close (`punch`: head and shoulders filling the top half). One framing for the whole
  hook.
- Walkthrough: the window shows the whole 16:9 `screen` take (the plate puts it there): head about half the
  window's height, chin well clear of the bottom edge, shoulders and upper chest in, the monitor's edge at the left.
  No moves.
- No zooms, no drift on stills (screens must read).

## 5. Sound

- A music bed under the voice, ≈ 12 dB below (ref-2: 11.9; ref-1 reads as louder but its speech has no
  gaps to measure). Upbeat and light, with a clear pulse.
- Outro: the voice stops and the music carries the replay. ref-1 brings it up to the voice's level; ref-2
  keeps the bed. Default: the bed as it is; bring it up when the track has a good landing there.
- Effects: none on the cuts. **A real mouse click on every click of the walkthrough** (`sound.uiClicks`: the
  sound skill places the palette's `mouse` sounds from the ui-demo card's own click steps, the press on the
  click). It sells that the presenter is doing it. The result reel may keep its own game sounds when the user's
  clip has them.

## 6. Structure (the script's pattern)

1. **Hook (one or two sentences, ≈ 7 s)**: a question or promise about the result, said while it plays: "How
   did I make this pixel sunset wallpaper? Five minutes, three steps." / "Want a logo that looks hand-drawn?
   Start with one simple shape." The label asks the question even when the voice doesn't.
2. **Steps (≈ 25 s)**: first person or imperative, one short clause per step, chained by "then", "first",
   "and then": the tool, the action, the input. 4–10 steps; no theory, no why.
3. **Payoff line**: the last step's result plus a short sign-off ("and that's it", "a few pixels, a whole new
   wallpaper"). No CTA, no "follow for more": the loop is the ending.
4. **Outro**: silent result replay, 2.5–3.5 s.

≈ 80–90 words for a 37 s video (≈ 135 words a minute; 2.5 words a second for a TTS voice).

## 7. Numbers to hit (check with dissect on the render)

- Length 35–40 s; hook 6.5–8 s; outro 2.5–3.5 s, silent.
- Cuts: 15–35 a minute (most of them inside the hook's reel); median shot 0.2–2.5 s; the longest shot is the
  walkthrough's single window take (screen changes inside it read as "changes", not cuts): ≤ 25 s.
- No flashes. Presenter alone on screen: never (≤ 5 %).
- Subtitles on screen ≥ 90 % of the speech.
- Bed 9–15 dB under the voice.
