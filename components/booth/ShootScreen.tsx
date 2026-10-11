"use client";

import { useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { captureFrame } from "@/lib/print/capture";
import { PHOTO_ASPECT, SHOT_COUNT, type PrintMode } from "@/lib/print/layouts";
import { isFrameStalled } from "./cameraRecovery";
import { sleep, type CameraState } from "./hooks";
import { BoothScreen } from "./Scene";

const MODE_LABEL: Record<PrintMode, string> = { strip: "Two Strips", grid: "Full Frame" };

/** A feed with no new frame for this long is frozen and gets restarted. */
const STALL_MS = 5_000;
/** A new stream gets this long to deliver its first frame before it is restarted. */
const WARMUP_MS = 20_000;
/** A shot is only taken from a frame this recent, so a frozen feed never ends up in a photo. */
const FRESH_MS = 1_500;
/** The longest a shot waits for a fresh frame before the run gives up. */
const FRAME_WAIT_MS = 10_000;
/** How often the watchdog checks the frame clock. */
const WATCH_MS = 1_000;

/**
 * Live preview cropped to the print's photo shape, mirrored like a mirror.
 * One tap on [ Start ] runs all four shots, counting down `delay` seconds
 * before each (picked on the mode screen). A frozen feed is restarted, and a
 * shot is never taken from a stale frame.
 */
export default function ShootScreen({
  mode,
  delay,
  camera,
  onRestartCamera,
  onRunningChange,
  onDone,
  onBack,
}: {
  mode: PrintMode;
  delay: number;
  camera: CameraState;
  onRestartCamera: () => void;
  /** Reports true while the four shots run, so the idle timeout waits for them. */
  onRunningChange: (running: boolean) => void;
  onDone: (shots: HTMLCanvasElement[]) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [lost, setLost] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const alive = useRef(true);
  // Frame clock for the current stream: when it attached, and when its last
  // frame arrived (null until the first one).
  const attachedAt = useRef(0);
  const frameAt = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const stream = camera.status === "live" ? camera.stream : null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!stream) {
      video.srcObject = null;
      setReady(false);
      return;
    }
    setReady(false);
    video.srcObject = stream;
    const onReady = () => {
      setReady(video.videoWidth > 0);
      if (video.videoWidth > 0) setLost(false);
    };
    video.addEventListener("loadeddata", onReady);
    void video.play().catch(() => {});
    if (video.readyState >= 2) onReady();
    return () => video.removeEventListener("loadeddata", onReady);
  }, [stream]);

  // Watchdog: while a stream is attached, a stretch with no new frame restarts the camera.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    attachedAt.current = Date.now();
    frameAt.current = null;
    const hasRvfc = typeof video.requestVideoFrameCallback === "function";
    let rvfc = 0;
    const onFrame: VideoFrameRequestCallback = () => {
      frameAt.current = Date.now();
      rvfc = video.requestVideoFrameCallback(onFrame);
    };
    if (hasRvfc) rvfc = video.requestVideoFrameCallback(onFrame);
    // Frames stop in a background tab, so the clocks restart when the tab shows again.
    const onVisibility = () => {
      if (document.hidden) return;
      attachedAt.current = Date.now();
      frameAt.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    let lastTime = video.currentTime;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (!hasRvfc && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        frameAt.current = Date.now();
      }
      // Before the first frame the stream gets WARMUP_MS; after it, a gap of STALL_MS is a freeze.
      const stalled =
        frameAt.current !== null
          ? isFrameStalled(frameAt.current, Date.now(), STALL_MS)
          : isFrameStalled(attachedAt.current, Date.now(), WARMUP_MS);
      if (stalled) onRestartCamera();
    }, WATCH_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      if (hasRvfc) video.cancelVideoFrameCallback(rvfc);
      frameAt.current = null;
    };
  }, [stream, onRestartCamera]);

  // Tells the app a run is underway, and clears it on finish, failure or unmount.
  useEffect(() => {
    if (!running) return;
    onRunningChange(true);
    return () => onRunningChange(false);
  }, [running, onRunningChange]);

  /** True when a frame from the current stream arrived within FRESH_MS. */
  const frameFresh = () =>
    frameAt.current !== null && !isFrameStalled(frameAt.current, Date.now(), FRESH_MS);

  /** Waits up to FRAME_WAIT_MS for a fresh frame. False if none came or the screen closed. */
  async function waitForFrame(): Promise<boolean> {
    const until = Date.now() + FRAME_WAIT_MS;
    while (!frameFresh()) {
      if (!alive.current || Date.now() >= until) return false;
      await sleep(200);
    }
    return alive.current;
  }

  async function run() {
    const video = videoRef.current;
    if (!video || running) return;
    // After a lost camera, Start asks for a new stream instead of waiting on the dead one.
    if (lost) onRestartCamera();
    setLost(false);
    setRunning(true);
    const shots: HTMLCanvasElement[] = [];
    const lose = () => {
      if (!alive.current) return;
      setCountdown(null);
      setThumbs([]);
      setRunning(false);
      setLost(true);
    };
    for (let i = 0; i < SHOT_COUNT; i++) {
      if (!(await waitForFrame())) return lose();
      for (let n = delay; n >= 1; n--) {
        setCountdown(n);
        await sleep(1000);
        if (!alive.current) return;
      }
      setCountdown(null);
      if (!(await waitForFrame())) return lose();
      const shot = captureFrame(video, mode);
      shots.push(shot);
      setFlashKey((k) => k + 1);
      setThumbs((t) => [...t, shot.toDataURL("image/jpeg", 0.7)]);
      await sleep(i === SHOT_COUNT - 1 ? 700 : 250);
      if (!alive.current) return;
    }
    onDone(shots);
  }

  const aspect = PHOTO_ASPECT[mode];
  const taken = thumbs.length;
  const current = Math.min(taken + 1, SHOT_COUNT);

  return (
    <BoothScreen className="flex items-center gap-[1.5rem] bg-sh-white px-[1.5rem] py-[1.25rem] text-sh-black">
      {/* Preview */}
      <div className="flex h-full min-w-0 flex-1 items-center justify-center">
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-card bg-sh-black"
          style={{ aspectRatio: String(aspect), height: aspect < 1 ? "100%" : undefined, width: aspect >= 1 ? "100%" : undefined }}
          data-testid="preview"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            playsInline
            muted
          />
          {countdown === null && (!ready || lost) && (
            <div className="absolute inset-0 flex items-center justify-center p-[2rem] text-center text-[1.1rem] font-medium text-sh-white/80">
              {camera.status === "error"
                ? "Camera unavailable — ask a volunteer for a hand"
                : lost
                  ? "Camera lost — tap Start to try again"
                  : camera.status === "reconnecting"
                    ? "Reconnecting camera…"
                    : "Warming up the camera…"}
            </div>
          )}
          {running && (
            <span className="type-display absolute left-[0.9rem] top-[0.9rem] rounded-full bg-sh-black px-[0.9rem] py-[0.35rem] text-[1.2rem] text-sh-white">
              {current} / {SHOT_COUNT}
            </span>
          )}
          {countdown !== null && (
            <div
              key={`${taken}-${countdown}`}
              className="type-display absolute inset-0 flex animate-countdown items-center justify-center text-[13rem] text-sh-white"
              style={{ WebkitTextStroke: "0.35rem #101A21", paintOrder: "stroke fill" }}
              data-testid="countdown"
            >
              {countdown}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <aside className="flex h-full w-[15rem] shrink-0 flex-col">
        <p className="text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">
          {MODE_LABEL[mode]}
        </p>
        <p className="type-display mt-[0.2rem] text-[2.4rem]">
          {running ? (taken < SHOT_COUNT ? "Hold It!" : "Got It!") : "Strike A Pose"}
        </p>
        <p className="mt-[0.5rem] text-[0.95rem] font-medium leading-snug text-sh-black/75">
          {running
            ? "New pose for every shot."
            : `Four photos, ${delay} seconds apart. Tap start and look at the camera.`}
        </p>

        <div
          className={`mt-[1rem] grid min-h-0 flex-1 content-start gap-[0.5rem] ${aspect < 1 ? "grid-cols-4" : "grid-cols-2"}`}
          data-testid="thumbs"
        >
          {Array.from({ length: SHOT_COUNT }, (_, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-[0.5rem] ${
                thumbs[i] ? "bg-sh-black" : i === taken && running ? "bg-sh-yellow" : "bg-sh-black/10"
              }`}
              style={{ aspectRatio: String(aspect) }}
            >
              {thumbs[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[i]} alt={`Shot ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="type-display absolute inset-0 flex items-center justify-center text-[1.1rem] text-sh-black/35">
                  {i + 1}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-[0.75rem] flex flex-col gap-[0.5rem]">
          <BracketButton size="lg" disabled={running || (!ready && !lost)} onClick={() => void run()}>
            Start
          </BracketButton>
          <BracketButton variant="secondary" disabled={running} onClick={onBack}>
            Back
          </BracketButton>
        </div>
      </aside>

      {flashKey > 0 && (
        <div key={flashKey} className="pointer-events-none absolute inset-0 animate-flash bg-white" />
      )}
    </BoothScreen>
  );
}
