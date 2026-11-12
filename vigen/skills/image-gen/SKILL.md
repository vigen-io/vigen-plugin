---
name: image-gen
description: Generate images with Vigen's image generation API (paid in Vigen credits), or locally with the user's own Gemini API key. Mainly for koi "looks": the user's koi in another set, pose, outfit or camera angle (lying on a lawn shot from above, seated in a garden, a low-angle close-up), kept as the same person from their koi photo, so a template with several camera setups can lipsync each one. Also for a still a template asks to be generated. Use when a template needs koi looks, or the user asks to generate or edit an image, or to set up their own Gemini key.
---

# Image generation

`<skill>` = this skill's base directory. One script, JSON on stdout, `{"error":{"code",…}}` and exit 2 on
failure:

```bash
node <skill>/scripts/imagegen.mjs auth status
node <skill>/scripts/imagegen.mjs estimate [--model standard|pro|lite] [--size 1K|2K|4K] [--refs N]
node <skill>/scripts/imagegen.mjs generate --prompt-file <p.txt> --out <file.png> \
  [--ref <img>|asset:<id>]... [--aspect 9:16] [--size 1K] [--model standard|pro|lite] [--via vigen|gemini]
```

## 1. Who pays (first use)

`auth status` shows both ways:

- **Vigen credits** (`vigen`): Vigen's image generation API, on the user's Vigen account (the **vigen**
  skill's API key). The expected credits are held when the request starts and settled to what Gemini billed
  (the result says how many). A failed request costs nothing; a blocked one (no image) costs the few tokens
  Gemini read and thought, usually well under a credit. One image at a time per account. `estimate` gives
  the expected credits.
- **Their own Gemini key** (`gemini`): the image is made from their computer with Google's Gemini API, which
  bills them directly; nothing goes through Vigen. Keys come
  from https://aistudio.google.com/apikey. `auth set-gemini <key>` checks the key and saves it to
  `~/.config/vigen/gemini.json` (readable only by the user); `GEMINI_API_KEY` in the environment overrides
  it. Once saved, don't repeat the key back or log it.

Without `--via`, a saved Gemini key is used (the user added it to use it), else Vigen credits. The first
time, ask which way they want (in their language), with what one image costs each way (`estimate`: `credits`
for Vigen, `usd` on their key).

**Say the cost before generating.** Give the number of images and the estimated credits (or USD) against
their balance (`vigen.mjs auth status` → `account.credits`), and get a yes. Retakes cost the same again.

## 2. Models and sizes

| `--model` | good for | sizes | ≈ credits per image (Vigen, 2 references) |
|---|---|---|---|
| `standard` (default) | looks, up to 4 people references | 1K, 2K, 4K | 22 at 1K, 33 at 2K |
| `pro` | the hardest likenesses, text in the image | 1K, 2K, 4K | 45 |
| `lite` | cheap drafts, no references | 1K | 11 |

A koi look only needs `--size 1K` (768×1376 at 9:16, about Vigen's ideal 720×1280 avatar frame). Use `2K` when
the frame is shown large without lipsync (a cover). Standard at 1K is the model for looks; pro is for text in an
image or a likeness standard keeps missing, and it misreads top-down poses.

## 3. Koi looks: the same person in another set

A **look** is another avatar of a koi (same voice, `vigen.mjs koi add-look`). A template with several camera
setups (garden-storytime) lipsyncs each part of the script in the look of its setup. Make a koi's looks once
and reuse them on every video in that template.

### First: the looks this koi already has for the template

Before generating anything, run (from the **vigen** skill's directory):

    vigen.mjs koi looks <koiDir> --template <template>

Looks are named `<template>-<look>` (`quick-take-presenter`), so this finds the template's looks in the koi
folder (`saved`), the koi's avatars for the template on the vigen.io account that the folder lacks
(`onAccount`, made from another project), and older looks saved without a template (`untagged`). When any
exist, show them (the `frame` files, or `imageUrl`) and ask in the user's language: use these, or make new ones?
Generating is the fallback, never the default: make only the looks that are missing, or the ones the user
turns down. One from `onAccount` is brought in for free: `koi add-look <koiDir> --template <template> --look
<name> --avatar <avatarId>`.

### The formula: recreate a shot, don't describe it

The model matches a shot it is **shown** far better than one described in words. Every look is made from two
references and one prompt pattern:

- **image 1: a crop of the koi's head** (face and hair, a little neck, nothing else: look at `frame.*` and
  cut it with `ffmpeg -i frame.png -vf crop=w:h:x:y head.jpg`): who the person is. The whole photo is the
  wrong reference: its scene, outfit and pose can win over image 2 (a koi photographed in a restaurant came
  back in the restaurant, image 2 ignored; the same two with a head crop came out right).
- **image 2: the shot**: one frame of the setup to recreate (the template's `shots/<look>.jpg`). It carries the
  camera angle and height, the distance and framing, the pose and hands, the set and props, and the colour
  and light. Not the outfit: the koi wears their own clothes (`{{outfit}}`, below). A frame with words or
  drawings over it is cleaned first (an edit: "remove every piece of text and every drawn mark… change nothing
  else"), or the model copies them.

```text
Recreate image 2 as a new photo, with the person from image 1 in it. Image 1 is only a reference for who the person is (a close-up of their head): ignore anything else in it. The result is image 2's scene, with its person replaced.

Copy image 2 for everything about the shot: the camera angle and height, the distance and framing (how big
the person is in the frame and where they sit in it), the pose, the hands and what they hold, the set and
props, and the colour, light and film look: match image 2's colours, brightness and softness
exactly.

Take only the person's identity from image 1: their face, skin tone, build, and their hair's length, cut and
colour. It must clearly be the person in image 1, not the person in image 2. The hair keeps its own length
and cut, {{hair}}.

Outfit: {{outfit}}. They wear this, not the clothes of the person in image 2, fitted naturally to image 2's
pose.

The face is fully visible and sharp, lips gently closed with a calm, pleasant expression (no teeth showing),
eyes looking into the lens. The phone never covers the mouth. Exactly one person. No text, no captions, no
drawings, no logos, no app interface, no watermark. Photorealistic, vertical 9:16.
```

Say the koi's hair length outright, against the shot's ("a shoulder-length bob that ends at the shoulders, much
shorter than the hair in image 2"): with only "keeps its own length", a long-haired shot gave a short-haired
koi long hair. `{{hair}}` is the one line a look adds (a template's `looks.json` gives it), e.g. "neat, smooth and glossy",
or for a lying shot "lying smoothly on the grass around the head in soft, glossy strands, fanned out a little
like the hair in image 2 (not spiky, not frizzy, not sticking up)".

`{{outfit}}` dresses the koi in **their own clothes, from their koi photo**, in every template: a look is the
user in a new set, not the user in the template creator's clothes. The head crop shows no clothes, so the
outfit goes in words: look at `frame.*` and name each garment with its colour, fabric or pattern, neckline and
fit ("a fitted black crew-neck T-shirt and a thin silver chain"). Colour words are right here (the rule
against them is about the set and light, which the shot carries).
- **The shot shows more than the photo** (a full-length lying shot from a chest-up photo): finish the outfit
  with plain pieces that go with what's visible ("…, with straight mid-blue jeans and white sneakers").
- **One outfit per koi per template:** the same `{{outfit}}` sentence in every look, so the clothes don't
  change at a cut. Saved looks keep theirs; a new look matches the ones already made.
- **The template's constraints win:** a green-screen shot (quick-take) can't take green clothes, which key
  out; a template's `looks.json` says what its shots can't take. Change the colour to the nearest that works
  and say so.
- **Other choices:** the shot's own clothes only when the user asks ("Outfit: exactly the clothes the person
  in image 2 wears"), or an outfit the user names. A photo too tight to show the clothes: ask what to wear.
- Plain clothes, no logos or printed words (the image must have no text).

What this replaced, and why it failed (don't go back to it):
- **Describing the shot** ("top-down, body diagonal, face a quarter of the frame…"): the model centres and
  straightens the person whatever the words say, and guesses the distance.
- **Colour words** ("lush muted greens", "pale sunlit yellow-green", "warm"): any colour adjective
  overshoots (emerald lawns, then straw). The shot carries the colour; the prompt only says "match image 2".
- **The koi's own look as the outfit reference**: its composition leaks in (a centred wide look made every
  later look centred).
- **The whole koi photo as image 1**: its own scene can replace the shot; crop the head.
- **Pro** (`--model pro`): twice the price and it flipped top-down poses twice; standard at 1K is right for
  looks.
- **The shot's outfit on every koi** (the old default): every user came back in the template creator's
  clothes; the outfit is the koi's own, in words.
- **Fixing afterwards** (rotating, LUT grades, edits to remove stray limbs): a symptom of a bad prompt.

### Checks, every time

1. **What lipsync needs:** one person, the face fully visible and sharp, eyes to the lens, the mouth closed and
   not covered (a phone at the chin, never over the mouth), relaxed hands with natural fingers, no text or
   watermark.
2. **A calm face, not a big smile:** lips together, at most a faint closed-mouth smile, no teeth showing.
   Lipsync pulls the frame's exact pose back at the start and end of every chunk (every 2.5–5 s), so a grin
   in the frame snaps back mid-speech and fights the mouth shapes; the model adds smiles where the words call
   for them. Never write "smiling", "a warm smile" or "cheerful" in a look's prompt.
3. **Look at every result next to its shot** before using it: the same person as the koi photo (not the person
   in the shot), in the koi's outfit (not the shot's)? The shot's angle, distance, pose and colour? No stray limbs or second person? Then show the
   user the looks together. A wrong one: say what's off and retake with one change, never silently.
4. **Save it:** `vigen.mjs koi add-look <koiDir> --template <template> --look <name> --frame <file>` (from
   the **vigen** skill's directory), one after another. `--template` names the look and its avatar
   `<template>-<name>` so the next video finds it; lipsync it with `--look <template>-<name>`. Re-running it with
   an unchanged frame reuses the avatar.

`<out>.json` next to each image keeps its prompt, references, model, usage and cost: reuse it for a retake.

## 4. Other images

A template may call for a generated still (a background plate, a texture). Media found or owned beats
generated (stock-media skill): generate only what can't be found, and never an image of a real person other
than the user's own koi, a real brand's product or logo, or another creator's footage.

## Errors

| code | meaning, fix |
|---|---|
| `NO_GEMINI_KEY` / `INVALID_GEMINI_KEY` | no or bad own key: `auth set-gemini <key>` from aistudio.google.com/apikey, or use `--via vigen` |
| `INSUFFICIENT_CREDITS` | not enough Vigen credits for the estimate: buy credits (`vigen.mjs checkout credits`) or use their own key |
| `IMAGE_NOT_GENERATED` | no image came back (a safety block, or a text answer, quoted in the message): reword the prompt |
| `IMAGE_REQUEST_REJECTED` | the request was refused (bad size, aspect or image): the message says which |
| `IMAGE_GENERATION_FAILED` / `GEMINI_RATE_LIMITED` | a temporary failure, already retried: wait a minute and run again |
| `IMAGE_GENERATION_UNAVAILABLE` | Vigen's image generation is switched off for now: use their own Gemini key |
| `UNSUPPORTED_MODEL` / `UNSUPPORTED_SIZE` | see the table above |

Other codes (`INVALID_API_KEY`, `NETWORK_ERROR`…) come from the vigen skill: its `references/errors.md`.
