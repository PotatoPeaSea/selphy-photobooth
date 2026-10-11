/** Browser uses same-origin Next.js proxy; server-side can talk to CUPS directly. */
export function printApiBase(): string {
  if (typeof window !== "undefined") return "/api/print";
  return (
    process.env.PRINT_SERVER_URL?.trim() ||
    `http://127.0.0.1:${process.env.PRINT_SERVER_PORT ?? "3847"}`
  );
}

/** Printer state from the print server, classified from CUPS (printerState.mjs). */
export type PrinterState =
  | "ready"
  | "busy"
  | "jammed"
  | "out_of_paper"
  | "out_of_ink"
  | "cover_open"
  | "offline"
  | "disabled"
  | "unknown";

export interface PrintQueueJob {
  id: string;
  owner?: string;
  size?: number;
  submitted?: string;
  state?: string;
  /** Jobs ahead of this one in the queue. */
  ahead?: number;
}

export interface PrintQueueStatus {
  jobCount: number;
  jobs?: PrintQueueJob[];
  /** False when the queue could not be read. An empty list then says nothing about the jobs. */
  jobsKnown?: boolean;
  warning: string | null;
  printerStatus?: {
    ready: boolean;
    disabled: boolean;
    error: string | null;
    reason: string | null;
  } | null;
}

export interface PrintServerHealth {
  /** True only when the printer is ready or busy. Queued-but-jammed prints still get accepted. */
  ok: boolean;
  printer: string | null;
  media: string;
  state?: PrinterState;
  /** Guest-facing wording for a mechanical problem, or null when there is none. */
  guestMessage?: string | null;
  queue?: PrintQueueStatus | null;
}

export interface PrintImageResult {
  jobId: string | null;
  warning: string | null;
  /** Accepted but held until staff clear the printer. Not an error. */
  queued: boolean;
  guestMessage: string | null;
}

export interface PrinterInfo {
  name: string;
  enabled: boolean;
  state: string;
}

export class CupsPrinterClient {
  private baseUrl: string;
  private connectedPrinter: string | null = null;

  constructor(baseUrl = printApiBase()) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  get connected(): boolean {
    return this.connectedPrinter !== null;
  }

  get printerName(): string | null {
    return this.connectedPrinter;
  }

  static isSupported(): boolean {
    return typeof fetch !== "undefined";
  }

  private healthUrl(): string {
    return this.baseUrl.startsWith("http")
      ? `${this.baseUrl}/health`
      : `${this.baseUrl}/health`;
  }

  private printersUrl(): string {
    return this.baseUrl.startsWith("http")
      ? `${this.baseUrl}/printers`
      : `${this.baseUrl}/printers`;
  }

  private printUrl(): string {
    return this.baseUrl.startsWith("http")
      ? `${this.baseUrl}/print`
      : this.baseUrl;
  }

  async checkHealth(): Promise<PrintServerHealth> {
    const res = await fetch(this.healthUrl(), { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Print server unavailable");
    }
    return res.json() as Promise<PrintServerHealth>;
  }

  async listPrinters(): Promise<{
    printers: PrinterInfo[];
    defaultPrinter: string | null;
  }> {
    const res = await fetch(this.printersUrl(), { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to list printers");
    return res.json();
  }

  async connect(printer?: string): Promise<string> {
    const health = await this.checkHealth();
    const name = printer ?? health.printer;
    if (!name) {
      throw new Error(
        "No printer found. Start the print server and set PRINTER_NAME or a CUPS default."
      );
    }
    this.connectedPrinter = name;
    return name;
  }

  disconnect(): void {
    this.connectedPrinter = null;
  }

  async resumePrinter(): Promise<{ ok: boolean; error?: string }> {
    if (!this.connectedPrinter) throw new Error("Printer not connected");

    const res = await fetch("/api/print/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer: this.connectedPrinter }),
    });

    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      status?: { error?: string };
    } | null;

    if (!res.ok) {
      throw new Error(body?.error ?? "Could not resume printer");
    }

    return {
      ok: Boolean(body?.ok),
      error: body?.status?.error ?? undefined,
    };
  }

  async printImage(
    imageDataUrl: string,
    opts: { copies?: number; onProgress?: (pct: number) => void } = {}
  ): Promise<PrintImageResult> {
    if (!this.connectedPrinter) throw new Error("Printer not connected");

    opts.onProgress?.(10);

    const res = await fetch(this.printUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageDataUrl,
        copies: opts.copies ?? 1,
        printer: this.connectedPrinter,
      }),
    });

    opts.onProgress?.(90);

    const body = (await res.json().catch(() => null)) as {
      error?: string;
      jobId?: string | null;
      warning?: string | null;
      queued?: boolean;
      guestMessage?: string | null;
      message?: string;
    } | null;

    if (!res.ok) {
      throw new Error(body?.error ?? "Print failed");
    }

    opts.onProgress?.(100);
    return {
      jobId: body?.jobId ?? null,
      warning: body?.warning ?? null,
      queued: body?.queued === true,
      guestMessage: body?.guestMessage ?? null,
    };
  }
}
