# Pi setup (booth-pi)

Copies of the system files the booth runs with on the Raspberry Pi 5. They
live outside the repo on the device; keep these in sync when you change them.

| File | Installed at |
| --- | --- |
| `photobooth.service` | `/etc/systemd/system/` — Next.js + print server (`pnpm dev`) |
| `photobooth-webcam.service`, `photobooth-webcam.sh` | `/etc/systemd/system/`, `/usr/local/bin/` — feeds `/dev/video42` |
| `photobooth-kiosk.sh` | `/usr/local/bin/` — started from `~/.config/labwc/autostart` via `lwrespawn` |
| `v4l2loopback.conf` | `/etc/modprobe.d/` (and `v4l2loopback` in `/etc/modules-load.d/`) |
| `50-photobooth-pcsc.rules` | `/etc/polkit-1/rules.d/` — lets the service use the NFC reader |

## Camera

`photobooth-webcam.sh` uses a Canon DSLR (gphoto2) when one is on USB, else
the Pi Camera v2 (`rpicam-vid`), and writes to the v4l2loopback device the
kiosk's Chromium opens. The SELPHY printer is Canon vendor `04a9` too, so the
DSLR check skips it — without that the script loops on gphoto2 and the
feed stays empty.

### Camera recovery

The script restarts a feed that stops getting new frames (for the DSLR it also
runs `gphoto2 --reset`). It switches between the DSLR and the Pi Camera only
after the Canon has been off USB for 10 s, or back on USB for 5 s, so a brief
USB drop doesn't restart the kiosk. The timings are `WEBCAM_*` environment
variables with their defaults in the script.

If the Canon is on USB but `gphoto2` exits or hangs before any frame (for
example "Could not claim the USB device" while gvfs holds it), the script resets
the camera and retries. After three such failures in a row it uses the Pi Camera
until the Canon is unplugged for 10 s or more. A failed reset is logged.

These two steps are on the Pi and are not done by the scripts:

- Turn off the Canon's auto power-off, or use a dummy-battery DC coupler so the
  battery can't run out. Auto power-off drops the camera off USB.
- Mask gvfs's gphoto2 volume monitor, which grabs the camera when it comes back
  on USB and blocks gphoto2. As user `pi`:
  `systemctl --user mask gvfs-gphoto2-volume-monitor`

## Printer (SELPHY CP910)

The CP910 has no IPP-over-USB, so use the Gutenprint driver over USB:

```sh
sudo apt install printer-driver-gutenprint
sudo lpinfo -v | grep canon-cp910          # gutenprint53+usb://canon-cp910/<serial>
sudo lpadmin -p Selphy -E -v 'gutenprint53+usb://canon-cp910/<serial>' \
  -m gutenprint.5.3://canon-cp910/expert -o StpBorderless=True
```

and in `.env.local`: `PRINTER_NAME=Selphy`, `CUPS_MEDIA_OPTION=Postcard`.

## NFC

```sh
sudo apt install pcscd libpcsclite-dev
```
