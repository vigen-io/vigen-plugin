# Seam cut — hide where takes join

**One sentence:** where two lipsync parts join, the head pose resets; a framing change on that exact frame
makes the jump read as an edit.

**Use when:** always, on every seam in `talking.json` (shots.mjs warns about uncovered ones).

## How
- A camera event at the seam's time with `move: "cut"` to a different framing (wide ↔ punch). `--draft`
  writes them alternating punch / wide.
- Or a leak flash on it (a panel `in`/`out: "leak"` at the seam, or `leaks: [seam]`), when the seam also is a
  chapter turn.
- The retime snaps cuts within 0.25 s of a seam onto it; check after any retake.

## Pitfalls
- A cut 2–3 frames off the seam shows the jump first: put the event exactly on the seam time.
- An ease across a seam doesn't hide it (the jump happens mid-move).
