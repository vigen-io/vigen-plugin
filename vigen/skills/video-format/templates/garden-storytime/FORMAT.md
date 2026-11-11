# Format: garden-storytime

A calm, personal story told outdoors: the presenter lies in the grass and talks up to the camera, confesses a
problem, names a simple framework ("four pillars"), explains it sitting in a garden while white hand-drawn
marks build the idea on top of the shot, lands the payoff, names the thing (a product, a method) in a big serif
title, and signs off in a low-angle close-up against the sky. No b-roll at all: every shot is the presenter,
in five camera setups, with drawings over them. Measured from two reference videos of the same story grammar
(49.8 s and 50.1 s; 8–12 cuts; median shot 3.7–5.7 s; no flashes; 150–215 words/min). The second reference is
the first rebuilt with a different, generated presenter in the same setups: that is exactly how a koi makes
this template.

## 0. The koi's looks (once per koi)

The koi is filmed in the template's setups, each from a **look** (an avatar of the same person in another set
and pose). **Make four: `overhead`, `overhead-b`, `wide`, `low`** (four is the cap). The fifth setup is a reframing in
the edit (`looks.json` → `reframes`): `medium` = `wide` at `tight` 1.3. The opening lying scene runs long, so
it cuts between the two lying looks (`overhead` for the hook, `overhead-b` from the next sentence end).

1. Already made? `vigen.mjs koi looks <koiDir> --template garden-storytime`: the looks saved as
   `garden-storytime-<look>`, and the koi's avatars for this template on the account (`onAccount`, brought in free
   with `koi add-look … --avatar <id>`). Show them and offer them first: they serve every video in this template.
   Generate only the missing ones, or the ones the user turns down.
2. For the rest, with the **image-gen** skill (its § 3 formula): say how to pay (Vigen credits or their own Gemini
   key) and the cost (4 standard images at 1K ≈ 88 credits on Vigen, plus any retakes), and get a yes. The
   koi wears their own clothes from their photo (`{{outfit}}`, image-gen § 3), finished with plain trousers or
   jeans for the full-length lying and seated looks, the same in all four; the shots' lilac knit and light
   jeans only if the user asks for them. Real photos of the user lying on a lawn and sitting in a garden make
   better looks for free: use them instead.
3. For each look: `imagegen.mjs generate` with `--ref <a crop of the koi's head> --ref <template>/shots/<look>.jpg`, the
   `looks.json` `prompt` with that look's `hair` line (its `{{length}}` filled with the koi's own hair, said outright against the shot's) and the koi's `{{outfit}}`, Flash, 1K, 9:16. The three can run at once. The shot
   carries the angle, distance, pose, set and colour: no colour words, no LUT, no rotating or cropping after.
4. Show the three next to their shots before saving: the koi's own face, hair and clothes (not the shot's person), the
   shot's framing and colour, lips closed with no teeth showing (a broad smile is a retake: the lipsync pulls
   the frame's expression back every few seconds), no stray limbs or second person.
5. `vigen.mjs koi add-look <koiDir> --template garden-storytime --look <name> --frame <file>` for each, one after
   another: saved as `garden-storytime-<name>`.

## 1. Setups: five, cut between hard

Every cut is a hard cut that changes the setup (or, rarely, a punch-in on the same one). The motion is in the
drawings and the hands, never in the camera. In order:

| look | the shot | share | carries |
|---|---|---|---|
| `overhead` | from directly above, lying on the lawn among apples, phone at the chin, body diagonal | 30–45 % | the hook and the problem |
| `overhead-b` | the same lawn, body straight, a little closer | 10–15 % | the cut inside the hook (≈ 6–8 s in), the realisation and the framework reveal |
| `wide` | sitting cross-legged on a patio by a wooden fence, small in the frame, room above | 25–35 % | the parts of the framework explained one by one; the product |
| `medium` | the same set, knees up, holding an apple (with three looks: `wide` at `tight` 1.3) | 10–12 % | the payoff ("together they…") |
| `low` | low-angle close-up against apple branches and a pastel sky | ≈ 9 % (4–5 s) | the last sentence only |

Each setup is one lipsync **part**: split the script with `---` at every setup change, and only at the end of
a sentence (never mid-sentence: every cut lands in a pause, after the 0.4 s each part's voice ends on) and write
`<parts dir>/looks.json` (`{ "1": "garden-storytime-overhead", "2": "garden-storytime-overhead", … }`, a
reframe filmed from its look) before `parts.mjs run` (vigen skill
§ 5). The seams then fall on the cuts (use the seams `parts.mjs` reports; time cards, captions and cuts
from them). Two parts in a row on the same look get a framing change at their seam (wide → punch → wide), or
the pose jump shows. A part longer than ~9 s gets one punch-in cut (`punch` 1.15) on its most emphatic
sentence, as the references' brief closer inserts; never a slow zoom.

Look at every part before the edit (a contact sheet, 2 frames a second). Once, on a part ending in a list of
one-word names, the lipsync model painted those words into the lawn as garbled text: re-roll that part on a
new seed (same audio and gestures).

## 2. Drawings over the shot

White hand-drawn marks on a transparent layer over the presenter (shots layout `over`, starter cards in
`cards/`, copied into the project's `cards/` and placed as viz-cards `html` with `"bg": "transparent"`). They
draw themselves on in 0.2–0.5 s on the word they belong to, stay while the idea is in play, and go at the cut.
At most one card on screen at a time; together they cover ≈ 40–50 % of the runtime.

| card | when | what it does |
|---|---|---|
| `pillars` | the framework is named, on `overhead-b` | four nodes join into a square ("a structure"), a hand-lettered "4 Pillars", then one sketchy box per part popping in on its name |
| `loop` | each part explained, on `wide` | each part's name circled where it's said, one scribble line weaving on from circle to circle around the presenter |
| `rings` | the payoff word, on `medium` | ripple rings drawn outward around the presenter, 1.5–2.5 s, once per video. Placed **behind** the presenter (shots layout `behind`, `rect` `{x:0,y:0,w:1080,h:1920}`): the cutout sits in front, so the rings ripple around them and never cross the face, at any framing |
| `me` | the speaker turns to themselves or the product, on `wide` | a stick figure with an arrow and a hand-lettered label |
| `title` | the product / method is named, on `wide` | a big lowercase serif title with a full stop, top left, its tagline typed word by word |

The framework's part names are the same words in `pillars` and `loop`. Two to four parts; the script decides.
One-word names: raise the label size in both cards (46/42 px → 64 px). Nothing is ever drawn over the face or
the mouth: snapshot every card on the actual look (a generated look puts the head somewhere else than the
references) and move a label with its shape if it lands on the face.

## 3. Words on screen

Three kinds, each in its own zone (write captions.json by hand from transcript.json; `subtitles.mjs` can
draft the middle zone first):

- **The hook (0 → ≈ 7 s, `overhead`):** big words at the top (`hookTop` 0.16: the platform's top bar covers
  anything higher), one to three at a time,
  white heavy sans (`w` with `size` 104), cut in on their word. The emotional words of the hook come in
  hand-lettered and hollow (`h`), on their own line under the sans line, sometimes alone (the noun
  or verb that carries the feeling). About one hand-lettered word every 1–2 s in the hook.
- **Subtitles (the rest):** small (`w` 40 px, ExtraBold, white, soft shadow), one or two words at a time
  (chunk 2 words / 16 characters), the script's own words, cut on each, sitting at the look's `subTop`:
  the chest on the lying looks (0.70, below the phone and the hands), the lap on `wide`. None under the
  `title` card's typed tagline (it is the same words). On screen ≥ 90 % of the speech outside the hook and the
  sign-off.
- **The sign-off (`low`):** one word at a time in the accent colour (deep burgundy `#8E1B2E`, `b` with no
  outline, ≈ 92 px, a soft white `glow`), each replacing the last (`words` group), where burgundy reads: on the
  light denim of the low look (`subTop` 0.82). Never over the hair: dark hair swallows it.

Titles in the quick-take sense (big uppercase headlines) are not used; the `title` card is the only title.

## 4. Look and colour

Bright, soft, hazy daylight with lifted shadows and low contrast; a fresh green lawn leaning yellow; warm
skin; pastel pink sky in the low shot; red and green apples as the only props besides the phone. Wardrobe: the
koi's own clothes (§ 0), plain, no logos, no text; the shots' soft pastels and light denim only on request.
The rest comes from
the looks' shots (§ 0): never re-describe it in a prompt or grade it afterwards. Drawings and words in white; one accent, the burgundy of the sign-off. Fonts:
Be Vietnam Pro (sans), Patrick Hand (hand-lettered), Playfair Display (the serif title), all with
Vietnamese. Copy `formats/garden-storytime/fonts/*.ttf` into the project's `assets/fonts/` at the start (the
captions run also copies the ones it uses). 9:16.

## 5. Sound

- A soft music bed (acoustic, lo-fi, light piano), ≈ 11 dB under the voice (the references sit 7–11 dB under;
  lean quiet).
- A soft accent on drawings appearing: one quiet single-hit tick per drawn element of a card (each box, each
  circled name, the title), the same file and level for every item, never on subtitles. The catalog's `tick`
  role also returns triple knocks ("Three wood knocks"): pin one single-hit file with `src` on every accent
  (e.g. the pool's "Hollow clack", `gain` −9). Nothing on the cuts (no whooshes: every cut is hard), no
  risers, no flashes.

## 6. Structure (≈ 45–55 s; English ≈ 150–215 words/min, Vietnamese ≈ 750–900 characters)

1. **Hook, 0–7 s (`overhead`):** a confession in the first person ("Everyone online had a secret to sell me…",
   "The harder I tried, the less I felt like myself…"), big top words with hand-lettered accents.
2. **The problem, 7–15 s (`overhead-b` from the cut):** what it cost them, small subtitles.
3. **The realisation and the framework, ≈ 15–22 s:** "then it clicked… so now I keep it to four pillars:
   A, B, C and D" with the `pillars` card.
4. **Each part in one line, ≈ 22–33 s (`wide`):** "A: …, B: …" with the `loop` card.
5. **The payoff, ≈ 33–39 s (`medium`):** "together, …" with `rings` on its strongest word.
6. **The thing, ≈ 39–46 s (`wide`):** "so I put all four in one…" with `me`, then the `title` card on its
   name, the tagline typed as it is said.
7. **Sign-off, last 4–5 s (`low`):** one short sentence that turns the hook around ("It was never a secret.
   It was the habit."), burgundy word by word.

Write the script to this shape in the user's language and show it before anything costs credits.

- **Size it to the koi's voice.** Cloned voices differ in pace: one spoke 22 Vietnamese characters a second
  (not 17), so 723 characters ran 33 s. Before writing the full script, voice one sentence (`vigen.mjs tts`,
  pennies) and scale the character count to its pace.
- **The framework's names, said in a row** ("A, B, C, D") come out of TTS ≈ 0.15 s apart, even written with
  full stops, too fast for one box per name. Open 0.2–0.25 s of silence between them in that part's audio
  (cut at the silences between the words, `ffmpeg` `atrim` + `anullsrc` + `concat`) before its lipsync; the
  lipsync then follows the spaced audio.

## 7. Numbers to hit (check with dissect on the render)

- 8–16 cuts a minute; median shot 3.5–6 s; no shot over ~9.5 s.
- No white flashes.
- Music 9–14 dB under the voice.
- Subtitles (or hook words) on screen for ≥ 90 % of the speech.
