# Next issues

Work them in order. The design fixes (1–3) come before the new features (4–5).
Each one ends with verification and a commit, as in the redesign plan.

Context: commit `14ae7f7` added an overlay layer to every frame (stickers,
a "StormHacks 26’" title, side tagline, star and dot confetti), drawn over the
photos by `drawDecor` in `lib/print/frames.ts`. The frames before that commit
(`0e5b3d6`) had their art only in the bottom band or side column.

## Design fixes

### 1. Remove the "StormHacks 26’" title from the frames

The outlined title across the gap under the first photo isn't wanted. Delete it
(`drawTitle`, `TITLE` and the `title` field in `DECOR`) on every frame and mode.

### 2. Previous designs as the base, with the add-ons as checkboxes

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

### 3. Grid (horizontal) mode: bigger photos

- The 2×2 photos should fill more of the landscape sheet. Shrink the margins
  and the brand column (`GRID_MARGIN`, `GRID_COLUMN` in `lib/print/layouts.ts`).
- It's fine for the brand art and add-ons to overlap the photo edges a little.
- Keep the sheet 1800×1200, still rotated to 1200×1800 for the Selphy.

## New features

### 4. QR codes from the home server, not Vercel Blob

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
