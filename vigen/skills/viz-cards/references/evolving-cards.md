# Evolving cards — one card, several sentences

**One sentence:** when the narration builds an idea over several sentences (old way vs new way, before →
after, a chain of hand-offs), write ONE `html` card that changes on each phrase instead of a run of short
cards (two back-to-back flow cards of 2.4 s and 7 s read as a flash and were rejected).

## Moves that worked
- **Open zoomed in** on the first state (a world `<div>` scaled ~1.3 around it), then **zoom out** to the full
  layout when the narration turns ("giờ thì…").
- **Keep the old state, struck**: a red ✗ on the old link and the old row dimmed to ~40 %, never removed.
- **Branch from the shared node** ("Bạn"): the new route grows out of the same element (elbow arrows drawn
  segment by segment with `scaleX`/`scaleY`) and can end at the same target.
- **Show what travels**: a small object (a prompt card with placeholder lines) pops out of the middle step on
  its verb ("tối ưu hóa") and slides along the arrow into the next ("rồi mới tới").
- **Show what comes out**: the last step turns it into real results (tiles: Ảnh / Video / Kịch bản) fanning out.
- **Land the key phrase on the middle**: a pulse + a small badge (🔑) on "chìa khóa".
- What the script keeps vague stays vague: placeholder lines, never an invented prompt or secret.

## Examples (`references/examples/`)
`ways.html` (cách cũ → cách mới). Copy it (or a template's starter card, `formats/<name>/cards/`) into the
project's `cards/`, retime its `tl.fromTo(…, <t>)` calls to `transcript.json` (video seconds) and set the
card's start/end.
