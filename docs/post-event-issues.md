# Post-event issues (StormHacks, 2026-10-03/04)

Problems found running the booth at the event. 1–3 are software fixes.
4–7 are hardware or design changes to the case (CAD in
`Documents/Photobooth CAD/selphy-display-box`), noted here so they don't
get lost. Each fix ends with verification and a commit, as in the redesign
plan.

Status (2026-10-11, branch `post-event-fixes`, not merged): the software fixes for
items 1–3 are done, one commit per part. Each was checked with fake hardware and in
Playwright; none has run on the Pi or with the real camera or printer.

- **1 Camera** (`a4f68ca`): the Pi script watches the frame counter and restarts a
  stalled feed. A Canon that never gives a frame is reset, and after three tries the Pi
  Camera takes over until the Canon is unplugged. Source switches wait out a USB drop.
  The booth reopens the stream after a dropped track, restarts a frozen feed, and never
  captures a shot from a frame older than 1.5 s. Checked with 10 harness scenarios for the
  script and Playwright runs for freezes, drops, warm-up and a missing camera.
- **2 Printer** (`0cb25e9`, `cac3ba3`): jams, paper, ink and covers are read from CUPS, and
  a print in those states queues instead of failing. The staff panel (five taps in the
  top-right of the Scan screen, then the PIN) shows the queue and can cancel, clear,
  resume and reprint. Checked with fake CUPS commands and Playwright. The CUPS state text
  is modelled on CUPS 2.x, not captured from the Selphy.
- **3 Wi-Fi and kiosk exit** (`b5d6415`, `916f351`): the staff panel has a Wi-Fi tab
  (scan, join, on-screen keyboard) and a Booth tab. "Leave booth" stops the kiosk, and the
  Back to Booth launcher on the desktop starts it again. Checked with fake nmcli and pkill
  and Playwright. Not checked on the Pi: real nmcli output, the polkit rule, the launcher's
  pgrep match, and leave and return on the kiosk.

To deploy: copy `deploy/pi/photobooth-webcam.sh` to `/usr/local/bin/` and restart the
webcam service, install both polkit rules and `back-to-booth.desktop`, and set
`STAFF_PIN` (4–8 digits) in `.env.local`. Then restart `photobooth`. `deploy/pi/README.md`
has the details.

Open:
- WEP networks are refused, because the WPA length rule applies to them too. A venue that
  only has WEP would need that decided.
- The Wi-Fi password is passed to `nmcli` on its command line, so another local user could
  read it from `/proc` during a join.
- Not built: the hotspot and captive-portal fallback for boot with no known network.
- Item 5 (Discord alerts) still waits on the channel and bot token. Items 4–7 are case and
  CAD work.

## Software

### 1. Camera doesn't recover after it dies or sits idle

When the DSLR's battery died, or the booth sat idle for a while, the live
view didn't come back on its own. Each time it took a manual fix (asking
Claude) to get it working again.

**Evidence:** the camera reconnect sessions and their debugging logs should
be on **laptop** (the Claude Code history under `~/.claude/projects/`
there). They aren't on desktop or homeserver. Start there to find out
what was run to bring the camera back. The Pi (booth-pi) also has:

- `/var/log/photobooth-webcam.log` (written by `photobooth-webcam.sh`)
- `journalctl -u photobooth-webcam -u photobooth --since 2026-10-03`

**Likely causes, from reading the code:**

- `deploy/pi/photobooth-webcam.sh` only moves on when the
  `gphoto2 --capture-movie | ffmpeg` pipeline *exits*. If the camera stalls
  but stays on USB (live view timeout, auto power-off half-state), gphoto2
  can hang without exiting. `/dev/video42` stays open with no new frames, so
  the feed freezes and nothing restarts it. There's no frame watchdog.
- Canon auto power-off drops the camera from USB, so the script falls back
  to the Pi Camera and kills Chromium. When the DSLR wakes up it kills
  Chromium again. The source keeps flipping and the kiosk keeps restarting.
- `useCamera` (`components/booth/hooks.ts`) calls `getUserMedia` once and
  keeps the stream. It doesn't listen for the track's `ended`/`mute` events,
  doesn't spot a frozen frame, and never asks for the camera again. Only a
  Chromium restart gets a fresh stream.
- gvfs (`gvfs-gphoto2-volume-monitor`) can grab the camera when it comes
  back on USB and block gphoto2. Check that it's masked on the Pi.

**Fix ideas:**

- A watchdog in the webcam script: if `/dev/video42` hasn't had a new frame
  in about 5 s, kill the pipeline, run `gphoto2 --reset`, and restart it.
- In the app: watch the track's `ended`/`mute` events plus a frame check
  (`requestVideoFrameCallback`). If either fires, stop the stream and call
  `getUserMedia` again with backoff. Show a "Reconnecting camera…" state.
- Turn off auto power-off on the camera. Use a dummy-battery DC coupler so
  the battery can't run out.
- Wait a few seconds before switching sources, so a brief USB drop doesn't
  restart the kiosk.

### 2. Printer jams: no detection, recovery or status

After a jam there was no sign of when it had been cleared or when the next
print would start. Staff couldn't do anything from the booth either.

Today, `print-server/index.mjs` polls `lpstat`/`lpq`. It can run
`cupsenable` + `cupsaccept` (`resumePrinter`). The only way to trigger that
is tapping the small printer chip on the Review screen
(`ReviewScreen.tsx` → `printer.resume()`), and guests don't know it exists.

**To do:**

- Detect jams and errors from CUPS job and printer state (`printer-state-reasons`,
  the Gutenprint backend's messages, stopped jobs). Show the guest a clear
  "Printer jammed — staff are on it" message.
- Detect when the jam clears (printer back to idle/processing, queue moving)
  and show "Printing your strip now…", or how many jobs are ahead of theirs.
- A staff/admin panel: a hidden gesture or PIN on the kiosk, and/or a page on
  the tailnet. It should show the queue, with resume, cancel, reprint and
  clear-queue buttons.
- Connects to issue 5 in `next-issues.md` (Discord alerts on printer errors).

### 3. No way to connect to Wi-Fi while in kiosk mode

Chromium runs full-screen in `--kiosk` (`deploy/pi/photobooth-kiosk.sh`).
With no desktop to reach, you can't join a new network at a venue.

**Options (pick one or both):**

- A Wi-Fi screen in the staff panel (issue 2): scan and connect through a
  print-server endpoint that wraps `nmcli dev wifi list` /
  `nmcli dev wifi connect`. It needs a small polkit rule like
  `50-photobooth-pcsc.rules`, and staff-only access.
- A way out of kiosk mode: a staff gesture or PIN that kills Chromium and
  pauses `lwrespawn`, so the labwc desktop and its network applet are
  reachable. Add a "back to booth" desktop shortcut.
- Fallback: if no known network is found at boot, start a hotspot with a
  captive setup page (as `comitup`/`wifi-connect` do).

## Hardware / case (no code fix)

### 4. Camera can't be tilted, so framing is often poor

The camera screws straight onto a fixed mount. Redesign it: keep the same
tripod-screw attachment, but onto an **adjustable mount** (tilt at least,
ideally height/pan too) that locks firmly.

Research notes:

- **Photoism / Life4Cuts-style studios:** no source found that gives their
  exact camera model, lens or orientation. Worth checking in person at a
  booth (look behind the glass above the screen). What *is* consistent: the
  camera sits fixed behind glass just above the screen, the backdrop and
  lighting are fixed too, and guests stand on a marked spot. The framing
  works because the booth controls distance and height, not because guests
  aim the camera.
- **Orientation:** standard booths shoot landscape for groups. Mirror booths
  and full-body booths mount the camera portrait. The camera orientation has
  to match the template's photo slots
  ([Breeze](https://www.breezesoftware.com/lessons/shooting-in-portrait),
  [Photo Booth Graphics](https://photoboothgraphics.com/which-templates-works/)).
  This booth shoots 4:3 landscape for both strip and grid
  (`lib/print/layouts.ts`).
- **Height and tilt:** put the lens at eye level or slightly above, about
  1.7–1.8 m, with a slight (1–3°) downward tilt. Shooting from below looks
  bad ([Simple Booth lighting guide](https://www.simplebooth.com/blog/photo-booth-lighting-guide/)).
  A booth on a table pointing up at people is the usual cause of bad framing.
- **Lens:** commercial booths often use a short zoom, e.g. Canon R100 +
  15–45 mm, about 24–72 mm full-frame equivalent, so one booth can cover a
  single face or a group
  ([HootBooth](https://hootboothphotobooth.com/products/hootbooth-mini-dslr-eventpro-photo-booth-greenscreen-gif-video-social-prints)).
  Very wide settings close up distort faces. Shooting from further back at a
  longer focal length looks better.

### 5. Top lid blocks the power button

The top lid sits over the printer's power button, so you can't reach it.
Move the lid, add a cut-out, or add a push-through button.

### 6. Back cover is too loose: change to slide-down and click

The snap-fit back cover is too loose. Change it so the cover **slides down
from the top along rails and clicks into place** with a detent or latch
at the bottom. When it's closed, the printer must not be able to slide out,
even when the box is tilted or carried. The goal is portability.

### 7. Photo framing looks off

Even apart from the camera angle (issue 4), the photos just look odd in the
frames. The cause isn't known yet. Things to check: crop and aspect (4:3
landscape shots in tall strip slots), headroom and where faces sit in the
slot, whether the live preview crop matches what's printed, and mirroring.
Revisit after the mount (issue 4) is done.
