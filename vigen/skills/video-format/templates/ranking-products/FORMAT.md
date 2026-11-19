# Format: ranking-products (Guess the top N, the board fills up)

A guessing game on a hidden ranking. An off-screen host reads the challenge ("Top 8 kính áp tròng bị anti
nhiều trên TikTok", "Kể tên top 10 shop thời trang nam…"). The presenter, seated and talking to the lens,
guesses one name at a time, and the host confirms each one with its rank ("Có Mill Creek ạ, top 5 nha"). The
name pops up on the presenter's chest as they say it, and flies into its numbered slot on "top N". The board
fills up out of order. One slot is left empty at the end and gets a red **???**, which is the comment bait.

Measured from two videos of one channel (Vietnamese, 1080×1920, 60 fps):

| | ref-1 (lenses, 88 s) | ref-2 (fashion shops, 54 s) |
|---|---|---|
| slots / found | 8 / 7 + ??? | 10 / 9 + ??? |
| pace | ~248 words/min, an item every ~10 s (comments) | ~230 words/min, an item every ~5 s (no comments) |
| look | **gold**: yellow Montserrat names, white serif numbers, a product photo with most names | **aqua**: cyan Quicksand names, cream numbers, names only |
| cuts | 13 (≈ 9/min: jump cuts, a 3.4 s b-roll) | 2 |
| bed | ≈ 15 dB under the voice | ≈ 16 dB under |

The template defaults to **gold** (format.json `"theme"`). **aqua** is the lighter variant: no product photos,
a spin-in title, stickers. Pick one per video, never mix.

Reference pictures for every move below: `formats/ranking-products/ref-*/` (`sheets/`, `motion/` at 8 fps,
`micro/` at 60 fps for each signature move, `full/` for type and colours).

## 0. The koi's frame: as it is, or reformed (optional)

One seated, chest-up take, square to the lens, in a plain dark studio (a grey office chair behind). The face
sits at ≈ 29 % of the height. The chest and belly, from ≈ 55 % to 85 % of the height, are where the board
goes, so they stay clear of hands at rest. A plain, darkish top is best: yellow names and white numbers sit on
it. The template's shot is `shots/presenter.jpg`, a generated look, not a reference frame.

Ask once, before the first lipsync with this koi in this template. Run `vigen.mjs koi looks <koiDir>
--template ranking-products` first; a `ranking-products-presenter` look already made is offered as a third
choice. Then offer:

- **Use my photo as it is** (free): fine when it is a chest-up, square-to-camera frame with the chest showing.
  A tight headshot leaves no room for the board: say so and recommend the reform.
- **Reform it into the template's shot** (one standard image, ≈ 22 credits): `looks.json`, image-gen skill
  § 3, image 2 = `shots/presenter.jpg`. The top stays plain and darkish (looks.json says why).

## 0b. Two voices: the host confirms, the koi guesses

**Required** (`"voices": 2`). The host is heard, never seen: the challenge, every confirmation, the odd hint,
and "Còn top N thì sao ạ?" at the end. Its pitch sits clearly apart from the presenter's (≈ 250 Hz against
≈ 180 Hz in ref-1). During its lines the presenter listens: lips closed, smiling or laughing (ref-2's motion
sheets at 6–8 s).

- **The host** is a voice-only koi, as in verdict-board § 0b: a voice from Vigen's library or a clone, and it
  must sound clearly different from the koi's. Ask the user which voice hosts, once. Its lines are marked
  `Q:` in the script (the parts tool's mark for the other voice, whatever the line says).
- **Voicing**: `parts.mjs voice --koi <koiDir> --interviewer <hostDir> --q-pause 0.15 --turn-gap 0.15`. Use
  tight gaps: a confirmation follows the guess 0.1–0.3 s later (`item.guessToConfirm`), and the comment
  follows the confirmation at once. The host sits ≈ 1 dB under the koi.
- **Gestures**: on a guess, thinking (a hand to the chin, a finger raised, a squint up), then delighted on the
  confirmation (a laugh, a clap, a fist). Each host line is a **pinned listening chunk** with lips closed and
  still, `"detectDesync": false` and **no `textHint`** (verdict-board § 0b explains why). The eyes stay on the
  lens throughout.

## 0c. The presenter's acting: big, between every line

The references' presenter is never still (`ref-1/sheets/`, `ref-1/motion/`): his face and hands react to
every turn, the host's included. A take of nods and small smiles reads dead next to them (the first sample
was redone for it). In the gesture plan (vigen skill, `references/gestures.md`), give every chunk a beat
from this vocabulary, on its own words:

| moment | what he does |
|---|---|
| host reads the challenge | turns toward the host (off to the left), smirk with the lips pressed, back to the lens grinning |
| guessing | index finger taps the temple, hand rubs the chin, eyes roll up thinking, sly squint toward the host |
| host confirms "top N" | laughs with the head tipped back, fist pump or clap at chest height, proud grin, shoulder shimmy |
| comment | both hands frame or hold the thing, palm sweeps open toward the lens, thumbs-up, wink |
| a hint / waiting | arms fold across the chest, a slow knowing nod |
| unsure / sheepish | hand rubs the back of the neck or scratches the head |
| CTA | big shrug palms up, points at the lens, beckoning wave |

The frame is chest-up with the arms down: the hands rise into it from below, which renders well. Pair each
short guess with the host's confirmation in one pinned chunk (≈ 3 s), so a gesture has room to rise and land.
Prompt (the sample's `prompt.txt`): "cheeky, playful and very animated, with big expressions"; lips closed in a
smile or smirk when silent; eyes on the lens, glancing to the host when the host speaks; the face keeps
changing; head and shoulders never still; "The hands come up into the frame from below to gesture in front of
the chest and face, then drop back down out of the frame. A hand never covers the mouth." The board sits over
the chest, so gestures behind it are fine.

## 1. Layouts and camera

| what | measured | rule |
|---|---|---|
| presenter + board | ≈ 74 % (ref-1), 100 % (ref-2) | the default: the board `over` the shot, all video long after the hook |
| product card | ≈ 20 % (ref-1: 6 of 7 names) | a product photo on the chest while its name is guessed and confirmed (§ 2.4) |
| wide card | ≈ 2 % (ref-1: once) | a screenshot or listing that backs a comment ("feedback là…"): § 2.5 |
| full-frame b-roll | ≈ 4 % (ref-1: once, 3.4 s) | a real clip proving a comment (a lens bleeding dye on a cotton bud): shots `full`, hard cuts, the board hidden |
| camera | one take, jump cuts between framings | **a hard cut on the hook → board change**, then one wide ↔ punch (1.1×) cut at the start of most comments (ref-1 ≈ 9/min; ref-2, without comments, 2 in 54 s). Never a slow zoom |
| flashes, transitions | none | none; everything moves *inside* the shot (§ 2) |

Shots: `camera` alternating `{ "t", "to": "punch" | "wide", "move": "cut" }`; the board and the hook as
`over` panels; product photos, wide cards and b-roll as below.

## 2. The moves, measured at 60 fps (copy them 1:1)

Every time is from the reference's own clock. The `micro/` strips show each move frame by frame.

### 2.1 Cover and hook title: captions (`micro/01-title.jpg`)

- **Cover**: frames 0–0.05 s are the finished hook (the title, with ref-2's stickers), a thumbnail frame.
  Then a hard cut to the clean shot and the title comes in again.
- **The title** is the challenge, word for word as the host reads it, in **Bangers** (uppercase, condensed
  comic), two lines, tilted −3°, centred, its first line's top at 0.56 H (y ≈ 1075). It covers the chest,
  not the face.
  - gold: yellow `#FFF22E` letters with a thin black ring, each line on its own sharp-cornered blue box
    `#1F8FE8` (≈ 96 px). Entrance **`slam`**: from ≈ 3.2× and half see-through to its size in 0.17 s (lands
    at 0.2 s).
  - aqua: white letters, a black ring and a soft yellow glow `#FFE600`, no box (≈ 86 px). Entrance **`spin`**:
    from ≈ 68° off, overshooting ≈ 10° past its tilt, settled in 0.24 s.
- It holds until the hard cut that brings the board in (3.0 s in ref-1, 3.5 s in ref-2). That cut comes just
  after the host's challenge, as the presenter starts the first guess.
- Made by **captions**: one group `{ "start": 0.05, "end": <cut>, "top": 0.56, "rotate": -3, "entrance":
  "slam", "lines": [ {"text": "TOP 8 KÍNH ÁP TRÒNG", "style": "t"}, {"text": "BỊ ANTI NHIỀU TRÊN TIKTOK",
  "style": "t", "at": 0.05} ], "burst": "puff", "sparkles": true }`. Add the same group, without marks, from 0 to
  0.05 with `"entrance": "cut"` for the cover.
  Aqua: `format.json` → `captions.themes.aqua` for the `t` style and the group.

### 2.2 The hook's marks and stickers (`micro/01-title.jpg`, `ref-2/micro/05-stickers.jpg`)

Drawn by **captions** on the title group, above the title like in the references (a card under the captions
layer would sit beneath the words):

- gold: `"burst": "puff", "sparkles": true`. As the title lands (+0.17 s), a white comic cloud with thin
  grey outlines bursts from its middle out to both ends in 0.05 s. It breaks into outlined arcs at the ends
  and white dots that drift off, gone by +0.55 s. From +0.6 s, two yellow four-point sparkle pairs twinkle at
  the title's top-left and bottom-right corners until the cut.
- aqua: `"burst": "splash"`. White droplets fly in at +0.02 s, then three thick white brush arcs sweep round the
  spinning title and spray off by +0.33 s.
- **Stickers** (aqua): small topic illustrations pop in under the title on their words (ref-2: a walking man
  at 0.85 s, autumn leaves at 2.25 s). Each is a shots `over` panel `{ "src": "assets/media/<id>.png", "rect":
  { "x", "y", "w", "h" }, "in": "pop", "out": "cut" }` lasting to the cut, plus one from 0 to 0.05 for the cover.
  Use a transparent PNG/SVG illustration from stock-media or one flat emoji set (Iconify Fluent Emoji Flat,
  MIT), never a photo.

### 2.3 The board: `cards/board.html` (`micro/02-list-in.jpg`, `full/f-82.0.jpg`, `ref-2/full/f-50.0.jpg`)

Two columns of numbers on the chest. The left one holds 1…⌈N/2⌉, the right the rest (`SLOTS` = N). The list
appears on the hook's cut (`BOARD_IN`).

| | gold (8 slots) | aqua (10 slots) |
|---|---|---|
| rows (centre y) | 1135, 1287, 1439, 1591 (step 152) | 1125 … 1565 (step 110) |
| numbers | Playfair Display 900, 60 px, white, dark ring; x 125 / 615 | Quicksand 700, 54 px, cream `#F8F29A`, dark ring; x 122 / 597 |
| names | Montserrat 900, 66 px, `#FFE81A`, 4 px maroon ring `#3A0808` + a dropped shadow; centred x 360 / 852, wrapping to two lines past ≈ 380 px ("Huỳnh Anh / lens") | Quicksand 700, 62 px, `#7FF6EF`, 4 px navy ring `#0C2340`; centred x 335 / 822 |
| list entrance | row by row, both columns together, **0.083 s apart**; each number lands yellow at 1.25× and turns white at size 0.05 s later; yellow twinkles scatter round them (0.3 s in all) | all at once, from a sliver to size in 0.1 s with a small overshoot |

Another list length keeps the theme's spacing around the same middle (the card does it).

### 2.4 One guess: pop → (product photo) → flight (`micro/03-card-pop.jpg`, `04-card-out-fly.jpg`, `05-name-pop-nocard.jpg`, `ref-2/micro/03-name-pop.jpg`, `04-fly.jpg`)

1. **Pop** (`in`), as the presenter starts saying the name. Centred at x 540, 110 px above the first row
   (y ≈ 1025 gold, 1015 aqua).
   - gold: flares up wide-spaced (0.45 em), blurred and bright in a yellow glow, tightening in 0.15 s; the glow
     is gone at 0.26 s.
   - aqua: squashed flat, springs to size with two overshoots (≈ 0.4 s, elastic).
2. **Product photo** (gold, `card: true`, most names in ref-1): the board cuts out and the name sits higher
   (y 955). A **square product shot** 576×576 at (252, 1060) flashes on from white (0.35 s). Behind it, the
   take itself, blurred, fills a soft-edged box 190 px wider each side and 65 px taller: frosted glass, with
   the presenter's body blurred and the face sharp. Made by **shots**: an `over` panel
   `{ "src": "assets/media/<id>.jpg", "start": <in>, "end": <fly + 0.03>, "layout": "over", "rect": { "x": 252,
   "y": 1060, "w": 576, "h": 576, "r": 0 }, "in": "white", "out": "cut", "blur": true }` (format.json
   `productCard`). The picture is the product, in this order: the user's own photo (for "what we use"
   topics, a photo of the real thing); the brand's **press kit** (stock-media card with `"press"`: the
   brand's own newsroom page, editorial use, so fine for a ranking, never for a video marked `"sponsored"`);
   licensed stock. Pick the product shot itself, not a credited photographer's sample photo. Never a frame
   from a brand ad.
3. **Flight** (`fly`), on the host's "top N". At the same frame the photo cuts out and the board cuts back.
   The name flies straight to its slot at the same size, in **0.15 s** (gold) or **0.18 s** (aqua),
   power2.inOut. The next guess pops 2–10 s later, after the comment.

### 2.5 Evidence on a comment (gold, optional)

- **Wide card** (`micro/07-wide-card.jpg`): a screenshot backing a claim (the shop's map listing with its
  rating and photos). It lands from the right, tilted 9° and slightly large, then swings past level and
  settles in 0.26 s. It sits at (34, 1135) 1012×418 on the same frosted blur (pad 190×120). Made by
  **shots**: `over` panel, `"in": "swing"`, `"blur": { "pad": [190, 120] }` (format.json `wideCard`). The
  screenshot is the user's own, or a page grabbed with the **ui-demo** skill's reference screenshot. It is
  never drawn or generated.
- **Full-frame b-roll** (ref-1 16.8–20.2 s): a real clip of the thing the comment describes, hard cut in and
  out, the board hidden under it. Made by **stock-media** + shots `full`. Use at most once a video. For a
  named product, a reviewer's own footage from YouTube's Creative Commons videos (searched with every card:
  the phone in hand, the colours side by side) beats generic stock; a clean 3–6 s section, no burned-in text.

### 2.6 The end (`micro/08-qqq.jpg`, `09-end.jpg`)

- **???** in the empty slot, popping like a name (`MYSTERY.at`) as the host asks "Còn top N thì sao ạ?" (or
  the presenter wonders "Có top 8 hay sao nhỉ?"). gold: white letters with a thick red `#E3122E` ring and a red
  glow. aqua: red letters, a white ring.
- The presenter's CTA: "Mọi người còn biết … nào không? Comment cho tôi biết nhé!"
- gold: every overlay is off for the last 0.1 s (`CLEAR`). aqua keeps the board to the end.

## 3. Words on screen

**No subtitles** in either reference, and no keyword pop-ups. The words on screen are the title (§ 2.1), the
names (§ 2.4) and the ???. Don't run `subtitles.mjs`: write captions.json by hand (the cover and title
groups only).

## 4. The script

- **Topic**: a category with many brands, shops, places or products people argue about ("kính áp tròng bị
  anti", "shop thời trang nam", "app học tiếng Anh", "quán cà phê ở Đà Lạt"). The ranks must be honest (a
  real list, a poll, or the user's own ranking).
- **Hook** (host, `Q:`): the challenge exactly as the title shows it, 2.5–3.5 s.
- **Each item**, always this order, ranks out of order:
  1. **Guess** (presenter, 1.5–3 s): "Chắc là có X nhỉ?", "Không biết là có X không nhỉ?", "Mà tôi nghĩ sẽ có
     cả X", "Một brand mà mình cũng khá là thích là X". Vary the wording.
  2. **Confirm** (host, `Q:`, ≈ 1.5 s): "Có X ạ, top N nha." Nothing else in the line; the board's flight
     lands on "top N".
  3. **Comment** (presenter, 0–8 s, gold): why it's on the list, or their own experience ("Cái này nha, đeo
     hơn 1 tiếng thôi nhưng mà khô mắt kinh khủng luôn"). aqua skips it: the next guess comes at once.
  - Now and then the host gives a hint before a guess ("Q: Em có gợi ý một cái shop ở khu Xuân Thủy ạ?").
- **The end**: one slot never guessed. `Q: Còn top N thì sao ạ?`, then the presenter's CTA.
- 6–10 slots, 50–90 s. Write the brand names as they are spelled (the board shows them), and keep a line
  break per turn so any line can be retaken alone.

```text
Q: Top 6 hãng điện thoại cả team đang dùng nhiều nhất!
Chắc chắn phải có Samsung nhỉ?
Q: Có Samsung ạ, top 2 nha.
Màn hình đẹp, pin trâu, ai cũng có một chiếc.
Không biết là có iPhone không nhỉ?
Q: Có iPhone ạ, top 1 nha.
…
Q: Còn top 6 thì sao ạ?
Top 6 thì chịu luôn. Mọi người đoán thử, comment cho tôi biết nhé!
```

## 5. Sound

- The two voices within ≈ 1 dB of each other.
- A light music bed ≈ 16 dB under the voice (dissect's upper bound read 15–16 dB on both references).
- gold: a soft sparkle on each name pop and product flash (ref-1 has a 15–20 dB jump in the 7 kHz+ band right
  on every pop). aqua: silent pops. Nothing on the flights. Pick the file by ear with the user (sound skill:
  `accents`, one file, one level, all pops or none).

## 6. Make it (section B of the skill, on this template)

1. Copy the fonts: `cp formats/ranking-products/fonts/*.ttf videos/<slug>/assets/fonts/`.
2. Card: copy `cards/board.html` into the project's `cards/`. Set the theme and the slots, then every `in` /
   `fly` from transcript.json:
   - `in`: the guess's name word starts.
   - `fly`: the host's "top" word starts.
   - `BOARD_IN`: the cut.
   - `MYSTERY.at`: the host's "top" in the last question.

   cards.json: `{ "cards": [ { "id": "board", "kind": "html", "file": "cards/board.html", "start": 0, "end":
   <length>, "bg": "transparent" } ] }`.
3. shots.json: `board` as an `over` panel (same times), the product photos, wide cards and stickers
   (§ 2.2, 2.4–2.5), and the camera cuts (§ 1).
4. captions.json: the cover and title groups with their marks (§ 2.1–2.2).
5. sound.json: the bed at `below: 16`, plus the pop accents once the user has picked one.

## 7. Numbers to hit (dissect + compare on the render)

- 2–10 cuts a minute; no flashes; presenter on screen ≥ 90 % (product and wide cards are `over` layers).
- Bed 12–18 dB under the voice (upper bound).
- By eye on the motion sheets (`--motion-fps 8`, and 60 fps strips around each pop and flight):
  - the cover frame, then the slam (or spin) and the puff (or splash);
  - the list landing row by row;
  - each name glowing in on its word, the photo flashing on over the frosted blur, and the flight landing on
    "top N";
  - the ??? and the clean last frames.

Proof (§ A.6 of the skill): the example on vigen.io/templates#ranking-products (smartphone brands, 35 s, two
voices, gold, 5 names + ???), approved 2026-11-19. Notes from it:
- Product photos: 4K frames from reviewers' YouTube Creative Commons videos (stock-media `--still`) and one
  CC BY Commons photo, credited. A video for the brand itself or for Vigen is `"sponsored": true`: no press-kit
  images.
- Acting (§ 0c): the first take, planned with head beats only, read dead next to the references; the redo with
  hand gestures from the vocabulary above was the one kept.
- Reaction sounds: where the presenter laughs or reacts while the host talks, a short sound in the koi's own
  voice (Vigen TTS of "Hì hì", "Hê hê", "Ha ha ha" where the mouth is open in a grin; "Hm hm", "Mmm", "Hừm…"
  where it is closed: nothing that needs the lips to move), as sound.json `clips` at 0.75–0.85. The sound
  catalog has no human reactions.
- Checks: camera cuts are invisible to dissect (a 1.1 punch on a still presenter); cuts/min reads high because
  each product photo's white flash counts (13.6 for 5 names in 35 s, against the references' 7 in 85 s). The
  bed read 18.5 dB under the TTS voices at `below: 16`: `below: 15` read 18.0.
