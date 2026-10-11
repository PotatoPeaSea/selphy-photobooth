"use client";

import { useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import PastStrips from "./PastStrips";
import { formatKb } from "./format";
import {
  STATE_LABEL,
  STATE_TONE,
  cancelJob,
  clearQueue,
  reprint,
  resumePrinter,
  type StaffCall,
  type StaffHistoryEntry,
  type StaffJob,
  type StaffStatus,
} from "./staffApi";

type Notice = { tone: "ok" | "error"; text: string };

/** States where someone has to clear the printer by hand before a resume helps. */
const NEEDS_HANDS = new Set(["jammed", "out_of_paper", "out_of_ink", "cover_open"]);

/**
 * Printer tab: state, queue with cancel, clear queue (confirmed), resume,
 * and reprint. Each action refreshes the status when it finishes.
 */
export default function PrinterTab({
  pin,
  status,
  onChanged,
}: {
  pin: string;
  status: StaffStatus;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const { state, jobs, history } = status;
  const working = busy !== null;
  const last = history.reduce<StaffHistoryEntry | undefined>(
    (best, h) => (!best || h.createdAt > best.createdAt ? h : best),
    undefined
  );

  async function perform<T>(
    label: string,
    request: () => Promise<StaffCall<T>>,
    describe: (data: T) => Notice
  ) {
    setBusy(label);
    setNotice(null);
    const res = await request();
    setBusy(null);
    setNotice(res.ok ? describe(res.data) : { tone: "error", text: res.error });
    await onChanged();
  }

  const resume = () =>
    perform("resume", () => resumePrinter(pin), (d) =>
      d.ok
        ? { tone: "ok", text: "Printer resumed" }
        : { tone: "error", text: `Printer not ready: ${STATE_LABEL[d.state]}` }
    );

  const cancel = (job: StaffJob) =>
    perform(`cancel:${job.id}`, () => cancelJob(pin, job.id), (d) =>
      d.ok ? { tone: "ok", text: `Cancelled ${job.id}` } : { tone: "error", text: `Could not cancel ${job.id}` }
    );

  const clear = () => {
    setConfirmClear(false);
    return perform("clear", () => clearQueue(pin), (d) => {
      if (!d.ok) return { tone: "error", text: "Could not clear the queue" };
      return { tone: "ok", text: `Cleared ${d.cancelled} ${d.cancelled === 1 ? "job" : "jobs"}` };
    });
  };

  const reprintStrip = (entry: StaffHistoryEntry, copies: number) => {
    setPastOpen(false);
    return perform(`reprint:${entry.id}`, () => reprint(pin, entry.id, copies), (d) =>
      d.ok
        ? { tone: "ok", text: `Reprinting ${copies === 1 ? "one copy" : `${copies} copies`}` }
        : { tone: "error", text: "Reprint failed" }
    );
  };

  const needsHands = NEEDS_HANDS.has(state);
  const clearable = confirmClear && jobs.length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-[0.6rem]" data-testid="printer-tab">
      <div className="grid min-h-0 flex-1 grid-cols-[19rem_1fr] gap-[1rem]">
        <div className="flex min-h-0 flex-col gap-[0.75rem] overflow-y-auto pr-[0.2rem]">
          <div className="rounded-card bg-sh-black/[0.05] p-[1rem]">
            <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">Printer</p>
            <p
              className={`type-display mt-[0.5rem] inline-flex min-h-[2.5rem] items-center rounded-full px-[1rem] text-[1.3rem] ${STATE_TONE[state]}`}
              data-testid="printer-state"
              data-state={state}
            >
              {STATE_LABEL[state]}
            </p>
            {status.printer && <p className="mt-[0.5rem] truncate text-[0.9rem] text-sh-black/70">{status.printer}</p>}
            {status.guestMessage && (
              <p className="mt-[0.6rem] text-[0.95rem] font-semibold leading-snug">
                Guests see: “{status.guestMessage}”
              </p>
            )}
            {status.alerts.slice(0, 2).map((alert, i) => (
              <p key={i} className="mt-[0.3rem] line-clamp-2 text-[0.85rem] leading-snug text-sh-black/80">
                {alert}
              </p>
            ))}
            {needsHands && (
              <p className="mt-[0.6rem] text-[0.85rem] font-semibold">Clear the problem at the printer, then resume.</p>
            )}
          </div>

          <BracketButton className="w-full" onClick={() => void resume()} disabled={working}>
            Resume printer
          </BracketButton>
          <BracketButton
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (last) void reprintStrip(last, 1);
            }}
            disabled={working || !last}
          >
            Reprint last strip
          </BracketButton>
          <BracketButton
            variant="secondary"
            className="w-full"
            onClick={() => setPastOpen(true)}
            disabled={working || history.length === 0}
          >
            Past strips
          </BracketButton>
          <BracketButton
            variant="secondary"
            className="w-full"
            onClick={() => setConfirmClear(true)}
            disabled={working || jobs.length === 0}
          >
            Clear queue
          </BracketButton>
        </div>

        <section className="flex min-h-0 flex-col rounded-card bg-sh-black/[0.05] p-[0.9rem]" aria-label="Print queue">
          <div className="flex items-center justify-between gap-[1rem]">
            <h2 className="type-display text-[1.5rem] leading-none">Queue</h2>
            <p className="text-[0.95rem] font-semibold text-sh-black/70">
              {jobs.length === 0 ? "Empty" : `${jobs.length} waiting`}
            </p>
          </div>

          {clearable && (
            <div
              role="group"
              aria-label="Confirm clear queue"
              className="mt-[0.7rem] flex flex-wrap items-center gap-[0.6rem] rounded-card bg-sh-orange p-[0.7rem] text-sh-black"
            >
              <p className="min-w-0 flex-1 text-[1rem] font-semibold leading-snug">
                Cancel all {jobs.length} waiting {jobs.length === 1 ? "job" : "jobs"}?
              </p>
              <BracketButton onClick={() => void clear()} disabled={working}>
                Clear all
              </BracketButton>
              <BracketButton variant="secondary" onClick={() => setConfirmClear(false)} disabled={working}>
                Keep jobs
              </BracketButton>
            </div>
          )}

          {jobs.length === 0 ? (
            <p className="mt-[1rem] text-center text-[1rem] font-medium text-sh-black/70">No jobs waiting.</p>
          ) : (
            <ul className="mt-[0.7rem] min-h-0 flex-1 space-y-[0.45rem] overflow-y-auto pr-[0.2rem]">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center gap-[0.75rem] rounded-[0.8rem] bg-sh-white px-[0.8rem] py-[0.45rem]"
                  data-job={job.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[1rem] font-semibold">{job.id}</p>
                    <p className="truncate text-[0.85rem] text-sh-black/70">
                      {[job.owner, job.submitted, formatKb(job.size), job.state].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={working}
                    aria-label={`Cancel job ${job.id}`}
                    onClick={() => void cancel(job)}
                    className="min-h-[3rem] shrink-0 rounded-[0.8rem] bg-sh-black/[0.08] px-[1rem] text-[0.95rem] font-semibold transition-[opacity] disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`flex min-h-[2.75rem] items-center rounded-card px-[1rem] text-[1rem] font-semibold ${
          notice?.tone === "error" ? "bg-sh-orange text-sh-black" : "bg-sh-black/[0.06] text-sh-black"
        }`}
        data-testid="staff-notice"
      >
        {working ? "Working…" : (notice?.text ?? "")}
      </p>

      {pastOpen && (
        <PastStrips history={history} disabled={working} onPick={(entry, n) => void reprintStrip(entry, n)} onClose={() => setPastOpen(false)} />
      )}
    </div>
  );
}
