#!/bin/bash
# Wait for the photobooth Next.js server, then launch Chromium kiosk.
for i in $(seq 1 120); do
  curl -sf -o /dev/null http://127.0.0.1:3001 && break
  sleep 2
done
exec chromium --ozone-platform=wayland --kiosk --no-first-run --disable-infobars \
  --noerrdialogs --disable-session-crashed-bubble \
  --use-fake-ui-for-media-stream --password-store=basic --disable-features=WebRtcPipeWireCamera \
  http://127.0.0.1:3001
