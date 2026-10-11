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

function errorFor(status: number, body: unknown): string {
  if (status === 401) return "Wrong PIN";
  if (status === 403) return "The staff panel is turned off on this booth";
  if (status === 429) return "Too many wrong PINs. Wait a minute and try again";
  if (status === 0 || status === 502 || status === 503) return "Print server unavailable";
  const message = (body as { error?: unknown } | null)?.error;
  return typeof message === "string" ? message : "Something went wrong";
}

/** A status read with no reply by then counts as the print server being unavailable. */
const READ_TIMEOUT_MS = 15_000;
/** Actions can take longer: a reprint submits a job to CUPS before it answers. */
const ACTION_TIMEOUT_MS = 30_000;

async function call<T>(pin: string, method: "GET" | "POST", path: string, body?: unknown): Promise<StaffCall<T>> {
  // Without a timeout, a hung request would keep the status poll and the busy state stuck.
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    method === "GET" ? READ_TIMEOUT_MS : ACTION_TIMEOUT_MS
  );
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
    if (!res.ok) return { ok: false, status: res.status, error: errorFor(res.status, data) };
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
