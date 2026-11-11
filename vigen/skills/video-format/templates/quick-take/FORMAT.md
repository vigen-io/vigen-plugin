# Format: quick-take (Giải thích siêu tốc)

A fast, talky vertical explainer: a 2-second hook, a problem or a mystery, the reveal (a product, a trick, a
fact), how it works, and a call to comment and follow. The presenter talks nonstop (~300 words/min) and the
picture changes layout on almost every cut. Measured from three reference videos of one Vietnamese explainer
channel (87, 79 and 128 s; 15–29 cuts a minute; median shot 1.9–2.8 s; 1–4 flashes per video), then made
with a koi. Example: the template's preview, a story about fish swarming an offshore oil rig.

## 0. The koi's frame: as it is, or reformed (optional)

Quick-take works with the koi's own photo as it is: the presenter layouts crop and cut out whatever take
there is. Ask once, before the first lipsync with this koi in this template:

First `vigen.mjs koi looks <koiDir> --template quick-take`: a `quick-take-presenter` look already made (saved, or
`onAccount` and brought in free with `koi add-look … --avatar <id>`) is offered as a third choice, shown next to
the koi photo, and needs no image.

- **Use my photo as it is** (free): lipsync the koi's own avatar.
- **Reform it into the template's presenter shot** (one standard image, ≈ 22 credits): chest-up behind a desk with
  a keyboard, a desk mic on an arm and a lav mic, hands clasped, in the koi's own clothes (never green: it keys out), a green-screen studio (the edit
  keys the green onto the template's backgrounds). Made with the image-gen skill's formula from
  `looks.json`: image 1 = a crop of the koi's head, image 2 = `shots/presenter.jpg`, `{{outfit}}` = the koi's clothes from their photo. Show it next to the
  koi photo; on a yes, `vigen.mjs koi add-look <koiDir> --template quick-take --look presenter --frame <file>`
  and lipsync every part with `--look quick-take-presenter`.

Reformed once, the `quick-take-presenter` look serves every later quick-take video of that koi (`koi looks`).

## 1. Layouts: five, cut between hard

Every cut is a hard cut (no slides between shots); the motion is *inside* a shot (cards pop, flip or slide in,
stills drift). The picture moves between five layouts:

| layout | what it looks like | share | used for |
|---|---|---|---|
| **presenter** | the presenter alone, chest-up, eyes high in frame (face ≈ 30–35 % down) | 30–40 % | the breathers: opinions, transitions, questions to the viewer, the CTA |
| **split** | media fills the top half edge to edge; the presenter (a crop of the same take) fills the bottom half, face ≈ 68 % down | 20–35 % | a thing being talked about while they keep talking: a photo, a clip, a screen |
| **full** | media fills the whole frame; the presenter is gone; captions stay | 25–30 % | the strongest images: a hero shot, a striking clip, a demo |
| **card** | a brand background (warm orange gradient), the presenter cut out at the bottom, a card or logo in the top part | 10–15 % | names and things: a product card, brand logos flipping in, a screenshot, a phone mockup, a diagram |
| **pip** | a screen recording full frame with the presenter in a small circle at the top | rare | step-by-step on screen |

A softer variant of the same grammar: a cream background, the presenter in a rounded window in the bottom
40 %, and an evolving icon diagram built up above them across several sentences.

## 2. What fills them

- **Abstract lines**: build the idea as **viz-cards** (an evolving html card, a composed scene) before
  generating any image. Search first, generate last.
- **Concrete lines**: real footage of the thing → **stock-media** (matching the setting), the user's own
  clips, **ui-demo** for app steps.
- **Named products**: logos as cards that flip or pop in on their name → **viz-cards `logos`**.
- **Ideas that build over several sentences**: one **viz-cards html** card kept on screen and changed
  sentence by sentence.

## 3. Words on screen

- **Subtitles, always on** (captions `subtitles.mjs`): 2–4 words at a time (≈ 0.5–1.2 s each), the script's
  own words, white ExtraBold, a thin dark outline and soft shadow (or white on a translucent grey label box).
  They change on the cut, no entrance animation. Where they sit depends on the layout: on the chest
  (presenter, card: ≈ 69 % down), on the seam just above the presenter (split: ≈ 46 %), lower third (full).
- **Titles, ~1 every 20–30 s** (`titles.json`): a headline in heavy uppercase over a full-frame image, on the
  claim the video hangs on ("GIÀN KHOAN DẦU", "SÔI SÙNG SỤC", a product name, the CTA keyword). Often with a
  drawn accent: a swoosh, an arrow, a circled element.
- **Highlights on screens**: a circle drawn around the button, a check mark popping on the result.
- **Top safe zone**: the TikTok / Shorts top bar covers the top of the frame. Card box, cover photo and any
  placed graphic start at y ≥ 12 % (≈ 230 px of 1920); titles and cover text at ≥ 16 %. Only full-bleed media
  (full / split) touches the top edge. 9:16.

## 4. Camera

- Within a run of presenter shots the framing alternates (a slightly closer crop on the next cut,
  `frames` wide / punch / tight). No slow zooms on the presenter.
- Stills and illustrations drift slowly (a gentle push), so a still never sits dead.

## 5. Sound

- A music bed under everything, 13–17 dB under the voice.
- Sound effects sit on the edits (about half the cuts): soft whooshes as a card or logo arrives, pops on
  icons. Nothing on the subtitles.

## 6. Structure

1. **Frame 0: a cover**: the thumbnail (presenter photo, a big two-line title, a picture of the subject), one
   frame only, so the feed shows it.
2. **Hook, 0–2 s**: a striking image (split or full) and a question to the viewer.
3. **Problem → reveal**: the problem told with images; the reveal with a title and a card.
4. **How it works**: screens, steps, a diagram that builds up.
5. **Proof / payoff**: the result on screen, a reaction.
6. **CTA** on a plain presenter shot: ask to comment a keyword and follow. Starter cards for a promise
   ("bí kíp gửi cuối video", "trọn bộ"): `cards/bikip.html`, `cards/tronbo.html` (viz-cards `html`; copy into
   the project's `cards/` and retime).

## 7. Numbers to hit (check with dissect on the render)

- 18–30 cuts a minute; median shot 2–2.8 s; no shot over ~6 s except the CTA.
- Layout share: presenter ≤ 40 %, the rest media.
- Subtitles on screen ≥ 90 % of the speech.
- 0–3 white flashes a minute (they mark a turn, not decoration).
- Music 13–17 dB under the voice.
