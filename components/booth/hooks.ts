"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CupsPrinterClient } from "@/lib/cupsPrinterClient";
import { backoffDelay } from "./cameraRecovery";

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
  | { status: "reconnecting" }
  | { status: "live"; stream: MediaStream }
  | { status: "error"; message: string };

export type CameraController = { state: CameraState; restart: () => void };

/** A muted video track that stays muted this long means the feed is gone. */
const MUTE_RECONNECT_MS = 3_000;
/** A stream that stays live this long counts as recovered, so the next drop starts the backoff over. */
const STABLE_MS = 10_000;
/**
 * Failed reconnects before the booth asks for a volunteer instead of saying "Reconnecting".
 * Retries continue, so a camera that comes back still recovers.
 */
const CAMERA_MISSING_AFTER = 4;

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

/**
 * Front camera stream, kept open while `active` so retakes start instantly.
 * A track that ends, or stays muted, is reopened with backoff. `restart`
 * reopens it straight away.
 */
export function useCamera(active: boolean): CameraController {
  const [state, setState] = useState<CameraState>({ status: "off" });
  const reconnectNow = useRef<(() => void) | null>(null);
  const restart = useCallback(() => reconnectNow.current?.(), []);

  useEffect(() => {
    if (!active) {
      setState({ status: "off" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "error", message: "Camera unavailable" });
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | null = null;
    let everLive = false;
    let attempt = 0;
    // Each connect gets a number so a slow getUserMedia that resolves after a
    // newer one has started is dropped, not left holding the camera.
    let generation = 0;
    let retryTimer: number | undefined;
    let muteTimer: number | undefined;
    let stableTimer: number | undefined;

    const onEnded = () => recover();
    const onMute = () => {
      window.clearTimeout(muteTimer);
      muteTimer = window.setTimeout(() => {
        if (track?.muted) recover();
      }, MUTE_RECONNECT_MS);
    };
    const onUnmute = () => window.clearTimeout(muteTimer);

    function release() {
      window.clearTimeout(retryTimer);
      window.clearTimeout(muteTimer);
      window.clearTimeout(stableTimer);
      track?.removeEventListener("ended", onEnded);
      track?.removeEventListener("mute", onMute);
      track?.removeEventListener("unmute", onUnmute);
      track = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    function connect() {
      const mine = ++generation;
      window.clearTimeout(retryTimer);
      navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then(
        (s) => {
          if (cancelled || mine !== generation) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          track = s.getVideoTracks()[0] ?? null;
          track?.addEventListener("ended", onEnded);
          track?.addEventListener("mute", onMute);
          track?.addEventListener("unmute", onUnmute);
          everLive = true;
          // Only a stream that stays up resets the backoff; one that drops at once keeps backing off.
          window.clearTimeout(stableTimer);
          stableTimer = window.setTimeout(() => {
            attempt = 0;
          }, STABLE_MS);
          setState({ status: "live", stream: s });
        },
        (err: unknown) => {
          if (cancelled || mine !== generation) return;
          // A refused permission on the first start is final; the booth shows the error.
          if (!everLive && err instanceof Error && err.name === "NotAllowedError") {
            setState({ status: "error", message: err.message });
            return;
          }
          const delay = backoffDelay(attempt);
          attempt++;
          setState(
            attempt >= CAMERA_MISSING_AFTER
              ? { status: "error", message: "Camera unavailable" }
              : { status: "reconnecting" }
          );
          retryTimer = window.setTimeout(connect, delay);
        }
      );
    }

    /** A dropped or muted track is reopened after backoff, so a device that keeps dropping can't spin. */
    function recover() {
      if (cancelled) return;
      release();
      setState({ status: "reconnecting" });
      retryTimer = window.setTimeout(connect, backoffDelay(attempt));
      attempt++;
    }

    /** The booth asked for a new stream (Start after a lost camera, or a frozen feed): reopen now. */
    function restartNow() {
      if (cancelled) return;
      release();
      attempt = 0;
      setState({ status: "reconnecting" });
      connect();
    }

    reconnectNow.current = restartNow;
    setState({ status: "starting" });
    connect();

    return () => {
      cancelled = true;
      reconnectNow.current = null;
      release();
    };
  }, [active]);

  return { state, restart };
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
  const print = useCallback(async (dataUrl: string, copies = 1) => {
    if (!client.current!.connected) await client.current!.connect();
    return client.current!.printImage(dataUrl, { copies });
  }, []);

  return { status, refresh, resume, print };
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
