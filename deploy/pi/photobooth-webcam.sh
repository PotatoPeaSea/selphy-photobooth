#!/bin/bash
# Feed /dev/video42 (v4l2loopback) for the photobooth kiosk.
# Prefers the Canon DSLR (gphoto2); falls back to the Pi Camera (libcamera) when no Canon is on USB.
WEBCAM_DEV=${WEBCAM_DEV:-/dev/video42}
WEBCAM_LOG=${WEBCAM_LOG:-/var/log/photobooth-webcam.log}
WEBCAM_STALL_SECS=${WEBCAM_STALL_SECS:-5}
WEBCAM_START_GRACE_SECS=${WEBCAM_START_GRACE_SECS:-20}
WEBCAM_DROP_GRACE_SECS=${WEBCAM_DROP_GRACE_SECS:-10}
WEBCAM_RETURN_GRACE_SECS=${WEBCAM_RETURN_GRACE_SECS:-5}
exec 2>>"$WEBCAM_LOG"
log() { echo "[$(date "+%F %T")] $*" >&2; }
# Canon printers (SELPHY) share vendor 04a9, so skip them.
dslr_present() { lsusb -d 04a9: 2>/dev/null | grep -qvi selphy; }

current=""
pid=""
progress=""
started=0
last_frames=0
last_change=0
retry_at=0
present_since=""
absent_since=""
dslr_fails=0   # DSLR pipelines in a row that exited before any frame
dslr_blocked=0 # 1 while the Canon is on USB but won't open: the Pi Camera runs until it is unplugged

restart_kiosk() {
  # Chromium keeps the old stream after the source changes; lwrespawn relaunches the kiosk.
  [ -n "$current" ] && [ "$current" != "$1" ] && { log "source changed, restarting kiosk"; pkill -x chromium; }
  current=$1
}

stop_pipeline() {
  [ -n "$pid" ] || return 0
  # TERM lets ffmpeg release /dev/video42; KILL only if something in the group ignores it.
  kill -TERM -- -"$pid" 2>/dev/null
  for _ in 1 2 3; do kill -0 -- -"$pid" 2>/dev/null || break; sleep 1; done
  if kill -0 -- -"$pid" 2>/dev/null; then
    kill -KILL -- -"$pid" 2>/dev/null
    # Wait until the group is gone, so the reset and the next start don't race a process that still
    # holds the camera (one in a USB transfer can take a moment to die after KILL).
    for _ in 1 2 3 4 5; do kill -0 -- -"$pid" 2>/dev/null || break; sleep 1; done
    kill -0 -- -"$pid" 2>/dev/null && log "pipeline $pid still running after KILL"
  fi
  pid=""
  [ -n "$progress" ] && rm -f "$progress"
  progress=""
}

start_pipeline() {
  # setsid gives each pipeline its own process group, so stop_pipeline also ends
  # gphoto2 or rpicam-vid, not just ffmpeg.
  progress=$(mktemp)
  started=$(date +%s)
  last_frames=0
  last_change=$started
  if [ "$1" = dslr ]; then
    log "using Canon DSLR"
    setsid bash -c 'gphoto2 --stdout --capture-movie | ffmpeg -loglevel warning -progress "$1" -f mjpeg -i - -pix_fmt yuv420p -f v4l2 "$2"' _ "$progress" "$WEBCAM_DEV" &
  else
    log "no DSLR, using Pi Camera"
    setsid bash -c 'rpicam-vid -t 0 -n --mode 1640:1232:10:P --codec yuv420 --width 1536 --height 1152 --framerate 30 -o - \
      | ffmpeg -loglevel warning -progress "$1" -f rawvideo -pix_fmt yuv420p -s 1536x1152 -r 30 -i - -f v4l2 "$2"' _ "$progress" "$WEBCAM_DEV" &
  fi
  pid=$!
}

read_frames() {
  # ffmpeg writes a block about every 0.5 s and keeps its write offset, so only the tail
  # is read. The file is capped afterwards. Truncating frees the space only on filesystems
  # with sparse files (ext4, tmpfs); the apparent size keeps growing, and FAT would fill up.
  local size
  tail -c 4096 "$progress" 2>/dev/null | grep -a '^frame=[0-9]' | tail -n1 | cut -d= -f2
  size=$(stat -c %s "$progress" 2>/dev/null)
  [ "${size:-0}" -gt 65536 ] && : > "$progress"
}

reset_dslr() {
  # gphoto2 can hang on a wedged camera, so the reset gets a timeout. A failed reset is logged.
  local rc
  timeout -k 5 20 gphoto2 --reset >/dev/null
  rc=$?
  [ "$rc" -eq 0 ] || log "gphoto2 --reset failed (exit $rc)"
}

dslr_open_failed() {
  # The Canon is on USB but gave no frame, whether gphoto2 exited or hung. After three tries in
  # a row use the Pi Camera until the Canon is unplugged, so the feed doesn't stay dead.
  dslr_fails=$((dslr_fails + 1))
  if [ "$dslr_fails" -ge 3 ] && [ "$dslr_blocked" = 0 ]; then
    dslr_blocked=1
    log "Canon failed to open $dslr_fails times in a row, using Pi Camera until it is unplugged"
  fi
}

# A stopped unit must not leave gphoto2 or rpicam-vid running.
trap 'stop_pipeline; exit 0' TERM INT
trap stop_pipeline EXIT

while true; do
  sleep 1
  now=$(date +%s)
  if dslr_present; then
    [ -n "$present_since" ] || present_since=$now
    absent_since=""
  else
    [ -n "$absent_since" ] || absent_since=$now
    present_since=""
    # Off USB long enough to count as unplugged: the next time the Canon shows up it gets a fresh try.
    if [ $((now - absent_since)) -ge "$WEBCAM_DROP_GRACE_SECS" ]; then dslr_blocked=0; dslr_fails=0; fi
  fi

  # Sources switch only after a grace period, so a brief USB drop doesn't restart the kiosk.
  # A Canon that is on USB but won't open (dslr_blocked) is skipped until it is unplugged.
  if [ "$current" = dslr ]; then
    if [ "$dslr_blocked" = 1 ] || { [ -n "$absent_since" ] && [ $((now - absent_since)) -ge "$WEBCAM_DROP_GRACE_SECS" ]; }; then want=picam; else want=dslr; fi
  elif [ "$current" = picam ]; then
    if [ "$dslr_blocked" = 0 ] && [ -n "$present_since" ] && [ $((now - present_since)) -ge "$WEBCAM_RETURN_GRACE_SECS" ]; then want=dslr; else want=picam; fi
  elif [ "$dslr_blocked" = 0 ] && [ -n "$present_since" ]; then
    want=dslr
  else
    want=picam
  fi
  if [ "$want" != "$current" ]; then
    stop_pipeline
    restart_kiosk "$want"
    retry_at=0
  fi

  # DSLR is off USB: keep the source but don't feed until it returns or the grace runs out.
  if [ "$current" = dslr ] && [ -n "$absent_since" ]; then
    stop_pipeline
    continue
  fi

  # Read the frame count first, so an exit below is judged on the latest progress block.
  if [ -n "$pid" ]; then
    frames=$(read_frames)
    frames=${frames:-0}
    if [ "$frames" -gt "$last_frames" ]; then
      last_frames=$frames; last_change=$now
      if [ "$current" = dslr ]; then dslr_fails=0; fi
    fi
  fi

  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    if [ "$current" = dslr ]; then log "DSLR pipeline exited"; else log "Pi Camera pipeline stopped"; fi
    stop_pipeline # also ends gphoto2 if ffmpeg quit first
    if [ "$current" = dslr ] && [ "$last_frames" -eq 0 ]; then
      # gphoto2 never delivered a frame, so the Canon is on USB but won't open. Reset it.
      dslr_open_failed
      reset_dslr
    fi
    retry_at=$((now + 2))
  fi

  if [ -n "$pid" ]; then
    if [ "$last_frames" -gt 0 ]; then since=$last_change; limit=$WEBCAM_STALL_SECS
    else since=$started; limit=$WEBCAM_START_GRACE_SECS; fi
    if [ $((now - since)) -ge "$limit" ]; then
      log "stall: no new frames from $current, restarting"
      stop_pipeline
      if [ "$current" = dslr ]; then
        # A Canon that hangs before its first frame is the same failure as one that exits.
        if [ "$last_frames" -eq 0 ]; then dslr_open_failed; fi
        reset_dslr
      fi
      # One second, not zero: the next pass then sees a blocked Canon and doesn't start it again.
      retry_at=$((now + 1))
    fi
  fi

  if [ -z "$pid" ] && [ "$now" -ge "$retry_at" ]; then
    start_pipeline "$current"
  fi
done
