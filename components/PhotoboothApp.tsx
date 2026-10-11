"use client";

import { useCallback, useRef, useState } from "react";
import DoneScreen, { type PrintState, type ShareState } from "@/components/booth/DoneScreen";
import ModeScreen, { DEFAULT_DELAY } from "@/components/booth/ModeScreen";
import ReviewScreen from "@/components/booth/ReviewScreen";
import ScanScreen from "@/components/booth/ScanScreen";
import ShootScreen from "@/components/booth/ShootScreen";
import { useCamera, useIdle, usePrinter } from "@/components/booth/hooks";
import StaffPanel from "@/components/staff/StaffPanel";
import {
  DEFAULT_ADDONS,
  printToDataUrl,
  renderPrint,
  singleStripDataUrl,
  toPrinterDataUrl,
  type AddOns,
  type FrameId,
} from "@/lib/print/frames";
import type { PrintMode } from "@/lib/print/layouts";
import { galleryBadge, type GalleryBadge, type NfcTap } from "@/lib/nfcChallenge";
import { shareFrames, shareQrDataUrl, shareStrip } from "@/lib/stripShare";

/** Screens that time out back to scan when nobody touches them. */
const IDLE_MS = 60_000;
const PRINTER_POLL_MS = 10_000;

type Step =
  | { name: "scan" }
  | { name: "staff" }
  | { name: "mode" }
  | { name: "shoot"; mode: PrintMode }
  | { name: "review"; mode: PrintMode; shots: HTMLCanvasElement[] }
  | { name: "done"; mode: PrintMode; frame: FrameId; print: PrintState; share: ShareState };

/**
 * Scan → Mode → Shoot → Review → Done → Scan. Staff reach the staff panel from
 * Scan by a hidden gesture, and it returns to Scan.
 * Printer state never blocks shooting; on a failed print the guest still
 * gets a QR code for their photos, and a held print prints once staff clear it.
 */
export default function PhotoboothApp() {
  const [step, setStep] = useState<Step>({ name: "scan" });
  const [frame, setFrame] = useState<FrameId>("stormy");
  // Every guest starts from the default extras (tagline + confetti).
  const [addons, setAddons] = useState<AddOns>(DEFAULT_ADDONS);
  const [copies, setCopies] = useState(1);
  const [delay, setDelay] = useState(DEFAULT_DELAY);
  // True while the four shots run; the idle timeout waits for the run to finish.
  const [shooting, setShooting] = useState(false);
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
    setCopies(1);
    setDelay(DEFAULT_DELAY);
    setStep({ name: "scan" });
  }, []);

  // A run with camera recoveries can outlast IDLE_MS, and a reset would discard its shots.
  useIdle(
    IDLE_MS,
    reset,
    step.name === "mode" || step.name === "review" || (step.name === "shoot" && !shooting)
  );

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
    const count = copies;
    let shareUrl: string;
    let stripUrl: string;
    try {
      // The digital copy has no QR code; it's what the QR code links to.
      const canvas = await renderPrint({ mode, frame: chosen, photos: shots, addons: extras });
      shareUrl = printToDataUrl(canvas); // upright, landscape for the grid
      stripUrl = singleStripDataUrl(canvas, mode); // one strip, for the zip
    } finally {
      printing.current = false;
    }
    if (session.current !== id) return;
    setStep({ name: "done", mode, frame: chosen, print: { kind: "printing" }, share: { kind: "pending" } });

    const patch = (p: Partial<Extract<Step, { name: "done" }>>) =>
      setStep((s) => (session.current === id && s.name === "done" ? { ...s, ...p } : s));

    const shared = shareStrip(shareUrl, window.location.origin, visibility, badge.current);
    const link = shared.then((s) => s.link);
    link.then(shareQrDataUrl).then(
      (qr) => patch({ share: { kind: "ready", qr } }),
      () => patch({ share: { kind: "failed" } })
    );

    // The print always waits for the link so it carries the QR code. /api/share
    // falls back from the gallery to Blob to this machine's disk, so only a
    // total failure prints without one.
    const qrUrl = await link.catch(() => null);
    try {
      const canvas = await renderPrint({ mode, frame: chosen, photos: shots, addons: extras, qrUrl });
      // The strip in the guest's zip matches the print, QR code and all.
      if (qrUrl) stripUrl = singleStripDataUrl(canvas, mode);
      const sent = await printer.print(toPrinterDataUrl(canvas), count); // always portrait for the Selphy
      // A jam or empty tray holds the job in the queue; it prints once staff clear it.
      patch({
        print: sent.queued
          ? { kind: "queued", jobId: sent.jobId, guestMessage: sent.guestMessage }
          : { kind: "sent" },
      });
    } catch (err: unknown) {
      patch({ print: { kind: "failed", message: err instanceof Error ? err.message : "Print failed" } });
    }

    // The individual shots follow once the print is away, so they never hold
    // up its QR code. Gallery uploads only; it still runs if the guest leaves.
    shared
      .then((s) => (s.photoId ? shareFrames(s.photoId, stripUrl, shots) : undefined))
      .catch((err: unknown) => console.error("Frames upload failed:", err));
  }

  switch (step.name) {
    case "scan":
      return <ScanScreen onAdmitted={admit} onStaff={() => setStep({ name: "staff" })} />;
    case "staff":
      // Locks itself back to Scan after 120 s without a touch.
      return <StaffPanel onExit={reset} />;
    case "mode":
      return (
        <ModeScreen
          delay={delay}
          onDelay={setDelay}
          onPick={(mode) => setStep({ name: "shoot", mode })}
          onBack={reset}
        />
      );
    case "shoot":
      return (
        <ShootScreen
          mode={step.mode}
          delay={delay}
          camera={camera.state}
          onRestartCamera={camera.restart}
          onRunningChange={setShooting}
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
          copies={copies}
          onCopies={setCopies}
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
