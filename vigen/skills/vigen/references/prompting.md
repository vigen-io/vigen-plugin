# Prompting the lipsync model: the speaker's steady style

Every lipsync video is rendered by Vigen's lipsync model from one photo and one
audio track. A prompt tells it how the person moves while talking. Without
one, the default prompt below is used. It works on any photo and any script,
but because it's generic it can't know that this script is a product pitch,
a list of steps, or bad news.

The prompt carries what's true for the whole video: the tone, how the face
reacts, how the head moves, the rest pose and the safety lines. It doesn't
decide gestures. Which phrase gets which movement is your judgement, made
phrase by phrase in [gestures.md](gestures.md) and sent as timed
instructions on those words. The model then carries out the movement you describe
and doesn't have to work out what the words mean. To vary the tone across
the script (a serious stretch, a lighter one), see [directing.md](directing.md).

Writing the prompt is your judgement call too. The findings below say what
has worked, and the tables are starting points.

Each point below says how solid it is:
- **[tested]**: measured on test renders, across 3 portraits with different framings.
- **[Vigen docs]**: stated in Vigen's engine documentation.
- **[untested]**: reasoning that still needs proof. Treat it as a suggestion.

## How the prompt is used

- **[Vigen docs] Rendered in chunks.** The audio is cut at pauses into chunks
  of up to 10 seconds, and the prompt is filled in once per chunk:
  - `{{text}}` = the words spoken in that chunk (required);
  - `{{language}}` = the language's English name, e.g. `Vietnamese`.

  So one template has to suit every chunk, and it can't know what a chunk's
  words mean. Anything tied to particular words, such as a gesture or a
  look, goes in a timed instruction ([gestures.md](gestures.md)), not in
  the prompt.
- **[Vigen docs] The photo is pinned.** The photo's exact pose comes back at
  the start and end of every chunk, and every 2.5–5 seconds at quiet
  moments. The prompt only shapes the motion between those pins.
- **[tested] The photo matters more than the prompt.** A hand frozen
  mid-gesture in the photo stayed frozen under every prompt. A rest pose with
  hands relaxed and visible, mouth closed or relaxed, does more than any
  wording. If the photo is the problem, say so; don't try to prompt around it.
- **[Vigen docs] Format rules:**
  - `{{text}}` at least once, in quotes, near the start. Words buried late in
    a long prompt can leave the lips closed.
  - Only `{{text}}` and `{{language}}`; anything else in double braces is
    rejected (`INVALID_PROMPT`).
  - At most 6000 characters.
  - Keep the camera locked and the background and framing as in the photo.
- **[Vigen docs] Handled for you; don't prompt for these:** voice isolation,
  transcription, and the checks that re-render chunks with flicker, lip
  desync or visual glitches.

## What works

1. **[tested] Name concrete actions. Hedges freeze the model.**
   - "Mostly small movements, sometimes no gesture" made all three portraits
     stiffer than the default, with 25–55% less hand motion.
   - Listing specific gestures brought motion back and made it more varied:
     palm turning up, counting on fingers, touching the chest, a chopping
     beat on emphasis, a shrug.
   - Avoid *mostly, sometimes, maybe, subtle, minimal, occasionally, a bit*.
     Even for a calm video, name calm actions ("a slow nod", "hands rest
     together") instead of asking for less movement.
2. **[tested] Tie expressions to meaning, not adjectives.** "Expressive"
   barely did anything. Cause-and-effect cues did: "a question gets raised
   brows and a curious head tilt", "a serious point gets a slight frown and a
   lean in". These gave visibly more brow and eye movement.
3. **[tested] The model has an attention budget.** Adding emotion cues cut
   hand motion on one portrait (5.5 → 3.8). Every block you add takes from
   the others, so pick what matters for this video:
   - about 4–6 gestures;
   - 2–3 expression cues;
   - one tone line.

   If the photo shows no hands, drop the hand block entirely and spend the
   budget on face and head.
4. **[tested] "Don't" lines don't work.** "No text, captions or graphics"
   didn't stop captions, and naming the unwanted thing may even prime it.
   Don't add new "no X" lines for artifacts. The exception is the three hand
   lines below, which did hold.
5. **[tested] Captions or glitches in one stretch come from that chunk's words
   plus the seed, not the prompt.** The default template drew the same
   subtitle on the same 30–37s chunk every time. With the same seed (the
   default is 42), re-rendering reproduces it. Change the seed
   (`--seed`, or `seed` in a plan) to get a different take; keep the prompt
   unchanged so the takes compare.

## Rules that keep a prompt safe on any photo [tested]

- Never describe the person, clothing or setting; the photo already shows them.
- Say "a visible hand", not "both hands", so the model doesn't invent an
  off-frame hand.
- Keep these three lines when hands are visible:
  - "anything held stays held";
  - "the hands stay inside the frame and never cover the mouth";
  - "no hand appears that was not in the first frame".
- One prompt worked across all three framings. A prompt fitted to one photo
  is unlikely to beat a better photo.

## The default prompt (the baseline to adapt)

This is what lipsync uses when no prompt is given. It already follows every
rule above. **[tested]** It's the "concrete gestures" version. Its hand line
gives the model a menu of gestures to choose from by itself. That's what a video
gets when nobody directs it. When you plan the gestures, the hand line
changes (below).

```text
A real person talking to the camera in {{language}}, lively and expressive, in a live video, not a still image, saying: "{{text}}"
The lips, jaw and tongue shape every syllable in sync with the voice, and the mouth never freezes while words are spoken. The face reacts to the meaning: eyebrows lift, eyes widen or narrow, quick smiles, natural blinks, and the eyes keep coming back to the lens.
The head is never still while talking: nods on stressed words, tilts, small turns, a lean toward the camera on key points, with the neck and shoulders moving along.
The hands talk too. On almost every phrase a visible hand leaves its resting position and makes a gesture that fits the words: an open palm turning up, counting on the fingers, a light touch to the chest when talking about themselves, a small chopping beat on an emphasized word, a loose sweep to the side, a small shrug. Each gesture is fluid and different in size and shape from the last, and the hand relaxes before the next one. Anything held stays held, the hands stay inside the frame and never cover the mouth, and no hand appears that was not in the first frame.
The camera is locked; the background, lighting and clothing stay as in the first frame. In pauses the body settles back into the first frame's pose.
```

## Writing a prompt for a video

A shape that has worked is the default's six lines, changing only what the
script calls for:

1. **Speaker line (keep):** `A real person talking to the camera in {{language}}, <tone>, in a live video, not a still image, saying: "{{text}}"`. Put the tone here, 2–4 concrete words.
2. **Mouth line (keep as is):** the lips must keep moving on every syllable.
3. **Face:** 2–3 cause-and-effect cues that match the script. A smile is
   safe here, as a passing reaction next to the mouth line. A timed or pinned
   instruction never sets the mouth ([gestures.md](gestures.md), section 6).
4. **Head:** nods, tilts, leans, tuned to the tone.
5. **Hands: nothing, when the gestures are pinned.** Vigen adds each pinned
   instruction on its own line after your template, and says to keep gesture
   wording that would contradict it out of the template. **[tested once]**
   A line asking the hands to rest, on top of 1 s pinned chunks, left them
   on the desk through nearly a whole video. So no gesture menu, no rest pose
   and no "on a question, the palm turns up" rules: you decide the movements in
   [gestures.md](gestures.md) and send them as pinned chunks.
6. **Camera line (keep):** camera locked, background and clothing as in the first frame. Leave out "in pauses the body settles back": it is a gesture line too.

Aim for roughly 500–1000 characters. Longer only dilutes the budget.

**When you send a `transcript`,** `{{language}}` comes back empty: write the
language in the speaker line (`talking to the camera in Vietnamese`).

### Read the script first

If the video is from text, read the text. If it's from audio, transcribe it
first (`vigen.mjs transcribe <file>`) so you know what's said. Then choose:

**Tone line by genre** [untested, but built from the tested rules]:

| script | tone words | face cues | head |
|---|---|---|---|
| promo / sales | energetic, warm, confident | a benefit gets a bright smile and widened eyes; a price or offer gets raised brows | quick nods, a lean in on the offer |
| tutorial / explainer | clear, patient, friendly | a new step gets a small nod and a focused look; a warning gets a slight frown | steady small nods, a tilt on tips |
| storytelling | warm, lively | surprise gets wide eyes and raised brows; a sad moment gets softened eyes and a slower blink | turns as if remembering, a lean in at the climax |
| news / announcement | calm, serious, composed | a serious point gets a slight frown and a lean in; good news gets a brief smile | measured nods on key facts |
| comedy / casual | playful, animated | a joke gets a grin and lifted brows; irony gets one raised brow and a smirk | bigger tilts, a quick head shake |
| apology / sensitive | gentle, sincere | an apology gets softened eyes and a small nod; thanks gets a warm smile | slow nods, a slight lean in |

The face cues in this table are general reactions that suit any chunk.
A look tied to one phrase (a glance up at what's shown, a grin on the
punchline) belongs with that phrase's gesture in [gestures.md](gestures.md).

**Gestures** aren't chosen here. Plan them phrase by phrase in
[gestures.md](gestures.md): what each phrase does in context, the movement
for it, and when it lands.

### Read the photo

Look at the koi's `frame.*`:
- **No hands visible** (tight head-and-shoulders): no hand line at all. Use
  the freed budget for one more face cue and livelier head motion.
- **One hand visible:** "a visible hand", and the gesture plan uses that hand.
- **Something held** (a microphone, a product): keep "anything held stays
  held"; the gesture plan uses the free hand.
- **Hand frozen mid-gesture, or mouth open wide:** no prompt fixes it. Suggest
  a new photo (`koi set-avatar <koiDir> --frame <photo>`).

### A koi's personality

If a person always presents the same way, save their prompt as
`vigen-koi/<slug>/prompt.txt`. `lipsync` then uses it whenever no prompt is
passed. Still adapt it per video when the script's genre changes (a promo
person reading an apology).

## Before sending: checklist

- [ ] `{{text}}` in quotes in the first line; no variables other than `{{text}}` / `{{language}}`
- [ ] nothing about the person, clothing or setting
- [ ] concrete actions only; no *mostly / sometimes / subtle / minimal*
- [ ] face cues are "X gets Y", tied to meaning
- [ ] no hand wording at all: no menu, no rest pose, no "when the words are X, do Y"; the gestures are in pinned chunks
- [ ] camera locked; no "settle back in pauses" line
- [ ] the language written out if you send a transcript
- [ ] no new "no X" lines; under about 1000 characters

## Iterating

- `koi.json` records the prompt used for each video (`videos[].prompt`).
  Compare takes before changing several things at once.
- **Not enough motion:** remove hedges and replace adjectives with named
  actions. For the hands, add gestures or beats to the plan
  ([gestures.md](gestures.md)) rather than a menu to the prompt.
- **Motion fine but the face is flat:** add a face cue here, or drop a
  gesture from a crowded chunk (it's the attention budget).
- **A gesture landed on the wrong words, or didn't happen:** that's the
  gesture plan, not the prompt ([gestures.md](gestures.md), "Iterating").
- **A glitch or caption in one stretch:** it comes from that chunk's words
  and the seed. Re-run with a different `--seed`; don't add a "no captions"
  line.
- **One part feels wrong while the rest is fine:** that's a job for a
  segment direction ([directing.md](directing.md)), not for the prompt.

## Examples

Each of these goes with a gesture plan sent as timed instructions
([gestures.md](gestures.md)).

**Promo, Vietnamese, waist-up with hands:**

```text
A real person talking to the camera in {{language}}, energetic, warm and confident, in a live video, not a still image, saying: "{{text}}"
The lips, jaw and tongue shape every syllable in sync with the voice, and the mouth never freezes while words are spoken. A benefit gets a bright smile and widened eyes, a price or an offer gets raised brows, and the eyes keep coming back to the lens with natural blinks.
The head is never still while talking: quick nods on stressed words, small tilts, and a lean toward the camera on the offer.
The camera is locked; the background, lighting and clothing stay as in the first frame. In pauses the body settles back into the first frame's pose.
```

**Tutorial, tight head-and-shoulders (no hands visible):**

```text
A real person talking to the camera in {{language}}, clear, patient and friendly, in a live video, not a still image, saying: "{{text}}"
The lips, jaw and tongue shape every syllable in sync with the voice, and the mouth never freezes while words are spoken. A new step gets a small nod and a focused look, a tip gets a quick smile and lifted brows, a warning gets a slight frown, and the eyes keep coming back to the lens with natural blinks.
The head is never still while talking: steady nods on each step, a tilt on tips, small turns between ideas, with the neck and shoulders moving along.
The camera is locked; the background, lighting and clothing stay as in the first frame. In pauses the body settles back into the first frame's pose.
```

**Serious announcement, one hand visible:**

```text
A real person talking to the camera in {{language}}, calm, serious and composed, in a live video, not a still image, saying: "{{text}}"
The lips, jaw and tongue shape every syllable in sync with the voice, and the mouth never freezes while words are spoken. A serious point gets a slight frown and a lean in, good news gets a brief warm smile, and the eyes stay on the lens with slow natural blinks.
The head moves with the words: measured nods on key facts, a slow tilt on a question, with the neck and shoulders moving along.
The camera is locked; the background, lighting and clothing stay as in the first frame. In pauses the body settles back into the first frame's pose.
```
