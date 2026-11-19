---
name: stock-media
description: Find real, legally usable images and video clips for a video — the user's own visuals library first (labelled and searched locally), then a brand's own press kit for product shots (editorial use), YouTube Creative Commons (CC BY) videos of named products and places, then free commercial-use stock (Pexels, Pixabay, Openverse, Wikimedia incl. public domain), as numbered contact sheets to judge, with source and license recorded for every pick. Use when an edit needs b-roll, a photo or a clip of a concrete thing, or when the user adds files to library/.
---

# Stock media — real footage you're allowed to use

`<skill>` = this skill's base directory. Keys in the workspace `.env` (optional, free): `PEXELS_API_KEY`,
`PIXABAY_API_KEY`; Openverse and Wikimedia need none. Node ≥ 20, ffmpeg.

## Sources: all of them, every search → (last) generated

`find-media.mjs` searches every source for every card and puts them on one numbered sheet, in this order:
the library, the card's press pages, YouTube Creative Commons, free stock. Choose from the whole sheet; the
user's own files still win when they fit. `--only library,stock` (or a card's `"sources": [...]`) narrows a
search; `"youtube": false` leaves YouTube out of an abstract card (a feeling, an office) where it only adds
time (each video's license is read one by one: ≈ 5 s a result).

1. **Files the user handed over** win. For software topics ask once for real screen recordings (into
   `library/`): stock has none, and generated UIs look fake. Without them, how-to lines are a **ui-demo** card.
2. **The library** (`library/` in the workspace, any subfolders), when there is one:
   ```bash
   node <skill>/scripts/library.mjs scan                    # index new files -> library/.thumbs/unlabeled-N.jpg
   node <skill>/scripts/library.mjs label --json labels.json   # [{ "id": "L0003", "desc": "…", "tags": [ … ] }]
   node <skill>/scripts/library.mjs search "sheep" "cừu" [--kind image|video]
   ```
   **Open every sheet** and label every item: `desc` one plain sentence of what is visible and what kind of
   media (photo / screenshot / illustration / screen recording; for videos what happens across the frames),
   `tags` 5–12, the subject in **English and Vietnamese**, names, shot type. Labels are all search sees;
   find-media refuses (exit 4) while anything is unlabelled. Tell the user once that they can drop their own
   images/videos (with the rights to use them) into `library/`.
3. **The cards**: `<project>/media_queries.json`, one entry per needed picture:
   ```jsonc
   [{ "id": "dolly", "need": "Dolly the cloned sheep", "queries": ["Dolly sheep", "cloned sheep"], "kind": "image" },
    { "id": "launch", "need": "a rocket launch", "queries": ["rocket launch"], "kind": "video", "pd": true }]
   ```
   ```bash
   node <skill>/scripts/find-media.mjs videos/<slug>                       # every entry, every source
   node <skill>/scripts/find-media.mjs videos/<slug> --card dolly --q "…" --q2 "…" [--press <url>]   # one again, new queries
   node <skill>/scripts/find-media.mjs videos/<slug> --card dolly --only stock      # one source only
   node <skill>/scripts/find-media.mjs videos/<slug> --pick dolly 3 [--as dolly2]   # -> assets/media/dolly.* + CREDITS
   ```
   **Open every `work/media/<id>/sheet.jpg`**: right subject, no watermark, no text, no portrait framing (a
   landscape-ish panel crops them). Slow (30–90 s an entry): run all in the background and read sheets as
   they land. Nothing relevant → it prints manual sources (Destockd) for the **user** to download into
   `library/`; never script those sites.
4. **Press kits**, for a named product (a phone, a car, a gadget in a review or a ranking): the brand's own
   newsroom or press page, where it publishes product shots for the media. **Every card about a named
   product gets one**, without being asked: find the page (web search for "<brand> newsroom <product>";
   only the brand's own site, never a reseller or a fan page) and put it on the card before searching (the
   search reminds you when a card has none). Every image and video on the page is a candidate, collapsed to
   its largest size:
   ```jsonc
   { "id": "galaxy", "need": "Galaxy S25 product shot", "press": ["https://news.samsung.com/global/…"],
     "pressTerms": "https://…/terms-of-use", "kind": "image" }
   ```
   Same find/pick commands.
   These are **editorial use**: reviews, rankings, news, commentary about the product. Not ads, paid posts,
   brand deals or Vigen's own marketing (a template's sample): a project with `"sponsored": true` in
   meta.json skips press pages and refuses to install one. Read the
   brand's terms once and record them as `pressTerms`. Pick the product itself, not a credited
   photographer's "shot on" sample. A page built by script shows nothing: link its press-kit download page.
5. **YouTube Creative Commons** videos, for real footage of a named product or place stock doesn't have
   (a phone in hand, an unboxing, a street): on for every card. It searches with YouTube's Creative Commons filter and re-reads each video's own license: only CC BY
   ("reuse allowed") passes, ≥ 720p, landscape. Needs yt-dlp **and deno**, kept current (`brew upgrade
   yt-dlp`): an old yt-dlp only sees 360p and the search comes back empty with a note saying so.
   ```bash
   node <skill>/scripts/find-media.mjs videos/<slug> --peek <id> <n>                  # the whole video, timestamped
   node <skill>/scripts/find-media.mjs videos/<slug> --peek <id> <n> --from 560 --dur 30   # zoom into a stretch
   node <skill>/scripts/find-media.mjs videos/<slug> --pick <id> <n> --from 575 --dur 6 --owner-ok
   node <skill>/scripts/find-media.mjs videos/<slug> --pick <id> <n> --from 138.5 --owner-ok   # image card: that frame as a photo
   ```
   A 4K review is often the best product photo there is: on an **image card** (or with `--still`) a video
   candidate installs the frame at `--from` as a JPEG. Peek the whole video, then zoom (`--from … --dur 40`)
   to the exact second: a coarse peek is only good to ±half its step. Pick a frame where the square or
   panel crop (shots `focus`) leaves out the channel's watermark.
   - **The license only counts from the footage's maker.** Before `--owner-ok`, check the channel: its own
     camera work across its uploads (a reviewer, a vlogger), not re-posts, compilations, a brand's ad or
     keynote, news or TV. `!` on the sheet (and the log) marks titles that look like these.
   - **Take a section the channel filmed**: reviewers cut in brand ads and other people's clips. Pick from a
     zoomed peek, a stretch with no burned-in titles (colour names, subscribe pop-ups, a watermark) and no
     cut; the pick then writes `picked_<name>.jpg`, the section every 0.5 s: look at it.
   - CC BY needs the credit line (CREDITS.txt) in the video's description. YouTube's terms only allow
     reusing CC videos through its own editor; downloading them is a grey area: say so to the user
     before the first YouTube pick, and again when a video uses one.
6. **Generated** only after two rounds of queries find nothing, photographic, no text in the image; say
   which pictures were generated (the **media-use** skill generates images).

## Queries
- **Things a camera can film.** "Hugging Face" returns lab footage: names, logos and numbers belong on viz
  cards. Real named subjects (Dolly, a landmark) are fine: Wikimedia has them.
- 2–3 short English queries per entry. `"pd": true` adds US-government public-domain works (NASA, NIH, archives).
- **Concrete only.** The user rejected every vague stand-in: pottery hands for "nhào nặn ra một cái prompt",
  friends on a lawn for "mấy ông bạn", a woman with a phone for "mô tả sơ sơ", hands on a keyboard for "copy
  rồi dán", generic phone/like clips for a CTA. If the best result only *symbolises* the line, use a viz card
  or a ui-demo card instead.
- Prefer video for panels held longer than ~3 s; stills for quick cuts.

## Licenses
Commercial-OK licenses only (CC BY from YouTube is one), except press kits (editorial, above). Every pick is recorded in `assets/media/CREDITS.json` (keep it: it wins Content
ID disputes on public-domain footage) and `CREDITS.txt`: give the user the CC BY / BY-SA lines for the
description, and the press-kit lines (`editorialOnly`). No Pinterest, Google Images, Instagram, TikTok or
YouTube outside its CC BY filter: no license. Flipping, cropping, speeding or re-grading someone else's clip doesn't make it usable,
and isn't something this skill does to get past Content ID. An image with no CREDITS
entry in an older edit was generated: say so, replace it unless the user keeps it.

## Gotchas
- Pixabay (key) has the best stock video but sits behind a Cloudflare challenge that 429s some networks
  (calls are spaced and retried; failed queries are logged with `!`). Openverse is images-only and often times
  out (skipped after one). Wikimedia is reliable and the only source for named subjects; check long videos,
  the sheet frame may not be what plays.
- Videos > 120 s and media < 900 px or narrower than 1.15:1 are dropped; picked videos are cut to 30 s.
