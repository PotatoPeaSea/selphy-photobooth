"use client";

import { useState } from "react";
import { BracketButton } from "@/components/brand/Brand";

/** The shortest and longest PIN the keypad takes. The print server enforces the same range. */
const MIN_DIGITS = 4;
const MAX_DIGITS = 8;
/** Dots always shown, so the row doesn't jump while the PIN is short. */
const MIN_DOTS = 4;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * On-screen PIN keypad. The digits live in this component's memory only:
 * they clear after a wrong PIN and go away with the panel.
 * `onUnlock` resolves to an error message, or null when the PIN was accepted.
 */
export default function PinPad({
  onUnlock,
  initialError = null,
}: {
  onUnlock: (pin: string) => Promise<string | null>;
  /** Why the panel locked again, when it did not lock by the staff member's own choice. */
  initialError?: string | null;
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const press = (key: string) => {
    setError(null);
    setDigits((d) => (d.length < MAX_DIGITS ? d + key : d));
  };

  async function unlock() {
    if (digits.length < MIN_DIGITS || busy) return;
    setBusy(true);
    const message = await onUnlock(digits);
    setBusy(false);
    if (message) {
      setError(message);
      setDigits("");
    }
  }

  const dots = Math.max(MIN_DOTS, digits.length);

  return (
    <section className="flex flex-col items-center" aria-label="Staff PIN">
      <p className="text-[0.85rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">Staff only</p>
      <h2 className="type-display mt-[0.3rem] text-[2.2rem]">Enter PIN</h2>

      <div
        className="mt-[0.9rem] flex h-[1.25rem] items-center gap-[0.8rem]"
        role="img"
        aria-label={`${digits.length} digits entered`}
        data-testid="pin-dots"
      >
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            className={`size-[0.9rem] rounded-full ${
              i < digits.length ? "bg-sh-black" : "ring-2 ring-inset ring-sh-black/35"
            }`}
          />
        ))}
      </div>

      <p role="alert" className="mt-[0.5rem] min-h-[1.5rem] text-[0.95rem] font-semibold text-sh-orange">
        {error ?? ""}
      </p>

      <div className="mt-[0.4rem] grid w-[19rem] grid-cols-3 gap-[0.5rem]">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            data-digit={d}
            onClick={() => press(d)}
            className="type-display flex h-[3.75rem] items-center justify-center rounded-card bg-sh-black/[0.06] text-[1.9rem] transition-colors active:bg-sh-black/15"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete last digit"
          onClick={() => setDigits((d) => d.slice(0, -1))}
          className="flex h-[3.75rem] items-center justify-center rounded-card bg-sh-black/[0.06] text-[1.4rem] font-semibold transition-colors active:bg-sh-black/15"
        >
          ⌫
        </button>
        <button
          type="button"
          data-digit="0"
          onClick={() => press("0")}
          className="type-display flex h-[3.75rem] items-center justify-center rounded-card bg-sh-black/[0.06] text-[1.9rem] transition-colors active:bg-sh-black/15"
        >
          0
        </button>
        <button
          type="button"
          aria-label="Clear all digits"
          onClick={() => setDigits("")}
          className="flex h-[3.75rem] items-center justify-center rounded-card bg-sh-black/[0.06] text-[0.95rem] font-semibold uppercase tracking-[0.08em] transition-colors active:bg-sh-black/15"
        >
          Clear
        </button>
      </div>

      <BracketButton
        size="lg"
        className="mt-[0.6rem] w-[19rem]"
        onClick={() => void unlock()}
        disabled={digits.length < MIN_DIGITS || busy}
      >
        {busy ? "Checking" : "Unlock"}
      </BracketButton>
    </section>
  );
}
