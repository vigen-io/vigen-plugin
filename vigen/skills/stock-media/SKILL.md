---
name: stock-media
description: Find real, legally usable images and video clips for a video — the user's own visuals library first (labelled and searched locally), then free commercial-use stock (Pexels, Pixabay, Openverse, Wikimedia incl. public domain), as numbered contact sheets to judge, with source and license recorded for every pick. Use when an edit needs b-roll, a photo or a clip of a concrete thing, or when the user adds files to library/.
---

# Stock media — real footage you're allowed to use

`<skill>` = this skill's base directory. Keys in the workspace `.env` (optional, free): `PEXELS_API_KEY`,
`PIXABAY_API_KEY`; Openverse and Wikimedia need none. Node ≥ 20, ffmpeg.

## Order: library → free stock → (last) generated

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
3. **Free stock**: `<project>/media_queries.json`, one entry per needed picture:
   ```jsonc
   [{ "id": "dolly", "need": "Dolly the cloned sheep", "queries": ["Dolly sheep", "cloned sheep"], "kind": "image" },
    { "id": "launch", "need": "a rocket launch", "queries": ["rocket launch"], "kind": "video", "pd": true }]
   ```
   ```bash
   node <skill>/scripts/find-media.mjs videos/<slug>                       # every entry (library first, then online)
   node <skill>/scripts/find-media.mjs videos/<slug> --card dolly --q "…" --q2 "…"   # one again, new queries
   node <skill>/scripts/find-media.mjs videos/<slug> --card dolly --online          # skip the library matches
   node <skill>/scripts/find-media.mjs videos/<slug> --pick dolly 3 [--as dolly2]   # -> assets/media/dolly.* + CREDITS
   ```
   **Open every `work/media/<id>/sheet.jpg`**: right subject, no watermark, no text, no portrait framing (a
   landscape-ish panel crops them). Slow (30–90 s an entry): run all in the background and read sheets as
   they land. Nothing relevant → it prints manual sources (Destockd) for the **user** to download into
   `library/`; never script those sites.
4. **Generated** only after two rounds of queries find nothing, photographic, no text in the image; say
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
Commercial-OK licenses only. Every pick is recorded in `assets/media/CREDITS.json` (keep it: it wins Content
ID disputes on public-domain footage) and `CREDITS.txt`: give the user the CC BY / BY-SA lines for the
description. No Pinterest, Google Images, Instagram, YouTube or TikTok: no license. An image with no CREDITS
entry in an older edit was generated: say so, replace it unless the user keeps it.

## Gotchas
- Pixabay (key) has the best stock video but sits behind a Cloudflare challenge that 429s some networks
  (calls are spaced and retried; failed queries are logged with `!`). Openverse is images-only and often times
  out (skipped after one). Wikimedia is reliable and the only source for named subjects; check long videos,
  the sheet frame may not be what plays.
- Videos > 120 s and media < 900 px or narrower than 1.15:1 are dropped; picked videos are cut to 30 s.
