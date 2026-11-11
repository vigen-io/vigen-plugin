# Directing a video: segments, vibe and key moments

The prompt ([prompting.md](prompting.md)) sets how the person moves for the
whole video. A real script changes as it goes: a warm hello, a problem told
seriously, an excited reveal, an inviting call to action. Directing lets each
part of the script carry its own vibe, and gives specific words their own
gesture.

Everything here is a judgement call. Read the script, look at the photo,
and decide what this video needs: maybe five segments with a few moments,
maybe none at all. The guidance below is there to inform that call, not to
replace it.

## The three layers

- **Prompt:** the speaker's steady style, applied to every chunk.
- **Segment direction:** how one stretch of the script differs, such as
  "serious here" or "lighter now". It's sent as a range instruction over
  that segment's exact time.
- **Moment:** one movement on specific words, decided by you and described
  as a physical movement ([gestures.md](gestures.md)). It's sent as a timed
  instruction with those words as a hint.

How Vigen applies them **[Vigen docs]**:
- **Appended per chunk.** Each instruction is added as a line at the end of
  the prompt of every chunk of up to 10 seconds it falls in, e.g.
  `During 1.5 to 6 seconds: …` or
  `At 3.25 seconds, when speaking "thank you all": …`.
- **Approximate timing.** The model aims for the stated time but doesn't hit
  it to the frame.
- **The photo is pinned.** The photo's pose returns every 2.5–5 seconds,
  so a pose held across a long stretch (say, hands together for 8 seconds)
  gets pulled back at each pin. Gestures that happen and finish fit better
  than long holds.

What's known so far:
- **[untested] Is this better than a single well-tuned prompt?** Not measured
  yet.
- **[tested, likely to transfer]** These are appended prompt lines, so the
  prompt findings very likely apply:
  - concrete actions work; adjectives and hedges don't;
  - expressions should be tied to meaning;
  - "don't" lines don't work;
  - the attention budget is shared: lines appended to a chunk compete with
    the prompt itself.

## Is it worth segmenting this one?

Things that point toward segments:
- The vibe really changes: hook → problem → solution → call to action; a
  story with a turn; good news then bad news; a joke inside a serious talk.
- A longer script. A video of a few chunks has room for contrast.

Things that point away:
- A short, even message. A prompt tuned to it does the job with less noise.
- Everything already sounds the same. Splitting it adds lines without adding
  contrast.

When unsure, a light touch is reasonable: a tuned prompt plus the gesture
plan, without segment directions. Moments are a separate decision: when the
photo shows hands, the gestures are always planned as moments
([gestures.md](gestures.md)).

## Finding the segments

Think in **beats of meaning**, not in sentence counts:
- **What each part does:** greet, hook, set up a problem, explain, prove,
  contrast, warn, joke, reveal, invite, thank.
- **Where the feeling turns:** "but / nhưng / tuy nhiên", a reveal, a
  punchline, an apology.
- **Paragraph breaks** are often beats, but not always. Two paragraphs with
  the same tone can be one segment.

Size follows the beat. Usually that's one to three sentences, but a
punchline can stand alone and a steady explanation can run longer. Segments
don't have to line up with Vigen's chunks, because a range is added to every
chunk it overlaps. A very short beat may suit a moment better than its own
segment.

**Pauses** (`pauseAfterMs`, text plans only) shape delivery as well as
timing. Consider:
- a longer pause after a paragraph or before a reveal;
- a short one between sentences that flow together.

Pauses are also where the body settles back into the photo's pose, so a pause
before a big moment gives that moment a clean start.

## Writing a segment's direction

What tends to work:
- **One vibe, in a sentence or two, as concrete actions.** For example:
  "Serious now: a slight frown, slower nods, a visible hand rests low and
  still between phrases."
- **Framed as a change** when the prompt already sets a style:
  "Calmer here: …", "Lighter now: …". That way it doesn't read as a
  contradiction of the prompt.
- **The face, not the mouth:** brows, eyes, cheeks and head carry the
  feeling. A direction is added to every chunk it covers, so a smile or
  pressed lips there fights the lip-sync for the whole stretch
  ([gestures.md](gestures.md), section 6).
- **Consistent with the photo:** "a visible hand", nothing that needs a hand
  that isn't there, and anything held stays held.
- **Written in English** (the prompt's language), whatever language the
  script is in.
- **Without repeating the words.** The chunk's prompt already has them.

If directions get rich, consider trimming the prompt's gesture list, since
the two share each chunk's attention.

## Moments

The moments are the gesture plan. [gestures.md](gestures.md) covers how to
decide them: read what each phrase does in context, pick the movement, budget
about one every 2–3 s, and write it as a body movement with a start, a
stroke and a return. A moment's `instruction` is that physical description,
never "do the presenting gesture" or "emphasise this".

Several moments in one chunk compete for attention and with the pose pins,
so a few strong ones usually beat many small ones.

- `words`: a short, distinctive phrase copied exactly from that segment's
  text, in the script's language. The CLI places it by its position in the
  segment and passes it as a hint. It fails before any TTS if the words
  aren't found.
- `at`: exact seconds, when you know them (e.g. from `timeline`). Prefer it
  when you have the audio.

## Seed

The same inputs and seed give the same take.
- **To re-roll** (a glitch or caption in one stretch, or gestures that just
  didn't land), change only the seed and keep everything else, so the takes
  compare.
- **Keep the winner:** note the seed the user liked, in `prompt.txt` or the
  plan.

## The plan file

`vigen.mjs lipsync --koi <koiDir> --plan <plan.json>` takes:

```json
{
  "prompt": "optional: the prompt template; otherwise the koi's prompt.txt or the default",
  "seed": 7,
  "pauseMs": 350,
  "segments": [
    {
      "text": "the words of this segment",
      "pauseAfterMs": 600,
      "direction": "optional: this segment's vibe as concrete actions",
      "moments": [{ "words": "exact words from text", "instruction": "the gesture" }]
    }
  ],
  "instructions": []
}
```

**Text plans** (no `audio`): each segment's `text` is spoken with the koi's
voice separately, then the clips are joined with the pauses. Segment times
come from the real audio, so directions land on their sentences.
- The costs are the same as one TTS call, per character.
- A text plan needs a paid plan, like any TTS.

**Audio plans** (`"audio": "path/to/recording.mp3"`, relative to the plan file):
1. Run `vigen.mjs timeline <recording>`. It splits the recording at its
   natural pauses and transcribes each phrase, giving `[{start, end, text}]`.
2. Group the phrases into beats.
3. Give each segment `start` (its first phrase's start), `end` (its last
   phrase's end), and `text` (the phrases' text, needed for moments with
   `words`).

`instructions` takes raw API items as an escape hatch: `{timestamp | start+end,
instruction, textHint?}`.

## Iterating

After a render, `<koiDir>/videos/<stamp>.plan.json` keeps the plan with the
resolved times and the exact instructions sent. Use it when comparing takes:
- **One segment looks wrong:** change that segment's direction.
- **Everything looks wrong:** revisit the prompt.
- **A moment lands a little early or late:** expected, since the model aims
  for the time but doesn't hit it to the frame. Try a more distinctive
  `words` phrase, or an exact `at` from `timeline`.
- **The direction is right but the take isn't:** keep the plan and change
  only the seed.

## An example (illustration, not a recipe)

A short promo in Vietnamese. One reasonable way to read it: a warm hello, a
problem told with mild frustration, the product as the bright turn, then a
clear call to action.

```json
{
  "segments": [
    {
      "text": "Chào mọi người! Bạn có bao giờ mất cả buổi sáng chỉ để tìm một món đồ trong nhà không?",
      "pauseAfterMs": 450,
      "direction": "Warm and curious: lifted cheeks and bright eyes on the greeting, then raised brows and a head tilt on the question.",
      "moments": [{ "words": "Chào mọi người", "instruction": "The speaker's right hand rises from rest to shoulder height, palm toward the camera, gives two small side-to-side waves, then lowers back to rest." }]
    },
    {
      "text": "Mình cũng vậy, và nó thật sự rất mệt.",
      "pauseAfterMs": 700,
      "direction": "Wry and tired: a small eye-roll and a light shake of the head.",
      "moments": [{ "words": "rất mệt", "instruction": "Both hands lift a little from rest, palms turning up, with a small shrug of the shoulders, then drop back to rest." }]
    },
    {
      "text": "Cho đến khi mình gặp Gọn. Đây chính là nó: chỉ ba bước, mọi thứ đều có chỗ của nó.",
      "pauseAfterMs": 400,
      "direction": "Brightening: wide eyes and lifted brows, the head lifts and leans toward the camera.",
      "moments": [
        { "words": "Đây chính là nó", "instruction": "The speaker's right hand rises from rest to shoulder height, index finger extended and pointing up toward the space above the head, held briefly with lifted brows, then lowers back to rest." },
        { "words": "ba bước", "instruction": "The speaker's right hand rises in front of the chest and holds up one, two, then three fingers, palm toward the camera, then lowers back to rest." }
      ]
    },
    {
      "text": "Thử ngay hôm nay nhé!",
      "direction": "Inviting and confident: a firm nod and warm, bright eyes.",
      "moments": [{ "words": "Thử ngay", "instruction": "The speaker's right hand moves forward from rest to chest height, open palm turned up and offered toward the camera, held briefly, then returns to rest." }]
    }
  ]
}
```

Each moment here is a judgement about that sentence: "Đây chính là nó"
presents the product on screen, so it gets the point up. The same words in
"đây chính là lúc…" ("this is the moment when…") would get no point. A
different reading of the same script, say a calmer brand voice, would choose
differently, and that's fine.
