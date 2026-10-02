"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CupsPrinterClient } from "@/lib/cupsPrinterClient";

/** Calls `onIdle` after `ms` without a touch, key press or pointer move. */
export function useIdle(ms: number, onIdle: () => void, active = true) {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    if (!active) return;
    let id = window.setTimeout(() => cb.current(), ms);
    const reset = () => {
      window.clearTimeout(id);
      id = window.setTimeout(() => cb.current(), ms);
    };
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(id);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms, active]);
}

/** Whole seconds left until `ms` from mount; calls `onEnd` once at zero. */
export function useCountdown(ms: number, onEnd: () => void): number {
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  const cb = useRef(onEnd);
  cb.current = onEnd;
  useEffect(() => {
    const end = Date.now() + ms;
    const id = window.setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        window.clearInterval(id);
        cb.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [ms]);
  return left;
}

export type CameraState =
  | { status: "off" }
  | { status: "starting" }
  | { status: "live"; stream: MediaStream }
  | { status: "error"; message: string };

/** Front camera stream, kept open while `active` so retakes start instantly. */
export function useCamera(active: boolean): CameraState {
  const [state, setState] = useState<CameraState>({ status: "off" });

  useEffect(() => {
    if (!active) {
      setState({ status: "off" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "error", message: "Camera unavailable" });
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setState({ status: "starting" });
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setState({ status: "live", stream: s });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Camera unavailable",
          });
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return state;
}

export type PrinterStatus =
  | { kind: "checking" }
  | { kind: "ready"; name: string; warning: string | null }
  | { kind: "offline"; message: string };

/**
 * Print server connection. Never gates shooting: status is informational,
 * and `print` (re)connects on demand.
 */
export function usePrinter(pollMs: number | null) {
  const client = useRef<CupsPrinterClient | null>(null);
  client.current ??= new CupsPrinterClient();
  const [status, setStatus] = useState<PrinterStatus>({ kind: "checking" });

  const refresh = useCallback(async (): Promise<PrinterStatus> => {
    let next: PrinterStatus;
    try {
      const name = await client.current!.connect();
      const health = await client.current!.checkHealth();
      const warning =
        health.queue?.warning ?? health.queue?.printerStatus?.error ?? null;
      next = health.ok
        ? { kind: "ready", name, warning }
        : { kind: "offline", message: warning ?? "Printer not ready" };
    } catch (err) {
      client.current!.disconnect();
      next = {
        kind: "offline",
        message: err instanceof Error ? err.message : "Print server unavailable",
      };
    }
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    if (pollMs === null) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh]);

  const resume = useCallback(async () => {
    try {
      if (!client.current!.connected) await client.current!.connect();
      await client.current!.resumePrinter();
    } catch {
      /* status refresh below reports what's wrong */
    }
    return refresh();
  }, [refresh]);

  /** Throws with a guest-safe message when printing fails. */
  const print = useCallback(async (dataUrl: string) => {
    if (!client.current!.connected) await client.current!.connect();
    return client.current!.printImage(dataUrl);
  }, []);

  return { status, refresh, resume, print };
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
