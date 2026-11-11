# Intro hook — sound

**One sentence:** the opening push-in (shots skill `intro`) is one gesture in sound too: a click on frame 1,
a sub-bass drop where the music enters, and a muffled noise build that bursts on the first flash.

**Automatic** with `cues: "auto"` when shots.json has `intro.end` (needs palette roles click, sweep, build).

| Time | Sound | Level vs voice |
|---|---|---|
| 0.05 s | `click`: a sharp tick, gone by 0.5 s | +6 |
| ≈ 60 % of the hook | `sweep`: sub drop landing on its onset, 1.2 s, faded; **the music bed starts here** | +10 |
| drop → flash | `build`: noise riser chosen to fill that span, faded in from the drop, bursting on the flash, released ≤ 1 s and gone before the next word | +7, muffled |

- The drop lands on the word after the best phrase break in 40–75 % of the hook (sentence ends and long
  pauses win). It must land on a turn in the line ("…mẹo siêu xịn này | thì vô cùng…"); without punctuation
  there the pick is by distance and can fall mid-phrase: set `"intro": { "sweep": <t> }` in sound.json.
- The flash belongs in the pause where the hook ends; mix.mjs warns when it lands on speech.
