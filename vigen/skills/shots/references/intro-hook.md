# Intro hook — the push-in to the first flash (picture)

**One sentence:** the first 3–8 s are one gesture: a slow push-in from wide that gathers speed and lands
under the first light leak, where the story starts.

**Use when:** the hook is one sentence or two ending on a turn, and a leak can sit in the pause after it.

## How
```jsonc
"intro": { "end": 5.08, "zoom": 1.27 },          // end = the flash time, zoom = where the push lands
"panels": [ { "start": 0, "end": 5.08, "out": "leak", … }, { "start": 5.08, "in": "leak", … } ]
```
- Scale 1 → `zoom` over 0 → `end`, power1.in (slowly accelerating). Camera events inside the intro are
  ignored; at `end` it cuts to whatever `camera` says then.
- `end` must have a flash (the run warns): put the leak **in the pause where the hook ends**, not on a word.
- The sound skill adds a click on frame 1, a sub-bass drop ≈ 60 % in (the music bed enters on it) and a
  muffled noise build that bursts on the flash; its log names where the drop landed.

## Pitfalls
- A hook with no pause before the next sentence: the flash and its tail sit on speech. Shorten the hook, or
  skip the intro (`"intro"` absent) and open on a cut.
