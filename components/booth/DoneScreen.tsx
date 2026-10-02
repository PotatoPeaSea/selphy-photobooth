"use client";

import { BracketButton, Headline, TertiaryLogo } from "@/components/brand/Brand";
import { frameInfo, type FrameId } from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import { useCountdown } from "./hooks";
import { BoothScreen, OtterScene, type SceneFrame } from "./Scene";

export const DONE_MS = 45_000;

export type PrintState = { kind: "printing" } | { kind: "sent" } | { kind: "failed"; message: string };
export type ShareState = { kind: "pending" } | { kind: "ready"; qr: string } | { kind: "failed" };

const SCENE: Record<FrameId, SceneFrame> = {
  stormy: "brackets",
  orange: "braces",
  sparky: "matrix",
  clean: "brackets",
};

function copyFor(print: PrintState, mode: PrintMode) {
  if (print.kind === "printing")
    return { l1: "Printing", l2: "Your Photos…", body: "Sending your print to the printer." };
  if (print.kind === "sent")
    return {
      l1: "Thanks For",
      l2: "Snapping!",
      body:
        mode === "strip"
          ? "Your print slides out in about a minute — cut down the middle for two strips."
          : "Your print slides out in about a minute.",
    };
  return {
    l1: "Printer",
    l2: "Hiccup!",
    body: "We couldn’t print this one. Scan the code to save your photos, and grab a volunteer.",
  };
}

/** Colour field in the chosen frame's colour; returns to the start on its own. */
export default function DoneScreen({
  mode,
  frame,
  print,
  share,
  onFinish,
}: {
  mode: PrintMode;
  frame: FrameId;
  print: PrintState;
  share: ShareState;
  onFinish: () => void;
}) {
  const info = frameInfo(frame);
  const left = useCountdown(DONE_MS, onFinish);
  const copy = copyFor(print, mode);
  const dark = info.fg !== "#101A21";
  const otter = info.otter ?? "sparky";

  return (
    <BoothScreen
      grain={frame !== "clean"}
      style={{ background: info.bg, color: info.fg }}
      onClick={onFinish}
      data-testid="done"
      data-print={print.kind}
    >
      <div className="absolute bottom-0 right-[0.5rem] top-[3.5rem] w-[24rem]">
        <OtterScene
          otter={otter}
          frame={SCENE[frame]}
          loopColor={frame === "stormy" ? "#FFFFFF" : frame === "clean" ? "#0278FF" : "#ECECEF"}
        />
      </div>

      <div className="absolute left-[1.5rem] top-[1.5rem] w-[38rem]">
        <Headline line1={copy.l1} line2={copy.l2} className="text-[3.6rem]" />
        <p className="mt-[0.9rem] max-w-[30rem] text-[1.1rem] font-medium leading-snug">{copy.body}</p>

        {print.kind === "printing" && (
          <div className="mt-[1rem] h-[0.4rem] w-[22rem] overflow-hidden rounded-full" style={{ backgroundColor: dark ? "rgba(236,236,239,.25)" : "rgba(16,26,33,.15)" }}>
            <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-current" />
          </div>
        )}

        <div className="mt-[1.25rem] flex items-center gap-[1rem]">
          <div className="flex size-[9.5rem] shrink-0 items-center justify-center overflow-hidden rounded-card bg-white p-[0.5rem]" data-testid="share-qr">
            {share.kind === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={share.qr} alt="QR code for your digital copy" className="h-full w-full [image-rendering:pixelated]" />
            ) : share.kind === "pending" ? (
              <div className="h-full w-full animate-pulse rounded-[0.6rem] bg-sh-black/10" />
            ) : (
              <p className="p-[0.5rem] text-center text-[0.8rem] font-medium text-sh-black/60">
                Digital copy unavailable
              </p>
            )}
          </div>
          <div>
            <p className="type-display text-[1.6rem]">Grab Your Digital Copy</p>
            <p className="mt-[0.3rem] text-[0.95rem] font-medium opacity-80">Scan with your phone camera</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[1.25rem] left-[1.5rem] flex items-center gap-[1.25rem]">
        <BracketButton
          variant={dark ? "inverse" : "primary"}
          onClick={(e) => {
            e.stopPropagation();
            onFinish();
          }}
        >
          Done
        </BracketButton>
        <p className="text-[0.9rem] font-medium opacity-80" data-testid="done-countdown">
          Back to the start in {left} s
        </p>
      </div>
      <TertiaryLogo className="absolute right-[1.5rem] top-[1.5rem] h-[1rem]" />
    </BoothScreen>
  );
}
