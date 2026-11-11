# Format: verdict-board (Habit verdicts on a tier board)

A calm, seated interview: an off-screen interviewer asks about 8–10 everyday habits on one topic ("phone
battery habits"), one short question each, and the presenter, looking at the interviewer beside the camera,
gives a one-line verdict and a one-sentence reason. The habit's icon flies up into one of three tiers
(**HURTS / NO EFFECT / HELPS**) on a board along the top of the frame. The board is on screen, empty, from the first frame, so the viewer watches it fill up. The last item
is the call to follow, which lands in a bonus slot under HELPS. Measured from one reference (English, 75 s,
1080×1920, 30 fps): one take with no b-roll, ~158 words/min, 10 items plus the CTA, one item every
~6.8 s. Two voices: the questions are someone else's (the interviewer is never seen), the answers the
presenter's.

Proof (§ A.6 of the skill): the example on vigen.io/templates#verdict-board (a skincare interview, 70 s, two
voices), approved 2026-11-10. The older `videos/verdict-board-proof/renders/proof-1.mp4` was a single-voice draft
with the presenter speaking the questions to the lens: not this format.

## 0. The koi's frame: as it is, or reformed (optional)

The format is one seated, chest-up take at a wooden table, in a warm, dim room (a mushroom lamp and a plant
on a shelf at the left, a door on the right). The presenter does **not** look into the lens: the head is turned
about 20° to the left of the frame and the eyes rest on the interviewer sitting just beside the camera, for the
whole video. The rest pose is the forearms on the table with one hand resting over the other, sharp and fully
in frame (a first shot with the hands blurred and half out of frame barely gestured in the lipsync). The top
~35 % of the frame is empty wall: the board sits there. The template's shot is `shots/seated.jpg` (a generated
look, not a reference frame).

Ask once, before the first lipsync with this koi in this template (`vigen.mjs koi looks <koiDir> --template
verdict-board` first: a `verdict-board-seated` look already made is offered as a third choice):

- **Use my photo as it is** (free): only when the koi's photo has headroom above the head (the board needs the
  top third) and the koi looks off to the side. A tight headshot puts the board over the face, and a koi
  looking into the lens breaks the interview: say so and recommend the reform.
- **Reform it into the template's seated shot** (one standard image, ≈ 22 credits): `looks.json`, image-gen
  skill § 3, image 2 = `shots/seated.jpg`.

## 0b. Two voices: the interviewer asks, the koi answers

**Required.** This template takes two voices (`"voices": 2` in format.json): the koi's, and an interviewer's that
is heard but never seen. Don't voice, preview or lipsync anything until both are set; a vigen.io handoff brings
only the koi's voice, so ask for the interviewer's then. The two must sound clearly different (another speaker,
not the koi's voice again).

- **The interviewer** is a voice only, never on screen: a voice-only koi (`vigen-koi/<name>/koi.json` with
  `"avatar": null`). Its voice is either one from Vigen's library (`vigen.mjs rpc listVoices '{"q":"<name>"}'`,
  then write `"voice": { "id": …, "name": …, "language": … }` into the koi.json: nothing to clone; a vigen.io
  voice-sample link names its library voice) or a clone of a recording (`vigen.mjs koi set-voice`, vigen skill
  § 3 *Prepare the voice sample*; needs 5 s or more of clean speech). Ask the user which voice asks, once.
- **The script** marks every question with `Q:` at the start of its sentence (§ 4). `parts.mjs voice --koi
  <koiDir> --interviewer <interviewerDir>` voices each turn on its own, levels them (the question 2 dB under the
  answer) and joins them with exact gaps: 0.7 s after a question, 0.45 s before the next. Split parts with
  `---` between items.
- **What gets lipsynced**: `part-NN.mp3` is the koi's answers only, silent where the questions are, so the
  koi listens (lips closed) while the interviewer asks. `part-NN.full.mp3` has both voices: the stand-in, the
  voice preview and the joined `talking.mp4` use it. `part-NN.turns.json` gives every turn's exact span: time
  the cards, the transcript and the gestures from it.
- **Gestures**: a pinned gesture on each verdict, from just before the answer to its first pause after
  ~2.5 s. Each question is a **pinned listening chunk** that touches the answer's pin ("silent, listening to the
  person beside the camera: the lips stay closed and still the whole time, one small slow nod"), with
  `"detectDesync": false` (there is no speech to sync) and **no `textHint`**: Vigen sends a hint as
  `When speaking "<hint>": …`, so the question's words as a hint made the koi mouth the question (a take where
  she talked through "Bôi kem chống nắng khi ở trong nhà?"). The prompt keeps the eyes on the interviewer, not the lens, and lets the
  hands move off the table while talking.
- `part-NN.transcript.json` (the lipsync's words) holds the koi's words only; the project's `transcript.json`
  (captions) holds both.

## 1. One layout, two framings

| what | measured | rule |
|---|---|---|
| layout | presenter only, 100 % | no b-roll, no split, no full-frame media: the board and the icon card are the only graphics |
| framing | wide and a ≈ 1.15× punch-in, cut between | **reframe on every item change**: the cut lands as the icon flies to its tier (4.8, 9.0, 17.0, 30.9, 32.9, 36.4, 38.9, 46.8, 59.7, 68.8 s), alternating wide ↔ punch. Never a slow zoom |
| hard cuts | 3 detected (30.9, 38.9, 68.8 s) + ~10 reframes the scene detector reads as "changes without a cut" | `dissect` finds 2–10 a minute on a render |
| flashes, transitions | none | none |

Shots: `camera` with one `{ "t": <fly + 0.15>, "to": "punch" | "wide", "move": "cut" }` per item, alternating,
and the board as one panel `{ "comp": "cards/board", "start": 0, "end": <length>, "layout": "over" }`.

## 2. The board (the format's signature)

`cards/board.html` (viz-cards `html`, `"bg": "transparent"`, the whole video, placed with shots layout
`over`; `cards.size` 1080×1920 comes from format.json). Edit only its three lists:

- **TIERS**: three labels, 270×96 px at y 276 (14 %), x 90 / 405 / 720, heavy white uppercase on solid red
  `#A8001E`, mustard `#CC9E0C`, green `#3AAA35`. Rename for the topic only when the verdicts are really
  different ("SKIP / MAYBE / DO"), and keep three, coloured bad → neutral → good.
- **SLOTS**: empty slots under each label (78 px rounded tiles, translucent white, at y 404, step 91 px),
  white vertical dividers between the columns. = the most items any tier gets (3 in the reference: the
  items split 3 / 3 / 3, which reads as fair; aim for an even split).
- **ITEMS**, one per habit:
  - **pops in** on the question's first word (`in`): a 250 px white rounded card on the chest (y 1158–1408, just under
    the chin: never over the mouth, also at the punch-in),
    the icon at 58 %; it un-blurs and scales 0.82 → 1 in 0.2 s. It may come a beat early (on the previous
    reason's last words, as "Heat?" did at 33.0 s).
  - **stays** through the verdict and the reason (2–13 s, median ≈ 4 s).
  - **flies** up into the next free slot of its tier as the reason ends (`fly`): 0.2 s, shrinking to the
    slot, landing on the camera reframe. The next item pops in 0.2–0.5 s later.
  - `badge` ("80%"): a green pill with a white ring on the card's corner, for a follow-up habit with a number;
    with `merge: true` it lands on the same slot as the habit before (the reference's "capping at 80" on
    "optimized charging").
  - the **CTA** is the last item: `pill: "follow"` (a blue button), `extra: true` lands in a new row under
    HELPS with a green glow, ≈ 1 s before the end.
- **Icons**: one flat colour icon per habit, on white, never a photo. Fetch them as SVG from Iconify's Fluent
  Emoji Flat set (MIT): `curl -o assets/media/icons/<name>.svg https://api.iconify.design/fluent-emoji-flat/<name>.svg`
  (names like `battery`, `low-battery`, `thermometer`, `high-voltage`, `crescent-moon`, `electric-plug`,
  `mobile-phone`; browse at icon-sets.iconify.design/fluent-emoji-flat). Any one consistent flat set works;
  never mix sets in one video. Two habits about the same thing get visibly different icons.

## 3. Words on screen: subtitles only, coloured by meaning

Always on (captions `subtitles.mjs`), centred at ≈ 75 % down (y ≈ 1440 top), white ExtraBold ≈ 76 px
with a thin dark outline and soft shadow, 2–4 words a chunk, sentence-broken, a full stop kept; a chunk
that won't fit wraps to two lines ("Battery enemy number / one."). Hard cuts, no entrance. They vanish in
the pauses (40.2–40.8 s, 48.3–49.2 s, 61.3–62.1 s). No titles, no keyword pop-ups.

- **The question** ("Charging overnight?", "Dark mode?") is **yellow** `#FFD21F`: format.json
  `captions.question` does it from the `?`.
- **The good news** is **green** `#5BE33C`, a whole verdict ("Turn it on.", "Mostly fine.", "No harm
  done.", "Highly recommended.") or one word in a line ("Leave it around **half**", "so it can
  **stretch**", "ages **slower**"): list those phrases in the project's `highlights.json`. Bad verdicts
  ("Please don't.", "One of the worst habits.") stay white: red is the board's job.
- Everything else white.

## 4. The script

- **Topic**: one everyday thing with 8–10 common habits or beliefs people argue about ("phone battery",
  "sleep", "coffee", "washing jeans"). The verdicts must be honest; the fun is in some surprising ones.
- **Each item, 5–9 s** (≈ 13–25 words), always the same three beats:
  1. **The question**, asked by the interviewer: 2–4 words + "?", written `Q: Charging overnight?`. The
     voicing leaves 0.7 s before the answer (the reference often holds ~1 s: Fast charging? … Mostly fine.).
  2. **The verdict**, 1–3 words ("Barely matters.", "Pointless.", "Turn it on.", "Please don't.",
     "Mostly fine.", "Battery enemy number one.").
  3. **The reason**, one or two short plain sentences ("Modern phones pause at 80 and top up before you
     wake."). A follow-up habit may ride on the same item, its question asked by the interviewer too
     (`Q: Big trip?` Switch the cap off for a day. No harm done.).
- **Hook**: none beyond the first question, at 0.0 s, over the empty board. No intro, no "today we…".
- **CTA as the last item**, in the same pattern: `Q: Following this page?` Highly recommended. New
  battery-saving habits every week. It lands in the bonus slot.

```text
Q: Charging overnight?
Barely matters. Modern phones pause at 80 and top up before you wake.

Q: Dark mode?
Turn it on. Black pixels on an OLED screen are switched off.

---

Q: …
```
- Pace ≈ 150–160 words/min (English). Length 60–80 s.

## 5. Sound

- The two voices at the same loudness give or take 2 dB (`parts.mjs` levels them); the interviewer slightly
  softer, as if a little further from the mic.
- A soft music bed under everything, ≈ 13 dB under the voice (the pauses sit at ≈ −32 dB against speech at
  ≈ −19 dB mean; dissect's upper-bound reads ≈ 10 dB), cut to silence on the last frame.
- No clear effects on the flights or the pops (nothing in the 4 kHz+ band at the fly times): leave them
  silent unless the user picks a soft tick by ear.

## 6. Numbers to hit (dissect + compare on the render)

- Presenter on screen 100 % (the board is an `over` layer); no flashes.
- 2–10 cuts a minute detected (one reframe per item; small punch-ins don't always register).
- Subtitles on ≥ 90 % of the words.
- Bed 8–15 dB under the voice (dissect's upper bound).
- By eye on the motion sheets: one pop and one flight per item, the board full at the end, the CTA glowing in
  the bonus slot.
