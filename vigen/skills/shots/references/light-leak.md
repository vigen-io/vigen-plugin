# Light leak — the warm flash

**One sentence:** a white-hot bloom plus amber/red light sweeping across the whole frame (screen blend, over
captions too) for ≈ 0.45 s; the panel's content swaps underneath it.

**Use when:** a turn in the story (hook → story, story → twist), the end of the intro hook, optionally a
seam that is also a chapter turn. It marks a big moment, so it cheapens with use; how many a video gets is the
template's call.

## How
- On a panel: `out: "leak"` on the old one and/or `in: "leak"` on the new one at the same time, or a bare
  `leaks: [t]` entry.
- Timing: the flash ramps 0.16 s before `t`, peaks on `t`, fades 0.42 s (the intro's flash fades faster,
  so it is gone before the next word).
- Place it **in a pause**, not on a word: a flash on a trailing particle ("…đáng tiếc luôn ‖ á.") reads as the
  sentence running on. Read `transcript.txt` for the gap.

## Sound
A riser peaking on the flash, low-passed (muffled) and cut off before the next word; the intro's flash gets a
noise build instead (sound skill does both from shots.json).

## Pitfalls
- No camera move under the flash; cut the framing *at* the flash if needed (it hides the cut).
- Over a very dark panel the flash reads orange-brown: fine for a turn, wrong for a reveal (use `white`).
