"use client";

import { useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { ADDONS, artSrc, FRAMES, renderPrint, type AddOns, type FrameId } from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import type { PrinterStatus } from "./hooks";
import { BoothScreen } from "./Scene";

const PREVIEW_SCALE = 0.5;
/** Most prints one guest can ask for. */
const MAX_COPIES = 3;

const previewKey = (frame: FrameId, addons: AddOns) =>
  `${frame}:${ADDONS.map((a) => (addons[a.id] ? 1 : 0)).join("")}`;

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

/** Asked on Print: may the photos go on the public photobooth site? */
function PublicPrompt({
  onAnswer,
  onCancel,
}: {
  onAnswer: (visibility: "public" | "private") => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex animate-pop items-center justify-center bg-sh-black/60 p-[1.5rem]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-prompt-title"
        data-testid="public-prompt"
        className="w-[36rem] max-w-full rounded-card bg-sh-white p-[1.75rem] text-sh-black"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="public-prompt-title">
          <span className="block text-[1.5rem] font-normal leading-none tracking-[-0.02em]">Share it with</span>
          <span className="type-display block text-[2.6rem]">Everyone?</span>
        </h2>
        <p className="mt-[0.8rem] text-[1.05rem] font-medium leading-snug text-sh-black/75">
          Put your photos on the public StormHacks photobooth site, where anyone can see them. Either way,
          you’ll get a QR code to save them.
        </p>
        <div className="mt-[1.4rem] flex gap-[0.75rem]">
          <BracketButton className="flex-1" data-visibility="public" onClick={() => onAnswer("public")}>
            Yes, Share
          </BracketButton>
          <BracketButton
            className="flex-1"
            variant="secondary"
            data-visibility="private"
            onClick={() => onAnswer("private")}
          >
            Keep Private
          </BracketButton>
        </div>
      </div>
    </div>
  );
}

/**
 * The finished print, rendered with the chosen frame and add-ons. Swap
 * frames, toggle add-ons, print, or retake all four. (Idle timeout is
 * handled by the parent.)
 */
export default function ReviewScreen({
  mode,
  shots,
  frame,
  onFrame,
  addons,
  onAddons,
  copies,
  onCopies,
  printer,
  onPrinterTap,
  onPrint,
  onRetake,
}: {
  mode: PrintMode;
  shots: HTMLCanvasElement[];
  frame: FrameId;
  onFrame: (f: FrameId) => void;
  addons: AddOns;
  onAddons: (a: AddOns) => void;
  copies: number;
  onCopies: (n: number) => void;
  printer: PrinterStatus;
  onPrinterTap: () => void;
  /** Called once the guest has answered the public-gallery prompt. */
  onPrint: (visibility: "public" | "private") => void;
  onRetake: () => void;
}) {
  // Previews by frame + add-ons, kept for the whole review so toggling back is instant.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const done = useRef<Record<string, string>>({});
  const shown = useRef<string | undefined>(undefined);

  // Render the chosen frame first, then the other frames with the same
  // add-ons in the background so swaps are instant.
  const addonsKey = previewKey(frame, addons);
  useEffect(() => {
    done.current = {};
    setPreviews({});
  }, [mode, shots]);
  useEffect(() => {
    let cancelled = false;
    const order = [frame, ...FRAMES.map((f) => f.id).filter((id) => id !== frame)];
    (async () => {
      for (const id of order) {
        const key = previewKey(id, addons);
        if (done.current[key]) continue;
        const canvas = await renderPrint({ mode, frame: id, photos: shots, scale: PREVIEW_SCALE, addons });
        if (cancelled) return;
        done.current[key] = canvas.toDataURL("image/jpeg", 0.85);
        setPreviews({ ...done.current });
      }
    })();
    return () => {
      cancelled = true;
    };
    // addonsKey stands in for `addons`, which is a fresh object on every toggle.
  }, [mode, shots, addonsKey]);

  // Print first asks whether the photos may go on the public gallery.
  const [asking, setAsking] = useState(false);

  const ready = previews[addonsKey];
  // Keep the last print on screen while the next one renders.
  if (ready) shown.current = ready;
  const src = ready ?? shown.current;
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
            <img
              key={frame}
              src={src}
              alt="Your print"
              className="h-full w-full animate-pop object-cover"
              data-frame={frame}
              data-ready={!!ready}
            />
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

        <p className="mt-[0.7rem] text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">
          Add extras
        </p>
        <div className="mt-[0.4rem] flex gap-[0.45rem]" role="group" aria-label="Extras">
          {ADDONS.map((a) => {
            const on = addons[a.id];
            return (
              <button
                key={a.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                data-addon={a.id}
                onClick={() => onAddons({ ...addons, [a.id]: !on })}
                className={`flex min-h-[2.75rem] flex-1 items-center justify-center gap-[0.5rem] rounded-[0.8rem] px-[0.6rem] text-[0.95rem] font-semibold transition-colors ${
                  on ? "bg-sh-black text-sh-white" : "bg-sh-black/[0.06] text-sh-black"
                }`}
              >
                <span
                  className={`flex size-[1.1rem] shrink-0 items-center justify-center rounded-[0.3rem] text-[0.8rem] leading-none ${
                    on ? "bg-sh-white text-sh-black" : "ring-2 ring-inset ring-sh-black/40"
                  }`}
                  aria-hidden
                >
                  {on ? "✓" : ""}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-[0.7rem]">
          <div className="flex items-center gap-[0.75rem]">
            <div className="min-w-0 flex-1">
              <PrinterChip status={printer} onTap={onPrinterTap} />
            </div>
            <div className="flex shrink-0 items-center gap-[0.45rem]" role="radiogroup" aria-label="Copies">
              <span className="text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">
                Copies
              </span>
              {Array.from({ length: MAX_COPIES }, (_, i) => i + 1).map((n) => {
                const on = n === copies;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-copies={n}
                    onClick={() => onCopies(n)}
                    className={`type-display size-[2.75rem] rounded-[0.8rem] text-[1.2rem] transition-colors ${
                      on ? "bg-sh-black text-sh-white" : "bg-sh-black/[0.06] text-sh-black"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-[0.75rem]">
            <BracketButton size="lg" className="flex-1" onClick={() => setAsking(true)} disabled={!ready}>
              {copies > 1 ? `Print ×${copies}` : "Print"}
            </BracketButton>
            <BracketButton size="lg" variant="secondary" onClick={onRetake}>
              Retake All
            </BracketButton>
          </div>
        </div>
      </section>

      {asking && (
        <PublicPrompt
          onAnswer={(visibility) => {
            setAsking(false);
            onPrint(visibility);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </BoothScreen>
  );
}
