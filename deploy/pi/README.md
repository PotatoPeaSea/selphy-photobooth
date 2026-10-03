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
