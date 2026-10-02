"use client";

import { useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { artSrc, FRAMES, renderPrint, type FrameId } from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import type { PrinterStatus } from "./hooks";
import { BoothScreen } from "./Scene";

const PREVIEW_SCALE = 0.5;

function PrinterChip({ status, onTap }: { status: PrinterStatus; onTap: () => void }) {
  const [dot, text] =
    status.kind === "ready"
      ? [status.warning ? "bg-sh-yellow" : "bg-[#1FA36A]", status.warning ?? "Printer ready"]
      : status.kind === "checking"
        ? ["bg-sh-grey animate-pulse", "Checking printer…"]
        : ["bg-sh-orange", "Printer offline — you’ll still get a QR code"];
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid="printer-status"
      className="flex min-h-[2.5rem] items-center gap-[0.55rem] rounded-full bg-sh-black/[0.06] px-[0.9rem] text-left text-[0.85rem] font-medium leading-tight"
    >
      <span className={`size-[0.6rem] shrink-0 rounded-full ${dot}`} />
      <span className="line-clamp-2">{text}</span>
    </button>
  );
}

/**
 * The finished print, rendered with the chosen frame. Swap frames, print, or
 * retake all four. (Idle timeout is handled by the parent.)
 */
export default function ReviewScreen({
  mode,
  shots,
  frame,
  onFrame,
  printer,
  onPrinterTap,
  onPrint,
  onRetake,
}: {
  mode: PrintMode;
  shots: HTMLCanvasElement[];
  frame: FrameId;
  onFrame: (f: FrameId) => void;
  printer: PrinterStatus;
  onPrinterTap: () => void;
  onPrint: () => void;
  onRetake: () => void;
}) {
  const [previews, setPreviews] = useState<Partial<Record<FrameId, string>>>({});
  const firstFrame = useRef(frame);

  // Render the starting frame first, then the rest in the background so swaps are instant.
  useEffect(() => {
    let cancelled = false;
    const start = firstFrame.current;
    const order = [start, ...FRAMES.map((f) => f.id).filter((id) => id !== start)];
    setPreviews({});
    (async () => {
      for (const id of order) {
        const canvas = await renderPrint({ mode, frame: id, photos: shots, scale: PREVIEW_SCALE });
        if (cancelled) return;
        const url = canvas.toDataURL("image/jpeg", 0.85);
        setPreviews((p) => ({ ...p, [id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, shots]);

  const src = previews[frame];
  const landscape = mode === "grid";

  return (
    <BoothScreen className="flex items-stretch gap-[1.75rem] bg-sh-white px-[1.5rem] py-[1.25rem] text-sh-black">
      <div className="flex h-full shrink-0 items-center">
        <div
          className={`relative overflow-hidden rounded-[0.6rem] bg-sh-black/10 ${landscape ? "aspect-[3/2] w-[30.5rem]" : "aspect-[2/3] h-full"}`}
          data-testid="print-preview"
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={frame} src={src} alt="Your print" className="h-full w-full animate-pop object-cover" data-frame={frame} />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-sh-black/5" />
          )}
        </div>
      </div>

      <section className="flex min-w-0 flex-1 flex-col">
        <h1>
          <span className="block text-[1.6rem] font-normal leading-none tracking-[-0.02em]">Looking</span>
          <span className="type-display block text-[3rem]">Good!</span>
        </h1>

        <p className="mt-[0.8rem] text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">
          Pick a frame
        </p>
        <div className="mt-[0.4rem] grid grid-cols-4 gap-[0.45rem]" role="radiogroup" aria-label="Frame">
          {FRAMES.map((f) => {
            const on = f.id === frame;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-frame={f.id}
                onClick={() => onFrame(f.id)}
                className={`flex flex-col items-center gap-[0.25rem] rounded-[0.8rem] p-[0.3rem] transition-colors ${
                  on ? "bg-sh-black text-sh-white" : "text-sh-black"
                }`}
              >
                <span
                  className="relative block aspect-[5/3] w-full overflow-hidden rounded-[0.55rem] ring-1 ring-inset ring-sh-black/15"
                  style={{ background: f.bg }}
                >
                  {f.id !== "clean" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artSrc(f.mascot)}
                      alt=""
                      className="absolute bottom-0 left-1/2 h-[88%] max-w-none -translate-x-1/2"
                    />
                  )}
                </span>
                <span className="type-display text-[0.95rem]">{f.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-[0.7rem]">
          <PrinterChip status={printer} onTap={onPrinterTap} />
          <div className="flex gap-[0.75rem]">
            <BracketButton size="lg" className="flex-1" onClick={onPrint} disabled={!src}>
              Print
            </BracketButton>
            <BracketButton size="lg" variant="secondary" onClick={onRetake}>
              Retake All
            </BracketButton>
          </div>
        </div>
      </section>
    </BoothScreen>
  );
}
