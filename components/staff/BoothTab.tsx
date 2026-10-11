"use client";

import { useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { leaveKiosk } from "./staffApi";

type Phase = "idle" | "confirm" | "leaving" | "left";

/**
 * The confirm panel opens over the Leave button's spot, so a quick second tap on Leave
 * can land on Yes. Yes ignores taps for this long after the panel opens.
 */
const CONFIRM_GUARD_MS = 500;

/**
 * Booth tab: closes the photo app so the desktop is usable again. The request
 * answers before Chromium is killed, so success shows the closing message once.
 * That page goes away with Chromium, so nothing depends on the message being seen.
 */
export default function BoothTab({ pin }: { pin: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const confirmOpenedAt = useRef(0);

  function openConfirm() {
    confirmOpenedAt.current = Date.now();
    setPhase("confirm");
  }

  function confirmLeave() {
    if (Date.now() - confirmOpenedAt.current < CONFIRM_GUARD_MS) return;
    void leave();
  }

  async function leave() {
    setPhase("leaving");
    setError(null);
    const res = await leaveKiosk(pin);
    if (res.ok && res.data.ok) {
      setPhase("left");
      return;
    }
    setError(res.ok ? "The booth did not close. Try again." : res.error);
    setPhase("idle");
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" data-testid="booth-tab">
      <section
        aria-labelledby="booth-title"
        className="flex w-full max-w-[40rem] flex-col gap-[1rem] rounded-card bg-sh-black/[0.05] p-[1.5rem]"
      >
        <h2 id="booth-title" className="type-display text-[2rem] leading-none">
          Leave booth
        </h2>

        {phase === "left" ? (
          <p role="status" className="text-[1.1rem] font-semibold leading-snug">
            Closing the photo app and opening the desktop. To come back to the booth, double-click Back to Booth on
            the desktop.
          </p>
        ) : phase === "leaving" ? (
          <p role="status" className="text-[1.1rem] font-semibold leading-snug">
            Closing the photo app and opening the desktop.
          </p>
        ) : (
          <p className="text-[1.05rem] leading-snug text-sh-black/80">
            Leaving the booth opens the desktop and closes the photo app. Guests cannot use the booth until someone
            starts it again.
          </p>
        )}

        {error && (
          <p role="alert" className="text-[1rem] font-semibold text-sh-orange">
            {error}
          </p>
        )}

        {phase === "idle" && (
          <div>
            <BracketButton onClick={openConfirm}>Leave booth (open desktop)</BracketButton>
          </div>
        )}

        {phase === "confirm" && (
          <div
            role="group"
            aria-label="Confirm leave booth"
            className="flex flex-col gap-[0.8rem] rounded-card bg-sh-orange p-[1rem] text-sh-black"
          >
            <p className="text-[1.05rem] font-semibold leading-snug">
              Leave the booth now? The photo app closes and the desktop opens. To come back, double-click Back to
              Booth on the desktop.
            </p>
            <div className="flex flex-wrap gap-[0.6rem]">
              <BracketButton onClick={confirmLeave}>Yes, leave booth</BracketButton>
              <BracketButton variant="secondary" onClick={() => setPhase("idle")}>
                Stay in booth
              </BracketButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
