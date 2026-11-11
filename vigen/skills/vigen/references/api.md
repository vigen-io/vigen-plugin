# Vigen API reference (what the skill uses)

`scripts/vigen.mjs` wraps all of this; call the API directly only for
something the CLI doesn't cover: `node vigen.mjs rpc <method> '<inputJson>' '<mappingsJson>'`.

- **Endpoint:** `POST https://server-api.vigen.io/json-rpc`
- **Auth:** `Authorization: ApiKey lk_…` (keys from https://vigen.io/api-keys)
- **Request:** `{ "method": "...", "input": {...}, "mappings": {...} }`. `mappings`
  is optional and resolves related records inline, e.g. `{ "output": 1 }`.
- **Success:** `{ "result": ... }`
- **Failure:** HTTP 200 with `{ "error": { "message", "code", "data" } }`.
  `code` is the error class (`InputError`, `AuthorizationError`, …). The
  stable code is usually a prefix of `message`, e.g.
  `"INSUFFICIENT_CREDITS: …"`. See errors.md.

## Account

| method | input | result |
|---|---|---|
| `getUserInfo` | `{}` | `{ user: { email, subscriptionTier, subscriptionExpiration, credits, ... } }` |
| `listSubscriptionPlans` | `{}` | `{ plans: [{ id, name, price, credits, duration }] }` |
| `createSubscriptionCheckout` | `{ subscriptionPlanId }` | `{ payment: { checkoutUrl, ... } }`: adds the plan's credits and extends the expiry |

`subscriptionTier` is `"free"` on the free plan, one job at a time. Lipsync
costs 1 credit per second and TTS 0.0064 credits per character, both deducted
when the work finishes. Credits expire with the plan.

## Uploads

1. `createUpload` `{ type: "image" | "audio", fileName, metadata: { type: <mime>, size, originalName } }` → `{ uploadUrl, cdnUrl, asset }`
2. `PUT uploadUrl` with header `Content-Type: <mime>` and the raw bytes
3. `finalizeUpload` `{ assetId }` → `{ asset }` (`status: "ready"`; audio gets `duration`)

Audio over 10 minutes is rejected (`AUDIO_TOO_LONG`).

## Avatar

| method | input | result |
|---|---|---|
| `createAvatar` | `{ name, imageAssetId }` | Avatar `{ id, name, imageId }`, usable right away (no polling) |
| `getAvatar` | `{ avatarId }`, mappings `{ image: 1 }` | Avatar with `image.cdnUrl` |

The photo decides most of the result: one person facing the camera, face and
mouth fully visible, framed the way the whole video should look. Recommended
size: 720x1280 (portrait) or 1280x720 (landscape).

## Template handoff

| method | input | result |
|---|---|---|
| `getTemplateHandoff` | `{ handoffId }`, mappings `{ avatar: { image: 1 }, voice: 1, voiceSample: 1, reference: 1 }` | `{ template?, referenceAssetId?, avatarId, voiceId?, voiceSampleAssetId?, language, text, avatar, voice, voiceSample, reference }`: what the user picked in a template's Recreate wizard on vigen.io. A template slug, or (no `template`) a video the user uploaded to learn a new template's style from. `text` is what they typed: a finished script or just an idea. Only the account that made it can read it. `vigen.mjs handoff <id>` wraps this. |

## Image generation

| method | input | result |
|---|---|---|
| `generateImage` | `{ prompt, referenceAssetIds?, model?, aspectRatio?, imageSize? }` | `{ asset, credits, model, usage, text? }`: a generated image saved as an image asset (usable as `createAvatar`'s `imageAssetId`) |

- `referenceAssetIds`: up to 6 of the user's own image assets (uploads or earlier results), sent in order.
- `model`: optional, the default model when left out; `imagegen.mjs` sets it from `--model standard | pro | lite`
  (`lite` is 1K only).
  `aspectRatio` default `9:16`; `imageSize` `1K | 2K | 4K`, default `2K`.
- Charged in credits after the image is saved (`credits` in the result). A blocked or failed generation costs
  nothing. Before generating, the balance must cover an estimate of one image (`imagegen.mjs estimate`).
- The image-gen skill's `imagegen.mjs` wraps this (and the user's-own-key path).

## Voice

| method | input | result |
|---|---|---|
| `isolateVoice` | `{ assetId }` | `{ asset }`: new MP3 asset with background music/noise removed. Send ≤30s. |
| `transcribeAudio` | `{ assetId, language? }` | `{ text }`. Omit `language` to auto-detect. |
| `cloneVoice` | `{ name, assetId, language, transcription?, description?, tags? }` | Voice `{ id, name, language, modelInfo: { model: "akiTTS", transcription, ... }, sampleAsset: null }` |
| `listMyVoices` | `{}` | `{ voices }` (own cloned voices) |
| `listVoices` | `{ language?, gender?, q?, limit?, startingAfter? }` | `{ voices, nextCursor? }` (public voice library) |
| `createTtsAudio` | `{ text, voiceId, language? }` | `{ asset }`: MP3, ready for lipsync. Long text is split into sentences and merged. 0.5 credits/character once the TTS quota is used up. |

**Clone clip:**
- 5–15s of clear speech from one speaker, no background music.
- `transcription` must match what is said; the closer it matches, the closer the cloned voice.
- The voice's sample preview (`sampleAsset`) is generated a few seconds after cloning.

**Transcription languages:** vi, en, ja, ko, zh, yue, th, id, ms, fil, ar, cs,
da, de, el, es, fa, fi, fr, hi, hu, it, mk, nl, pl, pt, ro, ru, sv, tr. Other
languages still clone, but auto-detect transcription may be weaker.

## Lipsync

| method | input | result |
|---|---|---|
| `createLipSyncJob` | `{ id: <new UUID>, avatarId, audioId, name?, prompt?, customInstructions?, transcript?, seed? }` | Job `{ id, status: "pending", prompt?, customInstructions?, transcript?, seed?, ... }` |
| `getLipSyncJob` | `{ jobId }`, mappings `{ output: 1 }` | Job `{ status, progress, error?, output?: { cdnUrl }, render? }` |

`prompt` is a lipsync prompt template filled in per chunk of up to 10 seconds: it
must contain `{{text}}`, may use `{{language}}`, and is at most 6000
characters. Any other `{{…}}` gives `INVALID_PROMPT`. Without it, the default
prompt is used. See prompting.md.

`customInstructions` is a list of `{ timestamp | start + end, instruction,
textHint?, pinChunk?, pinImageUrl?, detectFlicker?, detectDesync?, detectGlitches? }`:
- times are in seconds from the start of the audio;
- `instruction` and `textHint` are at most 1000 characters each;
- each item must start before the audio ends.

Each one is appended to the prompt of every chunk it falls in, except a
**pinned chunk**: a range with `pinChunk: true` is rendered as its own chunk,
cut exactly at `start` and `end`, and its instruction is that whole chunk's
(sent as `When speaking "<textHint>": <instruction>`). Its first and last frame
are pinned to the avatar's image (or to `pinImageUrl`: the same person in the
same shot, in the pose the moment starts and ends in), with no pin inside it.
A pinned range lasts 1–9.375 s; pinned ranges must not overlap, and touching
ones must pin the same image. With your own `prompt`, the pinned instruction is
added on its own line after it, so keep gesture wording that would contradict
it out of the prompt. Malformed items give `INVALID_INSTRUCTIONS`.

`detectFlicker`, `detectDesync` and `detectGlitches` set to `false` on an item
turn that check (and its re-renders) off for the chunks the item goes to; only
`false` has an effect.

`transcript` is a list of `{ text, start, end }`, the spoken words or phrases in
seconds from the start of the audio, in order and not overlapping
(`INVALID_TRANSCRIPT` otherwise). It skips the model's own transcription, so every chunk
gets exactly these words; `{{language}}` is then empty.

`render` on a finished job is the render report: `item` (chunks, pins, transcript
source, prompt source, seed, `checks`) and `metrics` (per chunk: words, the
instruction lines it got, `pinned`, `checks_off`, every take's scores,
`kept_attempt`).

`seed` is an integer (42 when unset); the same inputs and seed give the same
take (`INVALID_SEED` otherwise). **Give every generation a new seed**, and
record it: reuse one only to reproduce a take the user picked. See
directing.md and gestures.md.

`status` goes `pending` → `queued` → `processing` → `completed` | `error`.
Poll every 5 seconds. When it's `completed`, `output.cdnUrl` is the MP4. On
`error`, `error` reads `"<message> (Error code: X)"`.
