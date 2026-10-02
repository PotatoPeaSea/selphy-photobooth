"use client";

import { useEffect, useRef, useState } from "react";
import { BracketButton, Headline, Tagline, TertiaryLogo } from "@/components/brand/Brand";
import {
  classifyTap,
  type NfcHealth,
  type NfcTap,
  type TapPopup,
} from "@/lib/nfcChallenge";
import { BoothScreen, OtterScene } from "./Scene";

const NOTICE_MS = 8000;
const ADMIT_MS = 2400;
const POLL_MS = 400;

type LinkState = "unknown" | "online" | "offline";

function idleCopy(link: LinkState, configError: string | null, readerMissing: boolean) {
  const headline = "Tap your badge on the reader";
  if (link === "offline") return { headline, subtext: "Badge reader offline — skip the scan to keep going" };
  if (configError) return { headline, subtext: configError };
  if (readerMissing) return { headline, subtext: "Plug in the badge reader, or skip the scan" };
  return { headline, subtext: "Check in for points, then strike a pose" };
}

function resultCopy(popup: TapPopup): { headline: string; subtext: string } {
  if (popup.kind === "first") {
    const points = `+${popup.points} ${popup.points === 1 ? "point" : "points"}`;
    return {
      headline: popup.name ? `You’re in, ${popup.name.split(" ")[0]}!` : "You’re checked in!",
      subtext: `${points} for your first visit — let’s take some photos`,
    };
  }
  if (popup.kind === "repeat") {
    return {
      headline: popup.name ? `Welcome back, ${popup.name.split(" ")[0]}!` : "Welcome back!",
      subtext: "No points this time, but snap away",
    };
  }
  return { headline: "Badge not recognized", subtext: popup.message };
}

/** Attract screen: badge check-in (NFC polling) or skip straight to the booth. */
export default function ScanScreen({ onAdmitted }: { onAdmitted: () => void }) {
  const [link, setLink] = useState<LinkState>("unknown");
  const [health, setHealth] = useState<NfcHealth | null>(null);
  const [popup, setPopup] = useState<TapPopup | null>(null);
  const [copy, setCopy] = useState(() => idleCopy("unknown", null, false));
  const [visible, setVisible] = useState(true);
  const fadeTimer = useRef<number | null>(null);

  // Poll the badge station; the first response only primes "last seen".
  useEffect(() => {
    let stopped = false;
    let primed = false;
    let seenAt: string | null = null;
    let inFlight = false;

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/nfc", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          health?: NfcHealth | null;
          last?: NfcTap | null;
        };
        if (stopped) return;
        setHealth(data.health ?? null);
        if (!data.ok) {
          setLink("offline");
          return;
        }
        setLink("online");
        const at = data.last?.at ?? null;
        if (!primed) {
          primed = true;
          seenAt = at;
          return;
        }
        if (!at || at === seenAt) return;
        seenAt = at;
        const next = classifyTap(data.last);
        if (next) setPopup(next);
      } catch {
        if (!stopped) setLink("offline");
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  const configError = link === "online" ? health?.configError?.trim() || null : null;
  const readerMissing = link === "online" && !configError && health != null && !health.reader;

  // Cross-fade the status copy.
  useEffect(() => {
    const next = popup ? resultCopy(popup) : idleCopy(link, configError, readerMissing);
    setVisible(false);
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      setCopy(next);
      setVisible(true);
    }, 180);
    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, [popup, link, configError, readerMissing]);

  // Successful taps admit after a beat; notices clear themselves.
  useEffect(() => {
    if (!popup) return;
    const id =
      popup.kind === "notice"
        ? window.setTimeout(() => setPopup(null), NOTICE_MS)
        : window.setTimeout(onAdmitted, ADMIT_MS);
    return () => window.clearTimeout(id);
  }, [popup, onAdmitted]);

  const admitted = popup != null && popup.kind !== "notice";
  const notice = popup?.kind === "notice";

  return (
    <BoothScreen
      grain
      className="bg-sh-blue text-sh-white"
      onClick={() => {
        if (admitted) onAdmitted();
      }}
    >
      <Tagline className="absolute left-[1.5rem] top-[1.25rem] text-[0.8rem]" />

      <div className="absolute bottom-0 right-[1rem] top-[2.5rem] w-[27rem]">
        <OtterScene
          key={admitted ? "yay" : "idle"}
          otter="otter-pink"
          frame="brackets"
          className={admitted ? "animate-rise" : ""}
        />
      </div>

      <div className="absolute left-[1.5rem] top-1/2 w-[33rem] -translate-y-1/2">
        <Headline line1="Snap With" line2="StormHacks" className="text-[4.6rem]" />

        <div
          className="mt-[1.75rem] min-h-[5.25rem] transition-opacity duration-150"
          style={{ opacity: visible ? 1 : 0 }}
          role="status"
        >
          <p className="flex items-center gap-[0.6rem] text-[1.45rem] font-semibold leading-tight">
            <span
              className={`inline-block size-[0.7rem] shrink-0 rounded-full ${
                notice ? "bg-sh-orange" : admitted ? "bg-sh-yellow" : "animate-pulse bg-sh-white"
              }`}
            />
            {copy.headline}
          </p>
          <p className="mt-[0.4rem] pl-[1.3rem] text-[1rem] font-medium text-sh-white/80">
            {copy.subtext}
          </p>
        </div>

        <BracketButton
          variant={admitted ? "inverse" : "secondary"}
          className="mt-[1.25rem]"
          onClick={(e) => {
            e.stopPropagation();
            onAdmitted();
          }}
        >
          {admitted ? "Let’s Go" : "Skip Scan"}
        </BracketButton>
      </div>

      <TertiaryLogo className="absolute bottom-[1.25rem] left-[1.5rem] h-[1.1rem]" />
    </BoothScreen>
  );
}
