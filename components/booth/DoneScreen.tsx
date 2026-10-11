"use client";

import { useEffect, useState } from "react";
import { BracketButton, Headline, TertiaryLogo } from "@/components/brand/Brand";
import type { PrintServerHealth } from "@/lib/cupsPrinterClient";
import { frameInfo, type FrameId } from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import { useCountdown } from "./hooks";
import { BoothScreen, OtterScene, type SceneFrame } from "./Scene";

export const DONE_MS = 45_000;
/** How often a held print is checked against the printer's queue. */
const QUEUE_POLL_MS = 3_000;

export type PrintState =
  | { kind: "printing" }
  | { kind: "queued"; jobId: string | null; guestMessage: string | null }
  | { kind: "sent" }
  | { kind: "failed"; message: string };

type QueueView = { cleared: boolean; ahead: number | null; printerReady: boolean };

/**
 * While `active`, polls the print server until the job leaves the queue. `ahead` is the
 * job's index in the queue (0 is the job being printed), or null when its place is unknown.
 * `printerReady` says the printer is taking jobs, so a job at 0 is printing and not jammed.
 * `cleared` means it has printed.
 * A failed poll keeps the last view, so a blip never flips the guest to "sent".
 */
function useQueueWatch(active: boolean, jobId: string | null) {
  const [view, setView] = useState<QueueView>({ cleared: false, ahead: null, printerReady: false });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer = 0;

    // Resolves true once the job is gone; the poll loop stops there.
    const poll = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/print/health", { cache: "no-store" });
        if (!res.ok) return false;
        const health = (await res.json()) as PrintServerHealth;
        const jobs = health.queue?.jobs;
        // No queue data (no printer configured), or a queue that could not be read, says nothing about the job.
        if (!jobs || health.queue?.jobsKnown === false) return false;
        const index = jobId ? jobs.findIndex((j) => j.id === jobId) : -1;
        // Without a job id, the queue emptying is the only signal.
        const gone = jobId ? index < 0 : jobs.length === 0;
        if (gone) {
          setView({ cleared: true, ahead: null, printerReady: false });
          return true;
        }
        // Without a job id the job's place is unknown, so no position line is shown.
        setView({ cleared: false, ahead: index >= 0 ? index : null, printerReady: health.ok });
        return false;
      } catch {
        return false;
      }
    };

    const loop = async () => {
      const cleared = await poll();
      if (stopped || cleared) return;
      timer = window.setTimeout(loop, QUEUE_POLL_MS);
    };
    void loop();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [active, jobId]);

  return view;
}

/** What the guest sees under the body while a print is held in the queue. */
function queueLine({ ahead, printerReady }: QueueView): string | null {
  if (ahead == null) return null;
  // A jammed printer holds the front job too, so "printing now" only shows while the printer takes jobs.
  if (ahead === 0) return printerReady ? "Printing your strip now…" : null;
  return `${ahead} ${ahead === 1 ? "print" : "prints"} ahead of yours`;
}

export type ShareState = { kind: "pending" } | { kind: "ready"; qr: string } | { kind: "failed" };

const SCENE: Record<FrameId, SceneFrame> = {
  stormy: "brackets",
  orange: "braces",
  sparky: "matrix",
  clean: "brackets",
  garden: "braces",
  crew: "brackets",
  hacker: "matrix",
  onepassword: "brackets",
};

const LOOP_COLOR: Record<FrameId, string> = {
  stormy: "#FFFFFF",
  orange: "#ECECEF",
  sparky: "#ECECEF",
  clean: "#0278FF",
  garden: "#FFFFFF",
  crew: "#0278FF",
  hacker: "#ECECEF",
  onepassword: "#145FE4",
};

function copyFor(print: PrintState, mode: PrintMode) {
  if (print.kind === "printing")
    return { l1: "Printing", l2: "Your Photos…", body: "Sending your print to the printer." };
  if (print.kind === "queued")
    return {
      l1: "Printer Paused",
      l2: "One Moment",
      body:
        print.guestMessage ?? "Your strip is queued and will print as soon as the printer is ready.",
    };
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
  const queued = print.kind === "queued";
  const watch = useQueueWatch(queued, queued ? print.jobId : null);
  // A held print counts as sent once it has left the queue.
  const shown: PrintState = queued && watch.cleared ? { kind: "sent" } : print;
  const copy = copyFor(shown, mode);
  const line = shown.kind === "queued" ? queueLine(watch) : null;
  const dark = info.fg !== "#101A21";

  return (
    <BoothScreen
      grain={frame !== "clean" && frame !== "crew"}
      style={{ background: info.bg, color: info.fg }}
      onClick={onFinish}
      data-testid="done"
      data-print={shown.kind}
    >
      <div className="absolute bottom-0 right-[0.5rem] top-[3.5rem] w-[24rem]">
        <OtterScene
          otter={info.mascot}
          frame={SCENE[frame]}
          loopColor={LOOP_COLOR[frame]}
          matrixColors={frame === "hacker" ? { dot: "#0278FF", label: "#FF5D0B" } : undefined}
        />
      </div>

      <div className="absolute left-[1.5rem] top-[1.5rem] w-[38rem]">
        <Headline line1={copy.l1} line2={copy.l2} className="text-[3.6rem]" />
        <p className="mt-[0.9rem] max-w-[30rem] text-[1.1rem] font-medium leading-snug">{copy.body}</p>
        {line && (
          <p className="mt-[0.4rem] text-[1rem] font-semibold" data-testid="queue-line">
            {line}
          </p>
        )}

        {shown.kind === "printing" && (
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
