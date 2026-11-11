# Format: brand-building (Lessons learned the hard way)

A founder's honest look back: the presenter opens on what they put into their business and what it actually
made ("I put $9,400 into my clothing brand and made a total profit of… $1,284. Ouch."), promises the
lessons nobody tells you, gives three numbered lessons with their own story, then a fast "fast forward to
now" montage of how far it has come, and closes on almost quitting. Seated at a desk with a small mic in
hand, cut very fast (a cut every ~1 s) between the take, b-roll of the work, and bold type cards. One
subtitle word at a time, small, dead centre. Measured from two references with the same script and edit
(English; `ref-1/` 67 s 1080×1920 30 fps, `ref-2/` 77 s 720×1280 25 fps): 34–42 cuts a minute, median shot
0.87–1.0 s, ~195 words/min.

Proof (§ A.6 of the skill): `videos/brand-building-proof/renders/proof-2.mp4`, approved by the user (2026-11-10).

## 0. The koi's frame: as it is, or reformed (optional)

The format is one seated, chest-up take facing the lens: the presenter behind a desk (its edge across the
bottom ~18 %), holding a small clip-on mic just under the chin, a calm room behind (a lamp, a framed print).
The face sits ≈ 33 % down, the chest at the centre, where the subtitle goes.

Ask once, before the first lipsync with this koi in this template (`vigen.mjs koi looks <koiDir> --template
brand-building` first: a `brand-building-desk` look already made is offered as a third choice):

- **Use my photo as it is** (free): any seated or standing chest-up photo facing the lens works; the subtitle
  sits on the chest.
- **Reform it into the template's desk shot** (one standard image, ≈ 22 credits): `looks.json`, image-gen
  skill § 3, image 2 = `shots/desk.jpg`. The reference presenter wears sunglasses; the look never copies them.

`shots/desk.jpg` is the template's own generated look (a generic presenter in the reference's set, made with
one image-gen edit of a clean reference frame), never a frame of the reference video.

## 1. Layouts: three, cut between hard

Every cut is hard (no slides, no zooms between shots); the motion is inside the cards (digits typing, words
dropping in, a profile card sliding). Measured on ref-1:

| layout | what it looks like | share | used for |
|---|---|---|---|
| **presenter** | the take, wide, punch (1.18×) or tight (1.3×): no graphics but the subtitle | ≈ 50 % | the hook, "Ouch.", every "Number one/two…" line, opinions, the close |
| **b-roll** (`full`) | real footage of the work filling the frame: hands at a laptop, cutting fabric, packing orders, a product page, the workspace | ≈ 35 % | the story inside each lesson; the topic montage after the title (B&W); the "fast forward" montage |
| **type** (`full` / `over` cards) | bold type on flat colour, or over the take | ≈ 15 % | the money, the promise, a proof number, audience growth, a lesson said on its own |

- **Presenter framing changes on every return** to the take: wide ↔ punch, alternating (`camera` cuts on the
  panel ends). The reaction ("Ouch.") is a tight punch-in. No slow zooms.
- **B-roll shots are short**: 0.5–2.5 s, one or two words each in the montages (0.5–0.8 s), up to 2.5 s
  inside a lesson. Many b-roll shots in a row with no presenter between them is normal (up to 8 s in the
  "fast forward" montage).
- **Longest presenter shots** are the lesson explanations (up to 6 s, ≈ 2 per video); everything else
  ≤ 3 s.
- **B&W**: the first montage (right after the title) is graded black and white (shots `"grade": { "to":
  "bw", "dur": 0 }`); the rest of the b-roll stays in colour, with an occasional B&W shot.

## 2. What fills them

- **B-roll is the business itself.** The user's own clips first (their product, their workspace, packing
  orders, their site on a laptop, sketching): ask for them once, into `library/`. Else **stock-media**,
  concrete to the line ("posting the process" → a phone filming a sewing table; "drive people to a product
  page" → hands typing on a laptop, top-down; "shipped 300 orders" → packing mailers). Never generated, never
  the koi (looks are only for the presenter take).
- **Numbers are type, never footage**: money → `money` / `count` cards; a proof number mid-sentence →
  `stack`; followers or audience → `profile`.
- **A lesson's own statement** (the third one especially) may be said on word cards (`plain`) instead of the
  take: cream for the claim, black for its end.

## 3. Words on screen

**Subtitles, always on** (captions `subtitles.mjs`): one word at a time (two short words may share:
"and I", "in my", "to a": `chunk` 2 words / 7 characters), the script's own words with their punctuation
("Ouch.", "brand.", "audience,"). Inter SemiBold 52 px white with a soft shadow, centred on the frame
(top ≈ 0.484, i.e. the word's middle at y ≈ 960) in **every** layout: on the presenter's chest, over b-roll,
on cards. Dark `#111111` without the shadow on light cards (shots panel `"subColor"`). Hard cuts, no
entrance. Hidden while a card shows the words itself (shots panel `"subs": false`).

- **Emphasis**: once or twice a video a single word is bigger (88 px), the word the sentence hangs on
  ("profit", "blow up"): `emphasis.json`.
- **A number over b-roll** ("three, **4** years in the making"): white Inter ExtraBold ≈ 130 px at y ≈ 0.44,
  for one b-roll shot: a `titles.json` entry `{ "start", "end", "text": "4", "style": "b", "top": 0.42, "replace": true }`.

**The cards** (`cards/`, viz-cards `html`, `"size"` 1080×1920 from format.json; copy into the project's
`cards/` and retime). The font is Inter (`fonts/Inter.ttf`, OFL, shipped into `assets/fonts/` by captions).

| card | when | layout | look |
|---|---|---|---|
| `money.html` | the hook's investment, as it is said | `over`, `subs: false`, ends on the next word's start | ≈ 150 px dark red `#840311` digits typing in ("$9," → "$9,400"), a small white "dollars" a beat later, y ≈ 1050 |
| `count.html` | the result, right after "a total profit of" | `full`, `subs: false` | 4 colour cards flipping each ≈ 0.65 s, white → yellow `#F3A520` (red ink) → red `#CA100F` → black, the digits typing in, "dollars" on the last |
| `title.html` | the promise ("what nobody tells you", "three things I learned the hard way") | `full`, `subs: false` | cream capitals ≈ 185 px Inter Black on maroon `#370004`, a line per word dropping in, ends in a pink-white bloom into the B&W montage |
| `stack.html` | a proof number mid-sentence ("more than 100") | `over`, `subs: false`, on a `full` panel of the plate graded `blur` | MORE / **100** / THAN stacked, white 132 px and red `#880513` 230 px, each row on its word |
| `profile.html` | "you need an audience" | `full`, `subColor: "#111111"` | grey screen, a white profile card (koi's face, placeholder bars, no platform branding) sliding in from the right, followers racing up |
| `plain.html` | a line on its own | `full`; cream + `subColor` or black | a flat colour and the subtitle |

**Top safe zone**: nothing but full-bleed footage sits above y ≈ 12 %; the type stays in the middle band.

## 4. The script

Same skeleton every time, ~195 words/min (≈ 60–80 s, 200–260 words). English or the user's language.

1. **Hook, 0–4.5 s**: "I put **$X** into my <business> and made a total profit of…" (money card on the
   amount).
2. **Reveal, 2–2.8 s**: the result amount (count card), smaller than expected or simply honest.
3. **Reaction, ≈ 1 s**: one word, "Ouch." (tight punch-in).
4. **Promise, ≈ 1 s**: "Here's what nobody tells you" / "Here are three things I learned the hard way"
   (title card), then "about <starting a clothing brand>." over a 3–4-shot B&W montage (≈ 1.3 s).
5. **Three lessons, 12–20 s each**, each opened on the take: "Number one: <the lesson, 4–7 words>." Then
   the story with a concrete detail and a number (b-roll; a proof card: stack, profile), and its turn ("But
   to get people to a product page, you need an audience."). Lesson two admits a flaw ("your first sample
   will be bad. Really bad. That's fine."). Lesson three opens "And last:" and is said on word cards.
6. **Fast forward, ≈ 8 s**: "And fast forward to now, <time> since <the first step>, and <the result with
   a number>." A rapid b-roll montage, 0.5–0.8 s a shot, a big number on one shot.
7. **Close, ≈ 5 s, on the take**: "And the crazy part is I almost quit before any of that happened. So trust
   the process and keep <shipping / building>." No follow request, no CTA card.

## 5. Sound

- A music bed under everything, ≈ 13 dB under the voice (dissect's upper bound reads 11–14 dB on the two
  references: speech is nonstop, so listen).
- Effects: soft whooshes/ticks on the type cards' cuts (the count's colour flips, the title's lines, the
  stack's rows) and a few on montage cuts; ≈ 13–38 measured hits a video, most on edits. `cues: "auto"`
  plus accents on the card beats by ear. Nothing on the subtitles.

## 6. Numbers to hit (dissect + compare on the render)

- 30–45 cuts a minute; median shot 0.7–1.3 s; no shot over 6.5 s.
- Presenter alone 40–60 % of the time (shots panels).
- Subtitles on ≥ 80 % of the words (the rest are shown by the money, count, title and stack cards).
- 0.5–3 flashes a minute (the title's bloom and the bright cards read as flashes; no light leaks).
- Bed 10–16 dB under the voice (upper bound).
- By eye on the motion sheets: digits typing on the money and count cards, the title's lines dropping in, the
  presenter framing changing on every return, one word at a time centred everywhere.
