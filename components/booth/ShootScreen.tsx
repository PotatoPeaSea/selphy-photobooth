"use client";

import { useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { captureFrame } from "@/lib/print/capture";
import { PHOTO_ASPECT, SHOT_COUNT, type PrintMode } from "@/lib/print/layouts";
import { sleep, type CameraState } from "./hooks";
import { BoothScreen } from "./Scene";

const FIRST_COUNT = 3;
const NEXT_COUNT = 2;

const MODE_LABEL: Record<PrintMode, string> = { strip: "Two Strips", grid: "Full Frame" };

/**
 * Live preview cropped to the print's photo shape, mirrored like a mirror.
 * One tap on [ Start ] runs all four shots: 3 s before the first, 2 s between.
 */
export default function ShootScreen({
  mode,
  camera,
  onDone,
  onBack,
}: {
  mode: PrintMode;
  camera: CameraState;
  onDone: (shots: HTMLCanvasElement[]) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const stream = camera.status === "live" ? camera.stream : null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    setReady(false);
    video.srcObject = stream;
    const onReady = () => setReady(video.videoWidth > 0);
    video.addEventListener("loadeddata", onReady);
    void video.play().catch(() => {});
    if (video.readyState >= 2) onReady();
    return () => video.removeEventListener("loadeddata", onReady);
  }, [stream]);

  async function run() {
    const video = videoRef.current;
    if (!video || running) return;
    setRunning(true);
    const shots: HTMLCanvasElement[] = [];
    for (let i = 0; i < SHOT_COUNT; i++) {
      for (let n = i === 0 ? FIRST_COUNT : NEXT_COUNT; n >= 1; n--) {
        setCountdown(n);
        await sleep(1000);
        if (!alive.current) return;
      }
      setCountdown(null);
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
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center p-[2rem] text-center text-[1.1rem] font-medium text-sh-white/80">
              {camera.status === "error"
                ? "Camera unavailable — ask a volunteer for a hand"
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
            : "Four photos, back to back. Tap start and look at the camera."}
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
          <BracketButton size="lg" disabled={!ready || running} onClick={() => void run()}>
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
