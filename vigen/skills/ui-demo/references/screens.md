# Writing a screen

A screen is one file: `<style>` + markup, recreating an app's UI as plain HTML/CSS. The engine lays it out
once in headless Chrome, measures every step target, then films it with a virtual camera. Start from the
closest file in `<skill>/screens/` and edit it against the reference screenshots.

```html
<!--
  ui-demo screen: <App> — <flow> (simplified recreation). Checked against <source>, <yyyy-mm>.
  Targets (data-ui): new-project  project-name  save …
-->
<style>
  .app { width: 1280px; height: 800px; display: flex; background: #fff; }   /* the root: fixed size */
  .modal { position: absolute; left: 360px; top: 230px; width: 560px; }
</style>
<div class="app">
  …
  <div class="modal" data-ui="new-project-modal" data-off> …
    <div class="field" data-ui="project-name" data-placeholder="Copenhagen Trip"></div>
  </div>
</div>
```

Rules:
- **One root element with a fixed `width`/`height`** in CSS. 1280×800 suits the default panel (≈ 929×616): the whole
  screen fits at 0.77×, and focus zooms to 1.3–2× read well. Use real CSS sizes (14–16 px text, 36–40 px
  buttons): the camera does the enlarging.
- **CSS is nested under the card automatically** (native CSS nesting): write plain selectors (`.side`,
  `button`). No `:root`, `html`, `body`, `@keyframes`, `animation`, `@import`, web fonts (system UI font
  stack is the default; it is what these apps use anyway).
- **No `transform` on anything a step animates** (`show`/`hide`/`scroll` targets, dialogs): GSAP owns the
  transform and would drop a `translate(-50%, -50%)`. Position with left/top/margins.
- **Targets:** give everything a step touches a `data-ui="…"` name (any CSS selector works, these are just
  stable). Steps can target several elements at once (`"[data-ui=overlay], [data-ui=modal]"`); the camera
  and cursor use the first.
- **States are layers:** every page/dialog/menu that appears later is in the markup from the start with
  `data-off` (opacity 0, still laid out and measurable) and absolutely positioned over what it covers;
  `show`/`hide` steps switch them. A card that starts mid-flow sets its state with `"shown"`/`"hidden"`.
  Never `data-hidden` (HyperFrames reserves it) and never `display: none` (unmeasurable).
- **Inputs:** a field is an empty element with `data-placeholder` (the engine draws the placeholder and
  hides it on the first `type`/`paste`). Give fields a fixed height and `overflow: hidden`; layout is not
  re-measured as text arrives.
- **Icons:** inline SVG (simple strokes) — no external images unless they are files in the video project
  with explicit width/height.
- Content: plausible, invented, in the video's language where it is user content (chat titles, project
  names), the app's own language for its UI labels (match the reference).

- **Inserted list items** (a new project appearing in the sidebar): `data-off data-grow` — collapsed to
  height 0 until a `show` step grows it in, so there is no gap before it exists. Elements below it are
  measured with it collapsed: don't click, focus or lift them after it grows. Messages the camera pans to
  one by one take their space from the start instead (`data-off` only).
- **Placeholder lines in the markup** (a streamed reply, a request bubble): `<span class="uid-sk"
  style="width:88%"></span>` draws a faint unreadable line. To reveal them one by one, put each in its own
  wrapper and `show` the wrapper (`<div data-ui="c1" data-off><span class="uid-sk" …></span></div>`):
  `show` sets the target's opacity to 1, which on the span itself turns it into a solid black bar.
- **Keep what steps touch out of the bottom ~28 %** of the screen when it fills a panel tucked behind the presenter (their's
  head covers it); for a chat or a short list, a compact screen (≈ 640×520) reads at a lower zoom.

Then run the fidelity check (`ui-demo.mjs match`, SKILL.md § 3) for every state you have a reference for,
and only write steps once it passes.
