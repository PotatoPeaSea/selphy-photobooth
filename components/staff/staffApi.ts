import type { PrinterState } from "@/lib/cupsPrinterClient";

/**
 * Browser calls to the staff API. Every call goes through the Next proxy at
 * /api/staff, which forwards the x-staff-pin header; the PIN check and rate
 * limit live in print-server. The PIN stays in the caller's memory only.
 */

export interface StaffJob {
  id: string;
  owner: string;
  size: number;
  submitted: string;
  state: string;
}

export interface StaffHistoryEntry {
  id: string;
  createdAt: string;
  bytes: number;
  jobId: string | null;
}

export interface StaffStatus {
  printer: string | null;
  state: PrinterState;
  guestMessage: string | null;
  alerts: string[];
  jobs: StaffJob[];
  history: StaffHistoryEntry[];
}

export type StaffCall<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export const STATE_LABEL: Record<PrinterState, string> = {
  ready: "Ready",
  busy: "Printing",
  jammed: "Paper jam",
  out_of_paper: "Out of paper",
  out_of_ink: "Out of ink",
  cover_open: "Cover open",
  offline: "Offline",
  disabled: "Disabled",
  unknown: "Unknown",
};

/** Chip colours for each state. Mechanical trouble is orange, like the guest chip. */
export const STATE_TONE: Record<PrinterState, string> = {
  ready: "bg-[#1FA36A] text-sh-white",
  busy: "bg-sh-blue text-sh-white",
  jammed: "bg-sh-orange text-sh-black",
  out_of_paper: "bg-sh-orange text-sh-black",
  out_of_ink: "bg-sh-orange text-sh-black",
  cover_open: "bg-sh-orange text-sh-black",
  offline: "bg-sh-black text-sh-white",
  disabled: "bg-sh-black text-sh-white",
  unknown: "bg-sh-muted text-sh-black",
};

/** keepServerText shows the print server's own message for a 502 or 503, where it says what failed. */
function errorFor(status: number, body: unknown, keepServerText = false): string {
  if (status === 401) return "Wrong PIN";
  if (status === 403) return "The staff panel is turned off on this booth";
  if (status === 429) return "Too many wrong PINs. Wait a minute and try again";
  const message = (body as { error?: unknown } | null)?.error;
  const text = typeof message === "string" ? message : null;
  if (keepServerText && text) return text;
  if (status === 0 || status === 502 || status === 503) return "Print server unavailable";
  return text ?? "Something went wrong";
}

/** A status read with no reply by then counts as the print server being unavailable. */
const READ_TIMEOUT_MS = 15_000;
/** Actions can take longer: a reprint submits a job to CUPS before it answers. */
const ACTION_TIMEOUT_MS = 30_000;
/** The Wi-Fi list runs nmcli's own scan first, which can take up to 40 seconds before it answers. */
const WIFI_SCAN_TIMEOUT_MS = 45_000;
/**
 * A join runs a scan (up to 30 seconds) and then nmcli (up to 45 seconds, the print server's backstop).
 * The client waits past both, so a join that succeeds is not reported as a failure.
 */
const WIFI_CONNECT_TIMEOUT_MS = 90_000;

interface CallOptions {
  /** Overrides the default abort time for this route. */
  timeoutMs?: number;
  /** Shows the print server's own error text, not the generic line for 502 and 503. */
  keepServerText?: boolean;
}

async function call<T>(
  pin: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  options: CallOptions = {}
): Promise<StaffCall<T>> {
  // Without a timeout, a hung request would keep the status poll and the busy state stuck.
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? (method === "GET" ? READ_TIMEOUT_MS : ACTION_TIMEOUT_MS);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/staff/${path}`, {
      method,
      cache: "no-store",
      headers: {
        "x-staff-pin": pin,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return { ok: false, status: res.status, error: errorFor(res.status, data, options.keepServerText) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: errorFor(0, null) };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fills in any list or field the print server left out, so the panel never reads undefined. */
function normalizeStatus(data: Partial<StaffStatus>): StaffStatus {
  return {
    printer: data.printer ?? null,
    state: data.state ?? "unknown",
    guestMessage: data.guestMessage ?? null,
    alerts: data.alerts ?? [],
    jobs: data.jobs ?? [],
    history: data.history ?? [],
  };
}

export async function fetchStatus(pin: string): Promise<StaffCall<StaffStatus>> {
  const res = await call<Partial<StaffStatus>>(pin, "GET", "status");
  return res.ok ? { ok: true, data: normalizeStatus(res.data ?? {}) } : res;
}

export const resumePrinter = (pin: string) =>
  call<{ ok: boolean; state: PrinterState }>(pin, "POST", "resume");

export const cancelJob = (pin: string, jobId: string) =>
  call<{ ok: boolean }>(pin, "POST", "jobs/cancel", { jobId });

export const clearQueue = (pin: string) =>
  call<{ ok: boolean; cancelled: number }>(pin, "POST", "jobs/clear");

export const reprint = (pin: string, historyId: string, copies: number) =>
  call<{ ok: boolean; jobId: string | null }>(pin, "POST", "reprint", { historyId, copies });

export interface WifiNetwork {
  ssid: string;
  /** 0 to 100, as nmcli reports it. */
  signal: number;
  /** nmcli's security text. Empty or "--" means an open network. */
  security: string;
  inUse: boolean;
}

export interface WifiStatus {
  device: string | null;
  connected: { ssid: string; state: string } | null;
  networks: WifiNetwork[];
}

export interface WifiConnectResult {
  ok: boolean;
  message: string;
}

function normalizeWifi(data: Partial<WifiStatus>): WifiStatus {
  return {
    device: data.device ?? null,
    connected: data.connected ?? null,
    networks: data.networks ?? [],
  };
}

export async function fetchWifi(pin: string): Promise<StaffCall<WifiStatus>> {
  const res = await call<Partial<WifiStatus>>(pin, "GET", "wifi", undefined, {
    timeoutMs: WIFI_SCAN_TIMEOUT_MS,
    keepServerText: true,
  });
  return res.ok ? { ok: true, data: normalizeWifi(res.data ?? {}) } : res;
}

/**
 * Open networks send an empty password. The print server checks the length against the scan result.
 * The reply can take up to about 75 seconds on the server, so this call waits longer than the others.
 */
export const connectWifi = (pin: string, ssid: string, password: string) =>
  call<WifiConnectResult>(pin, "POST", "wifi/connect", { ssid, password }, {
    timeoutMs: WIFI_CONNECT_TIMEOUT_MS,
    keepServerText: true,
  });

/** Answered before Chromium is closed, so the reply still reaches the page. */
export const leaveKiosk = (pin: string) => call<{ ok: boolean }>(pin, "POST", "leave-kiosk");
