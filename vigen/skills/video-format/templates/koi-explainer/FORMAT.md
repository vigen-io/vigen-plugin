# Format: koi-explainer

The original koi style, the one the module skills used to have built in: a presenter at a desk talking to
camera, one media panel standing *behind* their head (a depth composite), keyword callouts on the chest,
punch-ins on the emphatic lines, warm light leaks on the big turns, an intro push-in, and a full sound pass.
Not measured from reference videos: these are the rules the first koi videos were made with. `format.json`
holds the look and levels the modules take as defaults.

## 1. Layout: behind, always

Every panel uses the `behind` layout (the slot above the head, its bottom tucked behind it). `hold` is on: a
panel is always on screen, each holding until the next arrives. At most one `breathe` stretch with no panel,
on an emotional line. Change panels when the subject changes, never mid-word; 2–6 s each.

## 2. Camera

- Start wide. A camera change every 5–15 s.
- Punch (1.27) on the emphatic sentence or the question; back to wide on the next sentence (cut) or within it
  (ease 0.5–0.6 s). Tight (1.45) for the one line that matters most, rarely.
- A punch-in over a panel is the breather between ideas, better than an empty frame.
- No slow drifts or shake outside the intro: they fight the lipsync.
- **Intro push-in** when the hook is one or two sentences ending on a turn with a pause after it: the push
  lands under the first light leak in that pause.

## 3. Panel transitions

- Mix swaps in place (`cut`, `white`, `leak`) and slides (`whip`/`drop` in, `whip`/`lift` out) about half and
  half. A whip pair every ~10–15 s; more reads frantic.
- `white` for a reveal ("và đây là…"); `fade` for calm content; `pop` for a single object.
- **Light leaks** on the 1–2 biggest turns of the video (hook → story, story → twist) and the end of the
  intro; never more than ~3 in a minute. In a pause, never on a word.
- B&W grade (`grade: bw`) for a dark beat: death, failure, "là quái vật".

## 4. Captions: keyword callouts, not subtitles

**One sentence:** pick the 2–5 words that carry each sentence and put them up as they're spoken; leave the
rest to the voice.

- Line 1 (`w`) sets context, line 2 (`b`) is the punchline in the accent colour with a white outline and glow;
  an optional `s` line adds a short qualifier. ≤ ~3 words per keyword line, ≤ ~4 per context line.
- Entrances `glitch`, exits `smear` (format.json). A video may pick another accent and `pop` entrances.
- Numbers and names belong on screen, written as the script writes them.
- Keep a creator's habit of masking sensitive words with asterisks ("N*i t*ng") only where the topic needs
  platform-safe wording.
- `start` = the first word's start − 0.05 s; each keyword line's `at` = when its first word is spoken.
  `end` = the last word's end + 0.2–0.4 s, or the next group's start.
- Leave captions off for 1–3 s between ideas: about 45–55 % of the runtime captioned in all.
- On the chest (the default `top`), below the chin, above the desk.
- Word by word only when the user asks for it (it's busier): one word at a time, the key phrase as the last
  `b` word.

Start from `captions.mjs --draft` and rewrite it by these rules.

## 5. Cards

viz-cards for brands (`logos`), numbers that matter (`stat` counting up), comparisons (`chart`), processes
(`flow`), abstract ideas (`compose`), and ONE evolving `html` card when an idea builds over several
sentences. Dark navy theme, blue accent (`brand`). Cards sit in the behind slot: content stays inside its safe
height.

## 6. Sound

- Subtle beats dramatic.
- Music bed 11 dB under the voice, entering on the intro's sub drop (else after the hook sentence).
  (Later videos leaned to 12–14 dB under: set `bgm.below` per video if 11 sounds loud.)
- `cues: "auto"`: whooshes on every slide pair, a muffled riser on every leak, the intro hook (click on frame
  1, sub drop where the music enters, a noise build into the first flash).
- Accents by judgement, about one every 5–10 s on top of the slides: `pop` as logos, flow steps or bubbles
  appear (one sound per card, same file and level for all its items), a soft `hit` or quiet `click` on the
  one or two lines that land hardest or a number finishing its count, `tick` on a small reveal.

## Targets

`format.json` → `targets` checks what these rules imply (≤ 3 flashes a minute, the bed 10–14 dB under the
voice, ~half the words captioned). Cuts per minute and shot lengths aren't set: they were never measured for
this style.
