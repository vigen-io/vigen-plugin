# Gestures: planning the hands phrase by phrase

The model renders the body from one photo, the audio and text. The audio drives the
lips, but what a phrase *means* only reaches it through the words you write.
It can't tell that "Đây là một miếng gà rán…" presents something and that
"đây chính là lúc…" ("this is the moment when…") doesn't. Making that call is
your job, not the model's.

So don't write rules for the model to apply ("if you hear 'this is', point up").
Read each phrase, decide what the hands do on it, describe that as a plain
physical movement, and send it as a **timed instruction on those words**.
The prompt ([prompting.md](prompting.md)) carries only what's true
everywhere: tone, face, head, the rest pose and the safety lines.

Each point says how solid it is, as in prompting.md: **[tested]**,
**[Vigen docs]** or **[untested]**. Most of this page is **[untested]** on
the model. It's built from gesture research and from what renders well in video
models. Treat it as the method, and check the takes.

## 1. Read the photo

- **Hands visible:** note where they rest (clasped on a desk, at the waist,
  one on the other). That rest pose is where every gesture starts and where it
  returns. **[Vigen docs]** The photo's pose comes back at the start and end
  of every chunk and every 2.5–5 s at quiet moments.
- **No hands visible** (tight head-and-shoulders): plan no hand gestures.
  Plan head and face beats instead: a nod, a lean in, lifted brows, a glance.
  Hands entering a tight frame from below render badly.
- **Something held** (a microphone, a product): gestures come from the free
  hand only.
- Gestures live between the shoulders and the waist, in front of the torso.
  That zone stays in frame in a waist-up shot.

## 2. Get the times

A gesture lands on a word, so you need the words' times before you write it.

- **There is audio** (the user's recording, or TTS you already made): run
  `vigen.mjs timeline <audio>`. It gives the phrases with `start` and `end`.
  Inside a phrase, place a word by its position in the phrase's text.
- **There is only text:** make the voice first with
  `vigen.mjs tts --koi <koiDir> --text "…" --out <voice.mp3>`, then run
  `timeline` on it, then lipsync from that audio. You pay for the TTS once,
  and the times are real.
- A text plan with moments placed by `words` also works. The CLI estimates
  each moment from its position in the segment's real TTS audio.
- **Send the words too.** `--transcript-file <file>` (a JSON list of
  `{ text, start, end }`, in order, not overlapping) gives the model your script's own
  words with their timing and skips its transcription, so each chunk's prompt
  has exactly the right words. Left alone, its built-in speech recognition garbles them
  ("giàn khoan" became "dạng khoang"). Write the language in the prompt
  then: `{{language}}` comes back empty.

## 3. Split the script into idea units

An idea unit is a phrase that carries one idea: usually a clause, or one item
of a list. Mark its **stressed word**, the one a speaker would lean on. The
gesture's stroke lands there.

## 4. Decide what each unit does

Read the phrase in its sentence, and in the story so far, and ask what it
*does* there. Then pick the movement for that. There are no trigger words:
the same words do different things in different places, and a phrase can do
something its words never say. For example, in one script:
- "Đây là một miếng gà rán kỳ diệu" opens the video by presenting the
  chicken the viewer is about to see: the hand points to where it's shown.
- "Thực ra nơi này chính là giàn khoan dầu" is the reveal of what the place
  really is: a point there too, with a lean toward the camera.
- "và đây chính là lúc đàn cá được tận hưởng bữa tiệc" uses nearly the same
  words to mean "and this is when the fish get their feast". It presents
  nothing, so there's no point. What it describes is the fish feasting, so
  the hands rest, or a beat lands on "bữa tiệc".
- "Ngay dưới sàn lưới của giàn khoan chính là mặt biển" says "chính là"
  again, but the thing is below: the finger points down.

| what the phrase does | movement |
|---|---|
| **presents a thing the viewer sees** | the hand rises to shoulder height and points toward where the thing sits on screen (see "Where the thing is") |
| sends the viewer somewhere (below, the description, the comments) | the index finger points that way |
| flags something to remember | the index finger raised beside the face, held briefly |
| describes a physical thing or action | **mime it**: the hands trace the shape or do the action (a drop, a throw, a pour, a size) |
| an abstract idea (time, growth, options, connection) | map it onto space (lexicon below) |
| a list or a count that matters | counting on the fingers (see the note below) |
| the speaker talks about themselves | an open hand lightly to the chest |
| the speaker turns to the viewer | an open palm toward the camera, slightly up |
| a real question to the viewer | both palms turn up with a slight shoulder raise and a head tilt |
| a contrast between two things | one hand out to one side, then the other hand to the opposite side |
| a denial or a warning | a small head shake, one palm raised forward at chest height |
| a punchline, a key number, or a stressed word with no image | **a beat**: one short, crisp downward motion of the hand on the stress |
| asks the viewer to act | an open palm offered toward the camera |
| uncertainty | a small shrug, palms turning up |
| a welcome or thanks | a small wave, or a hand to the chest |
| filler, a connective, a transition | **none**: the hands rest |

The list isn't exhaustive, and it works the same in any language. When
nothing fits, the hands rest. Resting is a choice too.

**Shapes that render poorly.** Prefer open hands and simple shapes. Avoid
emblems (thumbs-up, OK sign, peace sign) unless the script calls for one:
their meaning depends on the culture, and they need finger shapes video
models often get wrong. Counting on the fingers did produce more motion
**[tested]**, but whether the right number of fingers shows hasn't been
checked. Use it when the count *is* the point, and for three at most.

**Where the thing is.** A point goes where the thing will be on screen.
That depends on the edit, not on the photo:
- Short vertical videos often put media or a caption above the speaker, so
  pointing up is a good guess when nothing else is known.
- If the user said where the content goes (beside them, a split screen),
  point there.
- If pointing matters to the video (a product demo, a walkthrough), it's fine
  to ask once.
- Keep it in the frame: "the hand at shoulder height, the index finger
  pointing up", not an arm reaching out of the shot.
- No hands visible: a quick glance up toward the space above, with lifted
  brows, then back to the lens.

## 5. Budget the gestures

- **About one gesture every 2–3 seconds.** A 10 s chunk holds 3–4. If the
  script has more idea units than that, keep the ones with the strongest
  meaning. Make the rest beats, or let the hands rest.
- **Every gesture has three phases:** the rise, the stroke on the stressed
  word, then a brief hold and the return to the rest pose. Name the return.
  Gestures chained without one turn into flailing.
- **Gestures that happen and finish.** **[Vigen docs]** The photo's pose is
  pulled back every 2.5–5 s, so a pose held for long gets dragged back.
- **A chunk's first second works with a timed instruction.** **[tested once]**
  A point sent as a timed instruction at 0.01 s ("Đây là…", the video's
  first words) landed at 0.33–0.83 s, on the words. The same point asked for
  by a prompt rule landed at 1.6 s, on the next phrase.
- **Leave rests.** A speaker who gestures on every word looks nervous.

## 6. Write each gesture as a physical movement

The model can't act on "a deictic gesture" or "emphasise the reveal". Give it the
body movement.

**One movement, done once, over a span.** **[tested once]** "At 2.2 s: the
right hand rises to shoulder height with the fingertips pinched, then opens
and moves down to chest height as if letting it fall, then returns to rest"
came out as two quick flicks of a flat hand, up and back, half a second
each. There was no pinch and no fall. A point in time gives the model no duration,
and the chain of "rises… then… then…" read as several moves. So:
- send any movement that travels (a drop, a toss, a sweep) as a **span**
  over the words it covers, `During a to b seconds` (section 7);
- describe **one path** from a start position to an end position, with the
  pace ("once, slowly"), and that it **stays at rest** afterwards;
- when a gesture really has two beats, **pin each to its own words**:
  `On "thả" the hand lifts to shoulder height; on "từ trên cao xuống" it
  lowers slowly to the desk, once`;
- a short gesture that holds a pose (a point, a raised finger, palms up on a
  question) works as a point in time (section 7).

**Poses land; paths mostly don't.** **[tested, 1 video, 26 beats, before pinned
chunks; still true of them: a held point or palms up lasts 1–2 s, a toss or a
pour comes out as the pose only]** Over five parts written this way:
- **Poses landed:** points up and down (4 of 4), a raised index finger,
  a palm held up, hands held apart with palms facing.
- **Paths didn't:** a toss, a pour, a glide in, a flat sweep, a reach
  forward and a rise each came out as a quick flick, a different gesture
  (the reach became a hand to the chest), or nothing.
- **What to try next [untested]:** write a movement as the **pose it
  reaches and holds** over its words ("ends with both palms up at chest
  height, held through these words"), not as the path there.
- **Say "return to rest" once only, in the prompt.** A part whose every
  instruction ended "then stays at rest", and whose face-only beats said
  "while the hands stay clasped", barely moved its hands at all.
- **Don't plan a gesture in a part's last ~1.5 s.** Three of the four
  gestures planned there never happened; the photo's pose comes back at the
  end of each chunk **[Vigen docs]**.
- **A late gesture eats the next one.** One finger raise landed 1.2 s late
  and the beat planned after it never happened.

For each movement, say:

1. **Which hand:** the speaker's right or left, or both. Pick one frame of
   reference (the speaker's) and keep it. The speaker's right is the
   viewer's left.
2. **Hand shape:** open palm, palm up, palm down, palms facing each other,
   index finger extended, loose relaxed fingers. Fine shapes such as
   pinched fingertips came out as a generic open hand **[tested once]**.
3. **Start → end position,** relative to the body: from the rest pose on the
   desk to shoulder height, in front of the chest, out beside the right hip.
4. **Size and speed:** small, medium or wide; slow, steady or brisk.
5. **Hold and return:** "holds it there briefly, then lowers it back to rest
   with the other hand".
6. **Face and head** on the same beat, if they matter: lifted brows, a lean
   toward the camera, a slow nod. **Never the mouth.** The audio drives the
   lips, and a pinned instruction is the last line of its chunk's prompt, so
   a mouth shape there beats the prompt's "lips shape every syllable" line.
   **[tested once]** A pinned chunk asking for a "rueful half-smile" failed
   the lip-sync check on all three takes. Put the feeling in the brows, eyes,
   cheeks and head ("the brows draw up, the eyes soften"). If a smile matters,
   write "a smile in the eyes and cheeks while the lips keep shaping every
   word": brief, never held.

Before sending, check that:
- palms mostly face the camera and the fingers are loose and together, not
  splayed or interlaced;
- the hands don't touch the face or hair, cross over each other, or wring
  together;
- nothing whips fast (it smears): prefer smooth, steady, deliberate;
- the hands stay in the frame and in front of the torso;
- the gesture starts from the photo's rest pose and returns to it;
- nothing contradicts the words, such as a head shake under a "yes";
- nothing shapes the mouth: no smile, grin, smirk, pressed or pursed lips,
  or open mouth;
- it's written in English, in plain present-tense sentences with no
  gesture-theory words, and is at most 1000 characters.

## 7. Send it

**A gesture that must happen goes in a pinned chunk** **[Vigen docs]**. A timed
line inside a longer chunk is often ignored, and the photo's pose pulls the
hands back every few seconds (section 5). A range with `"pinChunk": true` is
rendered as its own chunk: cut exactly at its `start` and `end`, its instruction
the whole chunk's, the first and last frame pinned to the photo and no pin
inside it.

```json
{ "start": 0, "end": 3.06, "pinChunk": true, "textHint": "Đây là một miếng gà rán kỳ diệu. Khi thả nó từ trên cao xuống", "instruction": "On \"Đây là một miếng gà rán\" the speaker's right hand rises from the desk to shoulder height with the index finger pointing straight up, and holds there through \"kỳ diệu\". On \"thả nó từ trên cao xuống\" the hand opens, palm down, and lowers slowly and steadily all the way to the desk." }
```

**Lay the chunks out like this** (the first try broke all of these and the hands
barely moved **[tested once]**):
- **2–4 s each, cut at the speech's pauses.** The first and last frame are the
  photo, so the hand has to go out and come back inside the range. 1–1.3 s
  left no room: the points never happened, while a 2.3 s question chunk was
  the one gesture that improved.
- **One run of speech per pinned chunk.** **[untested]** The lip-sync check
  scores the whole chunk, and in a 2–3 s chunk a pause in the middle is a big
  share of frames with no speech to match. It pulled the "rueful half-smile"
  chunk further under the bar. When the gesture's words are followed by a
  pause and then more speech, end the chunk at the pause and start the next
  one there. Silence at a chunk's edges is fine, because the edge frames are
  the photo at rest anyway: the breath before the gesture's first word, or a
  part's closing silence (`parts.mjs --tail`). In a pinned chunk, keep edge
  silence short (about 0.4 s or less) so speech fills most of it.
- **Touching, or at least 1 s apart.** Any stretch between pinned ranges
  becomes its own chunk, however short **[Vigen docs]**, and a sliver of 0.3 s
  holds the hands at rest. Let one chunk end where the next starts.
- **Open the chunk on the gesture.** **[tested once, 19 chunks]** With the
  gesture's first word in the first 20 % of the chunk, 5 of 8 landed and only
  1 missed; from halfway on, 1 of 5 landed and 3 missed. So start a pinned chunk
  just before the gesture's words, and leave the words before them to the
  previous chunk or an ordinary one.
- **One idea per chunk, each beat pinned to its own quoted words:** `On "…" the
  hand … On "…" it …`. Neighbouring beats of one idea share a chunk.
- **Keep hand wording out of the prompt** (prompting.md): the pinned instruction
  is added after your template and a rest line contradicts it.
- 1–9.375 s each; pinned ranges must not overlap; touching ones pin the same
  image. Don't write "then returns to rest": the last frame already does it.
- `pinImageUrl` pins a different image on the chunk's first and last frame
  (the same person in the same shot, in the pose the moment starts and ends
  in, e.g. holding up a product); the chunks before and after move into and
  out of it.
- `detectFlicker`, `detectDesync` or `detectGlitches: false` on an item turn
  that check off for its chunks. Use one when a check would fail the chunk on
  purpose (a generated effect, a stretch with no lip-sync), or when the
  report below shows gestures being rendered away. Never turn `detectDesync`
  off to get a flagged chunk through: the flag means the mouth isn't
  following the words. Fix the instruction (see "Iterating").
- Face-only beats and tone changes stay ordinary ranges (below).

Everything else is an ordinary timed instruction **[Vigen docs]**, appended to
the prompt of the chunk it falls in. There are two kinds:

- **A span**, for a movement that travels. Vigen sends it as
  `During 1.71 to 3.34 seconds: …`:

  ```json
  { "start": 1.71, "end": 3.34, "textHint": "thả nó từ trên cao xuống", "instruction": "On \"thả\" the speaker's right hand, open with the palm down, lifts to shoulder height; on \"từ trên cao xuống\" it lowers slowly and steadily all the way down to the desk, as if letting something fall into water. It goes down once and stays at rest." }
  ```

  `start` is just before the first word it covers (about 0.1 s before),
  and `end` is just after the last (about 0.3 s after).
- **A point in time**, for a short gesture that holds a pose. Vigen sends it
  as `At 0.01 seconds, when speaking "…": …`:

  ```json
  { "timestamp": 0.01, "textHint": "Đây là một miếng gà rán", "instruction": "The speaker's right hand lifts from the clasped rest to shoulder height, index finger extended and pointing straight up toward the space above the head, held briefly with lifted brows, then returns to rest with the hands clasped on the desk." }
  ```

  `timestamp` is when the words start, in seconds of this audio. The model aims for
  it but doesn't hit it to the frame.

`textHint` is the exact words, in the script's language. A change of tone
over a longer stretch is a span too (segment directions,
[directing.md](directing.md)). Spans shouldn't overlap another gesture.

They go in as `vigen.mjs lipsync … --instructions-file <file.json>` (a JSON
list of these items), or as `moments` with `at` in a plan.

## 8. Show the plan before spending

Before any lipsync, show the user a gesture plan, one line per idea unit:

```
GESTURE PLAN  (part 1, 12.3 s; rest pose: hands clasped on the desk)
at 0.01      "Đây là một miếng gà rán"    presents the chicken → right index finger points up, back to rest
1.71–3.34    "thả nó từ trên cao xuống"   the drop             → open hand lifts on "thả", lowers slowly to the desk once
4.74–6.95    "vô số con cá ùa tới…"       a crowd rushing in   → both open hands glide in from the sides
9.98–12.24   "chẳng lẽ … đến thế sao"     the question         → palms up, held to the end, head tilt
Rests: "ngay khoảnh khắc chạm nước", "Điều này khiến người ta…"
Notes: right hand only; the mic is on the speaker's left.
```

The user reads it in seconds, and it's cheaper to fix there than on a take.

## Lexicon: abstract ideas onto space

Pick the one that fits. Don't stack several on one phrase.

| idea | movement |
|---|---|
| past, before | a hand moves back over the shoulder, or to the speaker's left |
| future, next, ahead | a hand moves forward and outward, or to the speaker's right |
| growth, increase | a palm-down hand rises in steps, or both hands move apart vertically |
| decrease, decline | a palm-down hand lowers slowly |
| comparing two options | both palms up, one at each side, lifting in turn like a scale |
| contrast | one hand out to one side, then the other hand to the opposite side |
| big, everything, the whole | both hands sweep apart in a wide arc, palms down or forward |
| small, precise, a detail | a hand close to the chest, thumb and fingers nearly touching |
| together, connection, a team | both hands come in from the sides toward the centre, palms facing |
| separation, a split | the hands start together at the centre and move apart |
| openness, honesty | both palms open and turned up, forearms slightly forward |
| certainty, a firm point | a palm-down hand makes a short flat horizontal slice |
| "this idea" | both hands cupped in front of the chest as if holding a ball |
| a process, steps | a hand moves sideways in small, evenly spaced chops |
| stop, caution | one palm raised forward at chest height, held briefly |

For timelines the viewer reads, movement toward the *viewer's* right reads
as "later". So when that matters, put the future on the speaker's left.

## Iterating

**Read the render report first.** `getLipSyncJob` returns `render` (`parts.mjs` saves
it as `part-NN.render.json`): for each chunk, its words, the instruction lines
it got, whether it was pinned, every take's check scores and which take was
kept. It tells you whether a gesture never reached a chunk, or was rendered away
by a check. Then look at the take frame by frame over each gesture's time, e.g.
`ffmpeg -ss <start> -t <len> -i part.mp4 -vf "fps=8,scale=160:-1,tile=8x3" -frames:v 1 sheet.jpg`.

- **A gesture landed late or early:** expected within about a second. If it
  lands on words it doesn't suit, move it to another stressed word.
- **A gesture came out as a quick flick, or repeated:** it was a point in
  time for a movement that travels, or one sentence chained several moves.
  Make it a span, one path done once, with extra beats pinned to their own
  words (section 6).
- **The hand shape came out generic:** the shape was too fine. Use an open
  hand.
- **A gesture didn't happen:** check that the instruction is a physical
  movement with a start, an end and a return, and that its chunk isn't
  crowded with other instructions.
- **The hands are stiff between gestures:** that's what the rest pose asks
  for. If it looks frozen, add a beat or two on stressed words instead of
  loosening the prompt.
- **The lip-sync check flagged a pinned chunk** (`checks.flagged_chunks`, low
  sync confidence on every take in the report): read its instruction before
  re-rolling, because a new seed with the same instruction fails the same way.
  Look for a mouth or expression shape (a smile, a smirk, pressed lips) and
  for a pause in the middle of the chunk. Move the face cue onto the brows and
  eyes, end the chunk at the pause, then re-roll with a new seed.
- **The right gestures, a bad take:** keep the instructions and change only
  the seed.
