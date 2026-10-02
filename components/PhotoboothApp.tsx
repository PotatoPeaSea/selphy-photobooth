"use client";

import { useCallback, useRef, useState } from "react";
import DoneScreen, { type PrintState, type ShareState } from "@/components/booth/DoneScreen";
import ModeScreen from "@/components/booth/ModeScreen";
import ReviewScreen from "@/components/booth/ReviewScreen";
import ScanScreen from "@/components/booth/ScanScreen";
import ShootScreen from "@/components/booth/ShootScreen";
import { useCamera, useIdle, usePrinter } from "@/components/booth/hooks";
import {
  DEFAULT_ADDONS,
  printToDataUrl,
  renderPrint,
  toPrinterDataUrl,
  type AddOns,
  type FrameId,
} from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import { galleryBadge, type GalleryBadge, type NfcTap } from "@/lib/nfcChallenge";
import { createStripShareQr } from "@/lib/stripShare";

/** Screens that time out back to scan when nobody touches them. */
const IDLE_MS = 60_000;
const PRINTER_POLL_MS = 10_000;

type Step =
  | { name: "scan" }
  | { name: "mode" }
  | { name: "shoot"; mode: PrintMode }
  | { name: "review"; mode: PrintMode; shots: HTMLCanvasElement[] }
  | { name: "done"; mode: PrintMode; frame: FrameId; print: PrintState; share: ShareState };

/**
 * Scan → Mode → Shoot → Review → Done → Scan.
 * Printer state never blocks shooting; on a failed print the guest still
 * gets a QR code for their photos.
 */
export default function PhotoboothApp() {
  const [step, setStep] = useState<Step>({ name: "scan" });
  const [frame, setFrame] = useState<FrameId>("stormy");
  // Every guest starts from the default extras (tagline + confetti).
  const [addons, setAddons] = useState<AddOns>(DEFAULT_ADDONS);
  // Bumped on every reset so late async results from an old session are ignored.
  const session = useRef(0);
  const printing = useRef(false);
  // The guest's badge tap from Scan (null if they skipped), saved with their photos.
  const badge = useRef<GalleryBadge | null>(null);

  const cameraOn = step.name === "mode" || step.name === "shoot" || step.name === "review";
  const camera = useCamera(cameraOn);
  const printer = usePrinter(step.name === "review" ? PRINTER_POLL_MS : null);

  const reset = useCallback(() => {
    session.current++;
    badge.current = null;
    setFrame("stormy");
    setAddons(DEFAULT_ADDONS);
    setStep({ name: "scan" });
  }, []);

  useIdle(IDLE_MS, reset, step.name === "mode" || step.name === "shoot" || step.name === "review");

  const admit = useCallback((tap: NfcTap | null) => {
    badge.current = tap ? galleryBadge(tap) : null;
    setStep({ name: "mode" });
  }, []);

  async function print(mode: PrintMode, shots: HTMLCanvasElement[], visibility: "public" | "private") {
    if (printing.current) return; // a second tap must not send a second job
    printing.current = true;
    const id = session.current;
    const chosen = frame;
    const extras = addons;
    let shareUrl: string;
    let printUrl: string;
    try {
      const canvas = await renderPrint({ mode, frame: chosen, photos: shots, addons: extras });
      shareUrl = printToDataUrl(canvas); // upright, landscape for the grid
      printUrl = toPrinterDataUrl(canvas); // always portrait for the Selphy
    } finally {
      printing.current = false;
    }
    if (session.current !== id) return;
    setStep({ name: "done", mode, frame: chosen, print: { kind: "printing" }, share: { kind: "pending" } });

    const patch = (p: Partial<Extract<Step, { name: "done" }>>) =>
      setStep((s) => (session.current === id && s.name === "done" ? { ...s, ...p } : s));

    createStripShareQr(shareUrl, window.location.origin, visibility, badge.current).then(
      (qr) => patch({ share: { kind: "ready", qr } }),
      () => patch({ share: { kind: "failed" } })
    );
    printer.print(printUrl).then(
      () => patch({ print: { kind: "sent" } }),
      (err: unknown) =>
        patch({ print: { kind: "failed", message: err instanceof Error ? err.message : "Print failed" } })
    );
  }

  switch (step.name) {
    case "scan":
      return <ScanScreen onAdmitted={admit} />;
    case "mode":
      return <ModeScreen onPick={(mode) => setStep({ name: "shoot", mode })} onBack={reset} />;
    case "shoot":
      return (
        <ShootScreen
          mode={step.mode}
          camera={camera}
          onDone={(shots) => setStep({ name: "review", mode: step.mode, shots })}
          onBack={() => setStep({ name: "mode" })}
        />
      );
    case "review":
      return (
        <ReviewScreen
          mode={step.mode}
          shots={step.shots}
          frame={frame}
          onFrame={setFrame}
          addons={addons}
          onAddons={setAddons}
          printer={printer.status}
          onPrinterTap={() => void printer.resume()}
          onPrint={(visibility) => void print(step.mode, step.shots, visibility)}
          onRetake={() => setStep({ name: "shoot", mode: step.mode })}
        />
      );
    case "done":
      return (
        <DoneScreen
          mode={step.mode}
          frame={step.frame}
          print={step.print}
          share={step.share}
          onFinish={reset}
        />
      );
  }
}
