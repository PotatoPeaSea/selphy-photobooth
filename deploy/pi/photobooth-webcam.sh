#!/bin/bash
# Feed /dev/video42 (v4l2loopback) for the photobooth kiosk.
# Prefers the Canon DSLR (gphoto2); falls back to the Pi Camera (libcamera) when no Canon is on USB.
exec 2>>/var/log/photobooth-webcam.log
log() { echo "[$(date "+%F %T")] $*" >&2; }
# Canon printers (SELPHY) share vendor 04a9, so skip them.
dslr_present() { lsusb -d 04a9: 2>/dev/null | grep -qvi selphy; }

current=""
restart_kiosk() {
  # Chromium keeps the old stream after the source changes; lwrespawn relaunches the kiosk.
  [ -n "$current" ] && [ "$current" != "$1" ] && { log "source changed, restarting kiosk"; pkill -x chromium; }
  current=$1
}

while true; do
  if dslr_present; then
    restart_kiosk dslr
    log "using Canon DSLR"
    gphoto2 --stdout --capture-movie | ffmpeg -loglevel warning -f mjpeg -i - -pix_fmt yuv420p -f v4l2 /dev/video42
    log "DSLR pipeline exited"
    sleep 2
  else
    restart_kiosk picam
    log "no DSLR, using Pi Camera"
    setsid bash -c "rpicam-vid -t 0 -n --mode 1640:1232:10:P --codec yuv420 --width 1536 --height 1152 --framerate 30 -o - \
      | ffmpeg -loglevel warning -f rawvideo -pix_fmt yuv420p -s 1536x1152 -r 30 -i - -f v4l2 /dev/video42" &
    pid=$!
    while kill -0 "$pid" 2>/dev/null && ! dslr_present; do sleep 3; done
    kill -- -"$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    log "Pi Camera pipeline stopped"
    sleep 1
  fi
done
