# Future Me — Career Photo Booth (E3)

A tablet-first kiosk web app: pick a job → snap a selfie → AI generates a grown-up portrait in that uniform → present as a printable "Future ID Card" with QR code for phone download.

## 1. Backend (Lovable Cloud)

Enable Lovable Cloud (Supabase) for edge function, storage, and secret management.

**Secret**

- `FREEPIK_API_KEY` — requested via `add_secret` after Cloud is enabled.

**Storage**

- Public bucket `future-photos` (created via storage tool). Anyone with the URL can view (needed for QR-scan phones).

**Edge function `transform**` — `POST { imageBase64, prompt } → { imageUrl }`

1. Read `FREEPIK_API_KEY` from env.
2. Strip `data:image/...;base64,` prefix.
3. `POST https://api.freepik.com/v1/ai/gemini-2-5-flash-image-preview` with header `x-freepik-api-key` and body `{ prompt, reference_images: [cleanBase64] }` → get `task_id`.
4. Poll `GET .../gemini-2-5-flash-image-preview/{task_id}` every 2.5s up to ~90s until `status === "COMPLETED"` or `generated[0]` exists. Return clear error on `FAILED`/timeout.
5. Fetch the generated image bytes, upload to `future-photos/future-<timestamp>-<rand>.png`, return `{ imageUrl }` = the bucket public URL.
6. CORS headers for browser calls.

## 2. Front-end (single-page kiosk flow at `/`)

Rewrite `src/routes/index.tsx` as the kiosk (this replaces the placeholder). State machine with 4 screens; one visible at a time, full-screen.

**Screens**

1. **Pick a job** — responsive grid of 12 rounded badge cards (emoji + title). Hover/tap lift animation.
2. **Take a photo** — `getUserMedia({ video: { facingMode: "user" } })` live preview, mirrored via CSS. Dashed circular face guide overlay. Big "Take photo" button + "Upload a photo instead" link (file input fallback, also used when camera blocked or permission denied).
3. **Generating** — captured photo dimmed, spinner, rotating messages every ~2s: "Fast-forwarding time…", "Tailoring your uniform…", "Polishing the badge…".
4. **Result** — Future ID Card + actions: Save card, Print, Scan to get your photo (QR), Try another job.

**Camera / image handling** (helper in `src/lib/photo.ts`)

- Mirror preview (`transform: scaleX(-1)`) but un-mirror capture: draw video to a canvas without flipping so the saved image is not mirrored.
- Downscale captured or uploaded image to max 900px longest edge, JPEG/PNG → base64.
- Send base64 + composed prompt to the edge function via typed helper.

**Prompt composition**

```
Transform the person in the reference photo into a friendly, realistic portrait
of that SAME person as <uniform>. Keep their face, skin tone, hair and identity
clearly recognisable. Head-and-shoulders, bright studio lighting, cheerful
expression, 3:4 portrait, clean background.
```

**Professions** — hardcoded array `{ id, title, emoji, tag, uniform }` for the 12 jobs from the brief.

**Future ID Card component** (`src/components/FutureIdCard.tsx`)

- Coral→amber gradient header with "Future ID / E3" wordmark.
- 3:4 portrait, job title (Fredoka), tag line, Issued date (today, formatted).
- Souvenir-badge feel: soft shadow, rounded, subtle inner border, holographic-ish accent.
- Wrapped in a `.print-card` root so print CSS can isolate it.

**Actions on Result**

- **Save card** — download the card as PNG (render card to canvas via `html-to-image`) OR simply download the returned portrait image; will use `html-to-image` so the saved file is the styled card.
- **Print** — `window.print()`; `@media print` in `styles.css` hides everything except `.print-card`.
- **Scan to get your photo** — `QRCodeSVG` from `qrcode.react` encoding the public bucket URL, with caption "Scan to take your photo home."
- **Try another job** — resets state to screen 1.

## 3. Design system

Update `src/styles.css`:

- Load Fredoka (display) + Nunito (body) via `<link>` in `__root.tsx` head (Google Fonts, per Tailwind v4 rules).
- Tokens (oklch): `--background` deep indigo `#191341`, `--foreground` warm white, `--primary` coral, `--accent` amber, plus `--gradient-sunrise` (amber→coral) and `--gradient-header` for the card.
- Body background: indigo with a bottom sunrise glow (radial/linear gradient on `body::before`).
- Big touch targets (min 56px), rounded-2xl badge cards.
- Respect `prefers-reduced-motion` (disable lift/spinner rotation).

Update `__root.tsx` head with real title/description/OG tags for "Future Me — E3 Career Photo Booth" and add Google Fonts `<link>` tags.

## 4. New/changed files

```
src/routes/index.tsx                — kiosk state machine (replace placeholder)
src/routes/__root.tsx               — fonts + updated head metadata
src/styles.css                      — tokens, fonts, print styles, gradients
src/components/JobGrid.tsx          — screen 1
src/components/CameraCapture.tsx    — screen 2 (getUserMedia + upload fallback)
src/components/Generating.tsx       — screen 3
src/components/FutureIdCard.tsx     — the card
src/components/ResultScreen.tsx     — screen 4 (card + actions + QR)
src/lib/professions.ts              — 12 jobs config
src/lib/photo.ts                    — downscale, mirror/unmirror helpers
src/lib/transform.ts                — calls edge function
supabase/functions/transform/index.ts — edge function
supabase migration                  — creates `future-photos` public bucket via storage tool
```

New deps: `qrcode.react`, `html-to-image`.

## 5. Technical notes

- Front-end never calls Freepik directly; only calls the `transform` edge function via the Supabase client.
- Errors from `transform` (timeout, FAILED, camera denied) are surfaced with a friendly retry UI on the current screen.
- All colors go through semantic tokens; no raw hex in components.
- The edge function returns the permanent Supabase Storage public URL, which is what appears in the card image, Save action, and QR code.

## 6. Setup steps I'll need from you

1. Enable Lovable Cloud (I'll trigger this).
2. Provide your **Freepik API key** when I open the secret form — get it from [https://freepik.com/api](https://freepik.com/api) → Dashboard → API Keys. - API Key: MSf7c2529aed8940f89e85a0f71fd1b4b8