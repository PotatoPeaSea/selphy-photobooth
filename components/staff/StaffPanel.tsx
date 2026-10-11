"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { useIdle } from "@/components/booth/hooks";
import { BoothScreen } from "@/components/booth/Scene";
import BoothTab from "./BoothTab";
import PinPad from "./PinPad";
import PrinterTab from "./PrinterTab";
import WifiTab from "./WifiTab";
import { fetchStatus, type StaffStatus } from "./staffApi";

/** Walks back to Scan after this long without a touch. */
export const STAFF_IDLE_MS = 120_000;
/** How often the open panel refreshes the queue and printer state. */
const POLL_MS = 4_000;

/** Tabs in order. Each entry needs a case in renderTab. */
const TABS = [
  { id: "printer", label: "Printer" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "booth", label: "Booth" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Session = { pin: string; status: StaffStatus };

/**
 * Staff panel, reached from Scan by the hidden corner gesture. Locked until a
 * PIN checks out. The PIN lives in this component's memory only, never in
 * storage or the URL. Idle for STAFF_IDLE_MS returns to Scan.
 */
export default function StaffPanel({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("printer");
  // Opened tabs stay mounted, so a join or leave in flight keeps its state across tab switches.
  const [opened, setOpened] = useState<TabId[]>(["printer"]);
  // Numbers each status request. The poll and the actions both refresh, so replies can overlap.
  const latestRequest = useRef(0);
  const pin = session?.pin ?? null;

  // Only pointer and key presses count as touches; the status poll does not.
  useIdle(STAFF_IDLE_MS, onExit);

  const lock = useCallback((message: string | null) => {
    setSession(null);
    setLockedBy(message);
    setLinkError(null);
  }, []);

  /**
   * Re-reads status with the current PIN. A rejected PIN locks the panel. A reply
   * that a newer request has overtaken is dropped, so it can't bring back old state.
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (pin === null) return;
    const request = ++latestRequest.current;
    const res = await fetchStatus(pin);
    if (request !== latestRequest.current) return;
    if (res.ok) {
      setSession({ pin, status: res.data });
      setLinkError(null);
    } else if (res.status === 401 || res.status === 403) {
      lock(res.error);
    } else {
      // Keep the last status on screen; say why it may be stale.
      setLinkError(res.error);
    }
  }, [pin, lock]);

  useEffect(() => {
    if (pin === null) return;
    let stopped = false;
    let timer = 0;
    const loop = async () => {
      await refresh();
      if (!stopped) timer = window.setTimeout(loop, POLL_MS);
    };
    timer = window.setTimeout(loop, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [pin, refresh]);

  /** The PIN check is the first status read. Accepted PINs open the panel. */
  const unlock = async (digits: string): Promise<string | null> => {
    const res = await fetchStatus(digits);
    if (!res.ok) return res.error;
    setSession({ pin: digits, status: res.data });
    setLockedBy(null);
    setLinkError(null);
    return null;
  };

  function openTab(id: TabId) {
    setTab(id);
    setOpened((list) => (list.includes(id) ? list : [...list, id]));
  }

  function renderTab(id: TabId, current: Session) {
    switch (id) {
      case "printer":
        return <PrinterTab pin={current.pin} status={current.status} onChanged={refresh} />;
      case "wifi":
        return <WifiTab pin={current.pin} />;
      case "booth":
        return <BoothTab pin={current.pin} />;
    }
  }

  return (
    <BoothScreen className="flex flex-col bg-sh-white px-[1.25rem] pb-[1rem] pt-[1rem] text-sh-black">
      <header className="flex items-center justify-between gap-[1rem]">
        <h1 className="type-display text-[2rem] leading-none">Staff</h1>
        {session && (
          <div role="tablist" aria-label="Staff sections" className="flex gap-[0.5rem]">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => openTab(t.id)}
                  className={`min-h-[3rem] rounded-[0.8rem] px-[1.1rem] text-[1.05rem] font-semibold transition-colors ${
                    on ? "bg-sh-black text-sh-white" : "bg-sh-black/[0.06] text-sh-black"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        <BracketButton variant="secondary" onClick={onExit}>
          Back to booth
        </BracketButton>
      </header>

      {session && linkError && (
        <p role="alert" className="mt-[0.5rem] text-[0.9rem] font-semibold text-sh-orange">
          {linkError} (showing the last status)
        </p>
      )}

      <div className="mt-[0.8rem] flex min-h-0 flex-1 flex-col">
        {session ? (
          TABS.filter((t) => opened.includes(t.id)).map((t) => (
            <div key={t.id} className={t.id === tab ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              {renderTab(t.id, session)}
            </div>
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <PinPad onUnlock={unlock} initialError={lockedBy} />
          </div>
        )}
      </div>
    </BoothScreen>
  );
}
