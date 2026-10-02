# Next issues

Work them in order. The design fixes (1–3) come before the new features (4–5).
Each one ends with verification and a commit, as in the redesign plan.

Status (2026-10-02): 1–4 are done (`531764c`, `2496751`, `b625bd5`; tagline +
confetti default to on in `824c2d7`). 5 is waiting on the Discord channel and
bot token. Open questions and later ideas are under
[Future improvements](#future-improvements) at the end.

Context: commit `14ae7f7` added an overlay layer to every frame (stickers,
a "StormHacks 26’" title, side tagline, star and dot confetti), drawn over the
photos by `drawDecor` in `lib/print/frames.ts`. The frames before that commit
(`0e5b3d6`) had their art only in the bottom band or side column.

## Design fixes

### 1. Remove the "StormHacks 26’" title from the frames (done)

The outlined title across the gap under the first photo isn't wanted. Delete it
(`drawTitle`, `TITLE` and the `title` field in `DECOR`) on every frame and mode.

### 2. Previous designs as the base, with the add-ons as checkboxes (done)

- The default print for each frame should look like the pre-`14ae7f7` design:
  only the frame's own band or column art (e.g. one Sparky on Orange).
- The overlay pieces become add-ons that guests can switch on with checkboxes:
  - stickers over the photo corners
  - side tagline ("West Canada’s Largest Hackathon ✺ Oct 3 + 4 ✺ …")
  - star and dot confetti in the margins
- The preview and the printed sheet must match whatever is ticked. The share
  copy should match too.
- To decide: where the checkboxes go (probably the Review screen, next to the
  frame swatches) and whether they reset for each new session. They must fit
  the 1024×600 kiosk layout.

### 3. Grid (horizontal) mode: bigger photos (done)

- The 2×2 photos should fill more of the landscape sheet. Shrink the margins
  and the brand column (`GRID_MARGIN`, `GRID_COLUMN` in `lib/print/layouts.ts`).
- It's fine for the brand art and add-ons to overlap the photo edges a little.
- Keep the sheet 1800×1200, still rotated to 1200×1800 for the Selphy.

## New features

### 4. QR codes from the home server, not Vercel Blob (done)

- Today the share copy goes to Vercel Blob (or a LAN `/api/share/file/` URL,
  see `lib/stripShare.ts` and `app/api/share/`). The QR code links to that.
- Instead, store strips on homeserver at `/srv/data/photobooth/`. Serve
  them from `https://gallery.example.ts.net:8443`, and make the QR code
  point there.
- To find out before starting:
  - What already runs on `:8443`, and whether there's an existing upload API or
    database schema to use.
  - Auth for uploads from the Pis.
  - Whether guests' phones can reach it. A `*.ts.net` name only resolves inside
    the tailnet unless it's exposed with Tailscale Funnel (8443 is a port Funnel
    supports). Guests won't be on the tailnet.
  - What happens to the QR code if the server can't be reached.

### 5. Discord alerts when the printer (or anything else) fails

- When a print fails (printer offline, out of paper or ink, CUPS error,
  print-server down) or the booth hits another error, post to a Discord channel
  right away.
- The Discord bot runs on the NAS (homeserver). The Raspberry Pi booths send
  their errors to the bot. Each message should include the booth name, the
  error and the time.
- Waiting on: which channel to use, and the bot token. The user will provide
  these later.
- To decide: how the Pis reach the bot (an HTTP endpoint on the tailnet seems
  simplest), and how to avoid spamming repeat alerts (e.g. one alert per error
  until it clears).

## Future improvements

### QR codes / home gallery (after issue 4)

What was found: homeserver already runs the gallery (`~/photobooth` there,
README.md + PLAN.md). It's a FastAPI app in Docker on `127.0.0.1:8000`, with
SQLite + files in `/srv/data/photobooth/` and a 30-day retention. Funnel
publishes it on `:8443`.

Since then the gallery has **upload-only keys**. Booths upload through the
public Funnel URL and don't need Tailscale. A key can only `POST /api/photos`,
expires after 3 days, and is capped at 500 uploads/day. Uploads stop when the
drive has under 20 GB free. The admin key still works only on the tailnet.
See "Upload keys" in the server README.

- **Each booth Pi needs** `GALLERY_UPLOAD_URL` and `GALLERY_API_KEY` in its
  `.env.local`. Without them it falls back to Blob/LAN.
- **Keys expire every 3 days.** Make a fresh one per booth before each event
  day (`~/photobooth/scripts/upload-key.sh create <booth>`). An expired key
  doesn't break the booth; it just falls back to Blob/LAN until it's replaced.
  The booth could show a warning when uploads start failing with 401.
- **Public vs private:** when the guest taps Print, a prompt asks whether to
  put the photos on the public site. Nothing prints or uploads until they
  answer; tapping outside the prompt goes back to Review. Anyone holding a key can still upload `public`
  photos, so if junk ever turns up, revoke that key and delete the photos
  (they're tagged with `key_id`). A moderation queue would be the next step.
- **Branding:** the gallery's `/p/<id>` page is a generic "Photobooth" page.
  The StormHacks-styled `/view` page is only used by the fallbacks. Restyle
  the gallery templates, or have the QR go to `/view` with the gallery image.
- **Retention:** 30 days for every photo. Decide if StormHacks photos should
  last longer (`RETENTION_DAYS` on the server).
- **Slow server:** the upload waits up to 15 s before falling back, so a hung
  (not down) server delays the QR. Could shorten it, or show the fallback QR
  first and swap it in.
- **Offline spool:** the server repo has `pi/booth_upload.py` with retry and a
  spool. The booth app doesn't spool. A failed upload just falls back.
- **One QR per print:** no albums or sessions. Fine for now, since the share
  copy is the whole sheet.

### Discord alerts (issue 5)

- Still needed: the channel and the bot token.
- Proposed: the Pis POST `{ booth, error, time }` to a small endpoint on
  homeserver over the tailnet (like the gallery's `:8000` setup, not
  Funnel). The bot posts one alert per error and stays quiet until that
  error clears, then posts a "recovered" message.
- homeserver already has `~/discord-bot-ctl` and `~/discord-mcp-setup`.
  Check whether the existing bot can take this on before starting a new one.

### Start screen

- The otter cycles characters on tap, but nothing tells guests they can tap
  it. Consider a small "tap me" hint or an idle wiggle.
