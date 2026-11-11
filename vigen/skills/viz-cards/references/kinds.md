# Card kinds — schemas

All take `id`, `kind`, `start`, `end` (video seconds) and an optional `theme: "dark" | "light"` (dark navy
gradient by default). Item `at` = the second its word is spoken; without it items stagger in after `start`.

```jsonc
// logos — brand row (2 rows above 4); text tile when there is no file
{ "id": "platforms", "kind": "logos", "start": 38.3, "end": 44.33, "title": "Dùng được cho mọi AI",
  "items": [ { "src": "assets/media/logos/openai.svg", "label": "ChatGPT", "at": 40.5 },
             { "src": "assets/media/logos/claude.svg", "label": "Claude", "at": 41.79 },
             { "text": "Mj", "label": "Midjourney", "at": 42.89 } ] }      // "tile": "none" | colour per item

// stat — one number; "count": true counts it up ("x100", "277", "1.000.000", "95%"; decimals stay static)
{ "id": "n277", "kind": "stat", "start": 24.6, "end": 27.0, "text": "277", "count": true,
  "countAt": 24.65, "countDur": 0.9, "color": "#0A1F6E" }                    // transparent: the panel shows through

// chart — vertical bars; unit appended, "display" overrides a label, "max" fixes the scale
{ "id": "quality", "kind": "chart", "start": 24.5, "end": 27.1, "title": "Chất lượng kết quả", "unit": "%",
  "bars": [ { "label": "Tự viết prompt", "value": 35 }, { "label": "AI viết prompt", "value": 92, "highlight": true, "at": 25.6 } ] }

// flow — 2–4 steps joined by arrows; a step is an image (src, "fit"), a short text, or both + label
{ "id": "relay", "kind": "flow", "start": 67.48, "end": 73.78, "title": "Cách mới",
  "steps": [ { "text": "BẠN", "label": "Người", "at": 70.16 },
             { "text": "AI", "label": "AI trung gian", "highlight": true, "at": 70.95 },
             { "text": "AI", "label": "AI thực thi", "at": 73.11 } ] }

// compose — free layout. x, y = centre, w = width, h = height (cover-crop), fractions of the card's SAFE band
// (y = 1 is the head line). Photos are framed (rounded, white border, shadow); .png/.svg float.
// from: left | right | top | bottom | pop | fade. texts: style bubble (tail left|right|center) | tag | plain.
// "float": true bobs gently; "bg": an image or a theme name.
{ "id": "robotstalk", "kind": "compose", "start": 64.42, "end": 67.48,
  "layers": [ { "src": "assets/media/robot-a.jpg", "x": 0.27, "y": 0.6, "w": 0.36, "h": 0.78, "rotate": -4, "from": "left", "at": 64.6 },
              { "src": "assets/media/robot-b.jpg", "x": 0.73, "y": 0.6, "w": 0.36, "h": 0.78, "rotate": 4, "from": "right", "at": 64.75 } ],
  "texts":  [ { "text": "01001…", "x": 0.3, "y": 0.12, "tail": "left", "at": 65.5 },
              { "text": "Hiểu rồi!", "x": 0.7, "y": 0.12, "tail": "right", "at": 66.3 } ] }

// html — anything else: a fragment file (markup + <style> + <script>), see evolving-cards.md
{ "id": "ways", "kind": "html", "file": "cards/ways.html", "start": 60.1, "end": 73.8 }
```

## html fragments
The script runs with `tl` (takes **video-clock** times; shifted onto the card), `S`/`E` (the card's start/end),
`CARD` (root selector), `W`/`H` (card px), `SH` (safe height). Scope every selector under `CARD`, start
elements hidden in CSS and reveal them with `tl.fromTo(…, { immediateRender: false }, <t>)`. No setTimeout,
no Math.random, no infinite repeats. Fragment files live in the project (`cards/<id>.html`).
A `fromTo` placed exactly at the card's start never renders (hyperframes 0.9.4; `set` does): start tweens
at `Math.max(t, S + 0.04)`. One fragment file can serve several cards (each with its own id, start and end):
filter its data list by `S`/`E` so each card shows only its own items.
`"bg"` on an html card sets its background: a theme name, or any CSS background (`"transparent"` for marks
drawn over the shot, placed with the shots layout `over`).
