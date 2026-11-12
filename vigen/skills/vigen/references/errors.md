# Vigen errors: what to tell the user

`vigen.mjs` prints failures as `{"error": {"code", "message", ...}}` and exits 2.
`message` is often raw Vietnamese text from the server. Never paste it as-is.
Explain the problem in the user's language: the vi/en lines below come from
the Vigen web app, and for other languages translate their meaning. Give the
fix and the link, and offer the next step yourself when you can (for example
create the checkout link). Never show the API key.

Web links: plans `https://vigen.io/subscription` · billing
`https://vigen.io/billing` · videos `https://vigen.io/videos` · API keys
`https://vigen.io/api-keys`.

## Account and payment

| code | vi | en | fix |
|---|---|---|---|
| `NO_API_KEY` | Chưa có API key Vigen. | No Vigen API key yet. | Show the API key guide in SKILL.md, then `auth set`. |
| `INVALID_API_KEY` | API key không hợp lệ hoặc đã bị thu hồi. | The API key is invalid or revoked. | Ask for a new key from https://vigen.io/api-keys (it is shown only once when created), then `auth set`. |
| `SUBSCRIPTION_REQUIRED` | Tính năng này chỉ dành cho người dùng có gói premium. Vui lòng đăng ký gói để tiếp tục. | This feature is only available for premium users. Please subscribe to continue. | Send https://vigen.io/subscription. On the free plan, uploading lipsync audio also fails once the free lipsync minutes are used up. Without a plan, suggest `lipsync --audio <file>` if they only lack TTS. |
| `INSUFFICIENT_CREDITS` | Bạn không đủ credits để thực hiện tác vụ này. Mua thêm credits để tiếp tục. | You don't have enough credits to perform this action. Purchase more credits to continue. | The message includes how many are needed and how many are left (1 second of lipsync = 1 credit, 1 TTS character = 0.0064 credits; credits are taken when a job or request starts and come back if it fails or is cancelled). Run `checkout credits` and give the `checkoutUrl` (one pack: +10,000 credits for 30,000 VND). Alternatives: shorter text, or `--audio` with their own recording. |
| `ACCOUNT_DISABLED` | Tài khoản này đã bị vô hiệu hoá. | This account has been disabled. | Email/password accounts are only valid when made by Vigen's agent. Ask them to sign in on https://vigen.io with Google and create a key there, then `auth set`. |
| `PAYMENT_MAINTENANCE` | Thanh toán đang bảo trì, vui lòng quay lại sau. | Payments are under maintenance, please come back later. | No checkout link is possible right now. Say so, point to https://vigen.io/billing for later, and offer the alternatives above. |

## Limits

| code | vi | en | fix |
|---|---|---|---|
| `LIPSYNC_JOB_IN_PROGRESS` | Bạn đang có một video đang được tạo. Vui lòng chờ hoàn tất trước khi tạo mới. | You already have a video being created. Please wait for it to finish before creating a new one. | Free plan: 1 job at a time. Paid plans: up to 10 queued. Wait, or follow the running job with `job <jobId>` / https://vigen.io/videos, then retry. |
| `AUDIO_DURATION_UNKNOWN` | Không đọc được độ dài âm thanh. | The audio's length couldn't be read. | Lipsync is charged by duration. Re-encode the file or use another one. |
| `LIPSYNC_DURATION_EXCEEDED` | Âm thanh dài hơn thời gian lipsync còn lại của bạn. Nâng cấp gói premium để tạo video dài hơn. | The audio is longer than your remaining lipsync time. Upgrade to premium for longer videos. | Free plan only. `auth status` shows `credits` (1 credit = 1 second). Shorten the text or audio, or upgrade at https://vigen.io/subscription. |
| `INVALID_PROMPT` | Prompt không hợp lệ. | The prompt template is invalid. | The message says why: missing `{{text}}`, a variable other than `{{text}}`/`{{language}}`, or over 6000 characters. Fix the template (see prompting.md). `vigen.mjs` checks this before spending TTS credits. |
| `INVALID_INSTRUCTIONS` | Chỉ dẫn theo thời điểm không hợp lệ. | A timed instruction is invalid. | The message names the item and the problem (no instruction, neither a timestamp nor a start and end, a time outside the audio, over 1000 characters). Fix the plan; see directing.md. |
| `INVALID_SEED` | Seed không hợp lệ. | The seed is invalid. | Use a whole number from 0 to 2147483647. |
| `TEXT_TOO_LONG` | Văn bản quá dài. | The text is too long. | One TTS call takes at most 10,000 characters (about 10 minutes of speech). Split the script into parts (`parts.mjs` does). |
| `AUDIO_TOO_LARGE` | Tệp âm thanh quá lớn. | The audio file is too large. | Over 200 MB. Re-encode it to MP3 (`ffmpeg -i in -ac 1 -q:a 2 out.mp3`) and upload that. |
| `AUDIO_TOO_LONG` | Âm thanh không được dài quá 10 phút. Vui lòng chọn file ngắn hơn. | Audio must not exceed 10 minutes. Please choose a shorter file. | Split it into several videos of 10 minutes or less. |
| `GENERATION_IN_PROGRESS` | Bạn đang có một yêu cầu tạo giọng nói hoặc ảnh khác. | Another voice or image generation is running on this account. | One TTS or image generation runs per account at a time. `vigen.mjs` waits up to 15 minutes by itself; seeing this means something else (the web app, another session) has held it that long. Run generations one after another. |
| `RATE_LIMITED` | Bạn đã dùng quá nhiều lần, vui lòng thử lại sau. | Too many requests, please try again later. | `cloneVoice` (10/hour), `isolateVoice` (30/hour) and `transcribeAudio` (300/hour) are free but capped per account. The message says how many minutes to wait. |
| `AVATAR_IN_USE` | Avatar đang có video đang được tạo. | This avatar has a video still being made. | An avatar can't be deleted while one of its jobs is unfinished. Wait for it, or cancel it, then delete. |

## Template handoff

| code | vi | en | fix |
|---|---|---|---|
| `HANDOFF_NOT_FOUND` | Không tìm thấy yêu cầu này trong tài khoản Vigen của bạn. | This request isn't in your Vigen account. | The saved API key belongs to another Vigen account than the one signed in on vigen.io (or the id was cut off). Ask them to check which account they used, set that account's key from https://vigen.io/api-keys with `auth set`, and run `handoff` again. |
| `HANDOFF_INCOMPLETE` | Ảnh nhân vật hoặc mẫu giọng chưa sẵn sàng. | The character photo or voice sample isn't ready yet. | Retry in a minute; if it persists, pick the character or voice again on vigen.io and press Generate in Claude again. |

## Voice and avatar

These come without a code prefix. Match on the message.

| message contains | meaning | fix |
|---|---|---|
| `Không nhận diện được lời nói` | No speech recognized in the clone clip. | Isolate the voice, try the next window from `analyze`, or ask for a clearer recording. |
| `Không có nội dung để đọc` | The TTS text has nothing speakable (only emoji or symbols). | Ask for real text. |
| `Voice not found` / `Avatar not found` / `Avatar has no image` | The koi points to a voice or avatar that no longer exists (for example deleted on the web). | Re-create it with `koi set-voice` / `koi set-avatar` (that koi's saved frame and voice sample can be reused). |
| `Asset must be an image file` | The frame isn't an image. | Ask for a JPG, PNG or WebP photo. |
| `Not authorized` | The file belongs to another account (for example a different API key). | Upload it again with the current key. |
| `Internal server error` | Unexpected server failure (for example the transcription, isolation or TTS service is down). | Retry once after a short wait. If it fails again, tell the user it's a Vigen-side problem and to try later. |

## Lipsync job failures

A job that fails during processing has `status: error`. `vigen.mjs` returns its
`(Error code: …)` as `code`, with the job id.

| code | meaning | fix |
|---|---|---|
| `AVATAR_OUTDATED` | The avatar was made with an older processing version. | `koi set-avatar <koiDir>` (reuses the saved frame), then retry. |
| `JOB_TIMEOUT`, `PROVIDER_ERROR`, `ASSET_DOWNLOAD_FAILED`, `JOB_TRACKING_LOST` | Temporary processing problem. | Retry once. If it repeats, tell the user to try later. |
| `SERVICE_UNAVAILABLE` | That feature is temporarily unavailable. | Try later. |
| `CONCURRENCY_LIMIT` | Only one job at a time on this plan. | Wait for the other job to finish. |
| `CANCELLED` | The job was cancelled (for example on the web). | Start it again if they still want it. |
| `INVALID_INPUT`, `PROCESSING_FAILED`, `JOB_FAILED` | The job can't be completed. | Tell the user to contact Vigen support with the job id. |

## Local problems (from the scripts)

| code | fix |
|---|---|
| `FFMPEG_MISSING` | Tell the user to install ffmpeg (the error lists the command per OS). |
| `FILE_NOT_FOUND` / `UNSUPPORTED_FILE` | Ask for the right path. Images: jpg, png, webp. Audio: mp3, wav, m4a, aac, ogg, flac, webm. |
| `AUDIO_TOO_SHORT` / `analyze` gives `tooShort: true` | The voice clip needs at least 5 seconds of speech; ask for a longer recording. |
| `UPLOAD_FAILED` / `DOWNLOAD_FAILED` / `NETWORK_ERROR` | Check the connection and retry. If the message says the host is blocked or not in the allowed domains, this is a sandbox (Claude chat, Cowork or a cloud environment), not the user's computer: SKILL.md § 0, send them to the Code tab instead of the allowlist. |
| `JOB_WAIT_TIMEOUT` | Still processing after 30 minutes. Resume later with `job <jobId> --koi <koiDir>`, or check https://vigen.io/videos. |
| `BAD_PLAN` | The plan file is malformed: no segments, a text segment without text, an audio segment without `start < end`, or a moment whose `words` aren't in its segment's text. It's caught before any TTS is spent. Fix the plan. |
| `KOI_NOT_FOUND` / `KOI_INCOMPLETE` | Pick another koi, or finish this one with `koi set-voice` / `koi set-avatar`. |
| `LOOK_NOT_FOUND` | The koi has no look of that name (`looks` lists the ones it has; a template's look is named `<template>-<look>`): `koi looks <koiDir> --template <template>` for one on the account, else make it (image-gen skill) and `koi add-look --template`, or fix the name in `looks.json`. |
