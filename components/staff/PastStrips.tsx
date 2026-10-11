"use client";

import { useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { formatKb, formatWhen } from "./format";
import type { StaffHistoryEntry } from "./staffApi";

const COPY_CHOICES = [1, 2, 3] as const;

/** Pick a saved strip to print again, with 1 to 3 copies. */
export default function PastStrips({
  history,
  disabled,
  onPick,
  onClose,
}: {
  history: StaffHistoryEntry[];
  disabled: boolean;
  onPick: (entry: StaffHistoryEntry, copies: number) => void;
  onClose: () => void;
}) {
  const [copies, setCopies] = useState<number>(1);
  const newestFirst = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-sh-black/60 p-[1.5rem]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-strips-title"
        className="flex max-h-full w-[38rem] max-w-full flex-col rounded-card bg-sh-white p-[1.2rem] text-sh-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[1rem]">
          <h2 id="past-strips-title" className="type-display text-[1.8rem] leading-none">
            Past strips
          </h2>
          <BracketButton variant="secondary" onClick={onClose}>
            Close
          </BracketButton>
        </div>

        <div role="radiogroup" aria-label="Copies" className="mt-[0.8rem] flex items-center gap-[0.5rem]">
          <span className="mr-[0.4rem] text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">
            Copies
          </span>
          {COPY_CHOICES.map((n) => {
            const on = n === copies;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCopies(n)}
                className={`type-display size-[3rem] rounded-[0.8rem] text-[1.3rem] transition-colors ${
                  on ? "bg-sh-black text-sh-white" : "bg-sh-black/[0.06] text-sh-black"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>

        <ul className="mt-[0.8rem] min-h-0 flex-1 space-y-[0.4rem] overflow-y-auto">
          {newestFirst.length === 0 && (
            <li className="py-[1rem] text-center text-[1rem] font-medium text-sh-black/70">No strips saved yet.</li>
          )}
          {newestFirst.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-[0.75rem] rounded-[0.8rem] bg-sh-black/[0.05] px-[0.8rem] py-[0.35rem]"
            >
              <div className="min-w-0">
                <p className="font-semibold">{formatWhen(entry.createdAt)}</p>
                <p className="text-[0.85rem] text-sh-black/70">{formatKb(entry.bytes)}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Reprint strip from ${formatWhen(entry.createdAt)}`}
                onClick={() => onPick(entry, copies)}
                className="type-display min-h-[3rem] shrink-0 rounded-[0.8rem] bg-sh-black px-[1.1rem] text-[1.1rem] text-sh-white transition-[opacity] disabled:opacity-40"
              >
                Reprint
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
