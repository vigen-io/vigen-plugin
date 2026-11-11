---
name: ui-demo
description: >-
  Animated step-by-step walkthroughs of a web app or website for videos — a mock of the app's screen (HTML/CSS recreated from current screenshots) driven by timed steps: a virtual camera that pans and zooms, a cursor that moves and clicks, typing, pasting with a key badge, dialogs opening, scrolling, highlight rings with labels. Seek-safe HyperFrames output. Use when a narrated line tells the viewer how to do something in an app ("mở ChatGPT, tạo project mới, dán vào phần Instructions", "open Settings and turn on…", "go to Canva and click…"), written as a HyperFrames sub-composition (placed as a panel by the shots skill, or mounted by hand); also to grab a reference screenshot of a public page or to preview/snapshot a walkthrough on its own.
---

# UI demo — show the steps, don't just say them

`<skill>` = this skill's base directory (as shown when it loads); write it out in full in commands.
Needs Node ≥ 20 and a headless Chrome (the one HyperFrames/Puppeteer downloaded into `~/.cache/puppeteer`
is found automatically; else `CHROME_PATH`). ffmpeg only for contact sheets. No npm install.

## 1. Pick the source — in this order

| Source | When | Why not always |
|---|---|---|
| **The user's own screen recording** | They have one, or can record one in a minute (ask once for software topics) | — it is the real thing: put it in `library/` and use it as a normal media card |
| **Mock screen + steps (this skill)** | Default for anything behind a login (ChatGPT, Gemini, Claude, Canva, Notion, banking, …) | It is a recreation: keep it simplified and honest (§ 4) |
| Live capture with a headless browser | **Not used.** | Logins, bot walls and Cloudflare challenges, ToS against automation, personal data on screen, A/B-tested UI that changes between takes, and footage that can't be re-timed to the voice. `ref` takes a *reference screenshot* of a public page; that is all |
| Someone else's tutorial video | **Never.** | No licence (YouTube, TikTok) — same rule as card media |

## 2. Know what the screen looks like *today*

UIs move every few months; a mock from memory is how a video goes stale on day one.
1. **Best:** ask the user for a screenshot of each screen in the flow (their account; tell them to blur
   names/emails). Save to `ui-refs/` in the workspace.
2. Official help-centre / release-note pages for the feature (WebSearch, then the web-fetch agent): exact
   labels, where buttons sit, what a dialog contains. Third-party guides only to confirm.
3. `node <skill>/scripts/ui-demo.mjs ref <https://public-page>` — screenshot of a **public** page (robots.txt
   honoured; it refuses when disallowed). Open the PNG: a login wall, cookie wall or "verify you are human"
   page is no reference.
4. Write down the labels the narration uses vs. the real ones. The script may say "System Instruction"
   where ChatGPT's field is called "Instructions": show the **real** label and put the narration's word on a
   `highlight` label — viewers have to find the real button.

## 3. Build it

**Screen** — one static HTML file per app flow: `<style>` + markup, no `<script>`. Built-ins in
`<skill>/screens/` (`ui-demo.mjs screens` lists them and their targets; the header comment says what it was
last matched against). For a new app or a changed UI, copy the closest one into the video
(`videos/<slug>/ui/<app>.html`) and edit; rules in `references/screens.md` (size, `data-ui` targets,
`data-off` / `data-grow` states, placeholders, what not to use).

**Fidelity check — the visual judge (required before a screen goes into a video).** For every reference
screenshot, render the mock in the same state and judge them side by side:
```bash
node <skill>/scripts/ui-demo.mjs match <screen> --ref ui-refs/<app>-home.png --name home
node <skill>/scripts/ui-demo.mjs match <screen> --ref ui-refs/<app>-dialog.png --name dialog --show "[data-ui=overlay],[data-ui=new-project-modal]"
```
→ `ui-refs/match/<screen>-<state>/`: `side.png` (left real, right mock), `blend.png` (50/50 overlay: doubled
edges = misplaced), `ref.png`/`mock.png` 1:1, an SSIM number, and `match.md` — the scorecard. **Open the
images (zoom into ref/mock where it matters), score A–H in `match.md`, write each fix as element +
property + value, edit the screen, rerun.** PASS = the elements the steps touch (B) and no personal data (H)
both 2, nothing 0, ≥ 13/16; SSIM should rise between rounds. Up to 4 rounds, then show the user `side.png`
and say what still differs. On PASS, update the screen's header comment (`Matched against <refs>, <date>`).
- Same viewport or nothing lines up: screenshots at the screen's size (1280×800 browser window; a 2×
  retina capture is fine), else resize the screen root to the reference's CSS size. `match` warns.
- **Judge the mock, never copy the reference's content**: the user's screenshot has their chat titles,
  name and files. Structure and style come from it; content stays invented (§ 4).
- No reference at all (bot wall, the user can't send one): say the screen is unverified, keep it
  simplified, and don't claim it matches.

**Steps** — a `demo.json` in the project (`videos/<slug>/ui/<id>.json`), times on the video clock
(`transcript.json`), so the talking-head retime can move them like every other time:

```jsonc
{ "id": "gptsetup", "screen": "chatgpt-project",        // built-in name or ui/<file>.html
  "start": 21.73, "end": 27.16,
  "view": { "zoom": 1 },                       // first framing: { target?, zoom? }; default = whole screen
  "tilt": true,                                // optional: open tilted in 3D on a soft backdrop, land flat before the first action
  "cursor": [760, 420],                        // start point in screen px (default: in view); false = no cursor
  "shown": [], "hidden": [],                   // state at start: selectors to reveal / hide (data-off)
  "steps": [
    { "at": 22.2,  "do": "focus", "target": ".side", "zoom": 1.5, "dur": 0.7 },
    { "at": 24.28, "do": "click", "target": "[data-ui=new-project]" },
    { "at": 24.45, "do": "show",  "target": "[data-ui=overlay], [data-ui=new-project-modal]", "from": "pop" },
    { "at": 24.5,  "do": "focus", "target": "[data-ui=new-project-modal]", "dur": 0.6 },
    { "at": 25.2,  "do": "type",  "target": "[data-ui=project-name]", "text": "Máy đẻ prompt" },
    { "at": 26.27, "do": "click", "target": "[data-ui=create-project]" },
    { "at": 26.42, "do": "hide",  "target": "[data-ui=overlay], [data-ui=new-project-modal], [data-ui=home]" },
    { "at": 26.42, "do": "show",  "target": "[data-ui=project-page], [data-ui=sidebar-project]" },
    { "at": 26.5,  "do": "focus", "target": "screen", "dur": 0.6 } ] }
```

| `do` | `at` is… | Options |
|---|---|---|
| `focus` | when the camera starts moving | `target` (or `"screen"` = whole screen), `zoom` (× the whole-screen scale; default fits the target), `dur` 0.8 |
| `click` | the click (ripple, press; the cursor turns into a hand and the button tints as it arrives) | `point: [fx, fy]` inside the target (default centre), `zoom`, `cam: false`, `hover: false` |
| `type` | first character appears (field is clicked just before) | `text`, `cps` 18, `dur`, `replace`, `click: false`; no `text` = placeholder lines typed out (`lines` 1) — for a request the script only describes ("mô tả sơ sơ cái ý định") |
| `paste` | the pasted text lands (key badge, highlight fade) | no `text` = unreadable placeholder lines (`lines` 5) — the default for anything the script keeps vague; `text` only when the script gives the words; `key` ("Ctrl + V"; `false` = none), `replace` |
| `show` / `hide` | the fade/pop starts | `from`: fade \| pop \| up \| down \| left \| right; `dur` |
| `highlight` | ring appears | `label` (callout text), `until` / `dur` 1.8, `pad`, `radius`, `size` |
| `lift` | the component starts rising off the screen | one element; `label`, `until` / `dur` 1.8, `zoom`, `scale` 1.15, `z` 90 (px toward the camera), `dim` 0.4, `tilt: [x°, y°]` (the copy's own turn; default faces the camera), `screen` (the screen's tilt while it floats, `{ x, y, z, scale }`, default 16/−12/2/0.94; `false` = stays flat) |
| `tilt` | the whole screen starts turning | `x`, `y`, `z` (degrees; all 0 = flat), `scale` (< 1 shows the backdrop), `dur` 1.0 |
| `text` | content swaps | `text` — e.g. a title that changes after Save |
| `scroll` | scrolling starts | `target` = the moving content, `by` px (screen) |
| `key` | badge appears | `key` ("Enter", "Ctrl + C"), `dur` |

The camera only moves on `focus`, on a step with `zoom`, or when a target is outside the unobstructed view
(it then re-centres on it).

**Depth moves — emphasis, not decoration** (one or two per card):
- `"tilt": true` (or `{ x, y, z, scale, dur }`) on the card opens on the screen leaning back in perspective,
  rounded and shadowed on a soft backdrop, and turns it flat just before the first action — a reveal for the
  card's first second. A `tilt` step turns it any time (e.g. a closing tilt as the narration leaves the app).
- `lift` pulls one component out of the UI **by its DOM**: at build time Chrome copies that element with
  every computed style inlined (plus whatever was typed/pasted into it before the lift) onto a 3D layer in
  front of the screen. The copy rises in Z, scales up and faces the camera while the screen tilts back and
  dims; its slot is left empty and its shadow falls on the surface below; then everything settles back.
  Use it on the noun the line lands on ("cái **project** mới", "phần **System Instruction**") with the
  narration's word as `label`. Lift a whole component (a button, a field, a dialog), not a text fragment;
  later changes to it (text swaps, typing during the lift) don't show on the copy.
  The copy shows the screen as it is at the lift (earlier `show`/`hide` steps and typed/pasted text applied),
  and text that sat on one line stays on one line. Its scaling grows away from the screen edge, but not away
  from the camera's edge: for a full-width row (a comment, a list item) under a zoomed camera keep
  `scale` ≈ 1.04 or the far side leaves the frame.
- Hover is automatic on every `click`: the cursor turns into a hand and the button tints as it arrives, until
  just after the press (menus and dialogs often close on the click) — `"hover": false` on the card or step
  turns it off.
- Sound: a lift takes a soft pop or swoop on its `at` (`shot` prints the lift times next to the clicks). Times: put clicks on the verb ("**tạo** project", "**dán** vô") and dialogs
just after; ~1 action per spoken clause. A step-heavy card holds 5–12 s; cut to a second card (with
`shown`) when the narration leaves the app for a while.

**Framing for a phone** — the default panel is ≈ 929×616 and, tucked behind the presenter, their head covers
its bottom ~28 % (the safe height; QA's dashed line); UI text must be ≥ 24 px on the frame.
- A 1280×800 screen shows 14–16 px UI text at ~11 px in the whole-screen view: frame each action at zoom
  ≈ 2–2.3 (`view`/`focus`/`zoom` on the step) and step back out (`focus "screen"`) only between actions.
- Whatever a step touches must be able to sit in the clear band: keep inputs and buttons in the upper part
  of the screen (the comment box ABOVE the comments, YouTube-style) — the camera cannot lift the bottom of
  the screen above the head line.
- Chats and feeds: build a compact screen (e.g. 640×520) so bubbles read at a modest zoom, give every
  message its space from the start (`data-off` without `data-grow`), and let the camera do the scrolling:
  per message a `focus` on its bubble (`zoom` 1.5, ≈ 0.12 s before) and a `show` from `up`.
- Readability flags of 20–22 px on small UI chrome (Create, Save, a placeholder line) are acceptable when the
  line's own callout (a `label`) carries the moment; say so rather than zooming the action out of frame.

**Built-in screens** (`ui-demo.mjs screens`): `chatgpt-project` (Projects: create → ••• → Project settings →
Instructions; a project chat with a "Prompt" code block + Copy; the home composer for pasting),
`social-post` (a generic short-video post: comment box, comments, Follow → Following — the CTA card),
`zalo-group` (a Zalo-style group chat: shared file + five messages — "my friends said…" lines),
`vigen-app` (Vigen itself, matched against the real pages: new avatar → voice clone → paste the script → Tạo →
result → templates; its logo and posters in `screens/vigen-app/`, the koi's photos per video). Each header
says what to change per video; copy into `videos/<slug>/ui/` and edit there.

**Motion QA** (after the fidelity PASS, before building the video):
```bash
node <skill>/scripts/ui-demo.mjs qa videos/<slug>/ui/<id>.json [--ref ui-refs/<app>-home.png]
node <skill>/scripts/ui-demo.mjs preview videos/<slug>/ui/<id>.json   # looping preview.html for the user
```
Automatic findings first (target behind the head or off-card, text < 24 px on the frame, camera still moving
at a click, cursor jumps, actions < 0.45 s apart, text overflowing a field, clipped labels), then
`qa.jpg`: one frame per step at the moment it settles, captioned with the step and the words spoken there
(dashed line = the presenter's head line). Fill in `qa.md` (per frame: visible and in focus · above the
head and readable · right state · nothing invented · clean; per card: looks like the app · pacing ·
says no more than the script · followable at phone size), fix, rerun until PASS. `shot --at …` grabs any
other moment. Click times are printed (sound skill: a soft `click` accent, one sound for the card; a template with
`sound.uiClicks` gets a real mouse click on every one of them automatically).

**Into the video:** `ui-demo.mjs compose videos/<slug>/ui/<id>.json` writes `compositions/ui-<id>.html` (its
timeline starts at the demo's `start`; size = the project's panel) and prints the shots.json panel to add:
`{ "comp": "ui-<id>", "start", "end", "in", "out" }`. Other projects: `--size 1920x1080 [--safe <px>] --out
compositions/<name>.html`, then mount it per `/hyperframes-core`.

## 4. Honesty and look

- **Show the gesture, not the secret.** Whatever the narration leaves vague stays vague on screen: "the
  Master Prompt", "the system prompt", "the bí kíp I'll send you", a setting's value, a file's contents.
  Never write your own version of it — paste without `text` (placeholder lines) and, if it helps, a
  `highlight` label with the narration's own word. Typed text is limited to what the script itself says
  or a neutral name the flow requires.
- A simplified recreation, not a counterfeit: real labels and layout, invented but plausible content
  (chat titles, project names from the script), no real people's names/emails/avatars, no fake numbers
  presented as real results. Brand marks stay small and functional (the app's own UI chrome).
- Light theme unless the user's reference is dark. Don't style it in the video's own card look: it should read
  as "the app", and the frame around it already carries the brand.
- HyperFrames reserves `data-hidden` (Studio hides those elements): screens use `data-off`.
- In Studio/snapshot a card can vanish while a sound effect plays across it (hyperframes 0.9.x); the render
  is right. Check UI cards with `ui-demo.mjs shot`, or snapshot a copy with `"sfx": []`.
