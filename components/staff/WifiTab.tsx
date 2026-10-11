"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import OnScreenKeyboard, { KEYBOARD_MAX } from "./OnScreenKeyboard";
import { connectWifi, fetchWifi, type WifiNetwork, type WifiStatus } from "./staffApi";

type Notice = { tone: "ok" | "error" | "busy"; text: string };

/**
 * Passphrases run 8 to 63 characters. print-server applies that rule to every
 * network, WEP included, so the panel checks the same length before it sends.
 */
const WPA_MIN = 8;

/** Four signal bars, shortest first. */
const BAR_HEIGHTS = ["h-[0.45rem]", "h-[0.8rem]", "h-[1.15rem]", "h-[1.5rem]"] as const;

/** nmcli reports an open network with an empty security field or "--". */
function isOpen(security: string): boolean {
  const s = security.trim();
  return s === "" || s === "--";
}

/** 802.1X and EAP need a username and certificate, which this panel cannot enter. Same test as print-server. */
function isEnterprise(security: string): boolean {
  return /802\.1x|eap/i.test(security);
}

/** The joined network first, then the strongest signal, then name. */
function sortNetworks(list: WifiNetwork[]): WifiNetwork[] {
  return [...list].sort(
    (a, b) => Number(b.inUse) - Number(a.inUse) || b.signal - a.signal || a.ssid.localeCompare(b.ssid)
  );
}

function SignalBars({ signal }: { signal: number }) {
  const lit = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : signal > 0 ? 1 : 0;
  return (
    <span
      role="img"
      aria-label={`Signal ${signal}%`}
      className="flex h-[1.5rem] w-[1.45rem] shrink-0 items-end gap-[0.12rem]"
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span key={h} className={`w-[0.27rem] rounded-[1px] bg-current ${h} ${i < lit ? "" : "opacity-25"}`} />
      ))}
    </span>
  );
}

function LockMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label="Secured"
      className="size-[1.1rem] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor" stroke="none" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Wi-Fi tab: the current network, a rescan, and the networks in range. A
 * secured network opens the password field and touch keyboard; an open one
 * joins after one confirm tap. The password lives in this component's memory
 * only and is cleared after a successful join.
 */
export default function WifiTab({ pin }: { pin: string }) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Numbers each scan request, so an older reply can't overwrite a newer list.
  const latestScan = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const request = ++latestScan.current;
    setScanning(true);
    const res = await fetchWifi(pin);
    if (request !== latestScan.current) return;
    setScanning(false);
    if (res.ok) {
      setStatus(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error);
    }
  }, [pin]);

  useEffect(() => {
    void load();
  }, [load]);

  const networks = sortNetworks(status?.networks ?? []);
  const connected = status?.connected ?? null;
  const selected = networks.find((n) => n.ssid === selectedSsid) ?? null;
  const secured = selected !== null && !isOpen(selected.security);
  const enterprise = selected !== null && isEnterprise(selected.security);
  const passwordReady = password.length >= WPA_MIN && password.length <= KEYBOARD_MAX;

  const hint =
    password.length === 0
      ? `Type the password. ${WPA_MIN} to ${KEYBOARD_MAX} characters.`
      : passwordReady
        ? `${password.length} characters, ready to connect.`
        : `${WPA_MIN - password.length} more to go.`;

  // Until a scan works, the list and the current network are unknown, not empty.
  const scanFailed = status === null && loadError !== null && !scanning;
  const currentLabel = connected?.ssid ?? (status !== null ? "Not connected" : scanFailed ? "Unknown" : "Checking");

  function choose(network: WifiNetwork) {
    // Tapping the row that is already open keeps what was typed.
    if (joining || network.ssid === selectedSsid) return;
    setSelectedSsid(network.ssid);
    setPassword("");
    setReveal(false);
    setNotice(null);
  }

  function clearSelection() {
    setSelectedSsid(null);
    setPassword("");
    setReveal(false);
  }

  async function join(network: WifiNetwork) {
    const secret = isOpen(network.security) ? "" : password;
    setJoining(true);
    setNotice({ tone: "busy", text: `Joining ${network.ssid}. This can take up to a minute and a half.` });
    const res = await connectWifi(pin, network.ssid, secret);
    setJoining(false);
    if (res.ok && res.data.ok) {
      setNotice({ tone: "ok", text: res.data.message || `Connected to ${network.ssid}` });
      clearSelection();
    } else if (res.ok) {
      setNotice({ tone: "error", text: res.data.message || "Could not join that network" });
    } else {
      setNotice({ tone: "error", text: res.error });
    }
    await load();
  }

  const noAdapter = status !== null && status.device === null;

  return (
    <div className="flex min-h-0 flex-1 gap-[1rem]" data-testid="wifi-tab">
      <div className="flex min-h-0 w-[21rem] shrink-0 flex-col gap-[0.6rem]">
        <div className="rounded-card bg-sh-black/[0.05] p-[0.9rem]" data-testid="wifi-current">
          <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-sh-black/60">Current network</p>
          <p className="type-display mt-[0.4rem] truncate text-[1.5rem] leading-tight">
            {currentLabel}
          </p>
          {connected && <p className="mt-[0.2rem] truncate text-[0.9rem] text-sh-black/70">{connected.state}</p>}
          {status?.device && <p className="truncate text-[0.85rem] text-sh-black/60">Adapter {status.device}</p>}
        </div>

        <BracketButton
          variant="secondary"
          className="w-full"
          onClick={() => void load()}
          disabled={scanning || joining}
        >
          {scanning ? "Scanning" : "Refresh"}
        </BracketButton>

        {loadError && (
          <p role="alert" className="text-[0.9rem] font-semibold text-sh-orange">
            {loadError}
          </p>
        )}

        <section
          aria-label="Networks in range"
          className="flex min-h-0 flex-1 flex-col rounded-card bg-sh-black/[0.05] p-[0.4rem]"
        >
          {noAdapter ? (
            <p className="m-auto px-[0.6rem] text-center text-[1rem] font-medium text-sh-black/70">
              No Wi-Fi adapter found on this booth.
            </p>
          ) : networks.length === 0 ? (
            <p className="m-auto px-[0.6rem] text-center text-[1rem] font-medium text-sh-black/70">
              {status === null
                ? scanFailed
                  ? "Could not read the networks. Tap Refresh to try again."
                  : "Scanning for networks."
                : "No networks found. Tap Refresh to scan again."}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-[0.35rem] overflow-y-auto pr-[0.15rem]">
              {networks.map((n) => {
                const on = n.ssid === selectedSsid;
                return (
                  <li key={n.ssid}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={joining}
                      onClick={() => choose(n)}
                      className={`flex min-h-[3.4rem] w-full items-center gap-[0.7rem] rounded-[0.8rem] px-[0.75rem] py-[0.35rem] text-left transition-colors disabled:opacity-60 ${
                        on ? "bg-sh-black text-sh-white" : "bg-sh-white text-sh-black"
                      }`}
                    >
                      <SignalBars signal={n.signal} />
                      <span className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold">{n.ssid}</span>
                      {n.inUse && (
                        <span className="shrink-0 text-[0.75rem] font-semibold uppercase tracking-[0.08em]">
                          Connected
                        </span>
                      )}
                      {!isOpen(n.security) && <LockMark />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-[0.6rem]" aria-label="Join a network">
        <p
          role="status"
          aria-live="polite"
          className={`flex min-h-[2.75rem] items-center rounded-card px-[1rem] text-[1rem] font-semibold ${
            notice?.tone === "error" ? "bg-sh-orange text-sh-black" : "bg-sh-black/[0.06] text-sh-black"
          }`}
          data-testid="wifi-notice"
        >
          {notice?.text ?? ""}
        </p>

        {selected === null ? (
          <div className="flex flex-1 items-center justify-center rounded-card bg-sh-black/[0.05] p-[1rem] text-center text-[1.1rem] font-medium text-sh-black/70">
            Tap a network to join it.
          </div>
        ) : !secured ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-[1rem] rounded-card bg-sh-black/[0.05] p-[1.2rem]">
            {/* break-words wraps a long unbroken name, so the whole name and the question mark stay on screen. */}
            <h2 className="type-display max-w-full break-words text-[1.8rem] leading-none">
              Join {selected.ssid}?
            </h2>
            <p className="text-[1rem] font-medium">This network has no password.</p>
            <div className="flex gap-[0.6rem]">
              <BracketButton onClick={() => void join(selected)} disabled={joining}>
                Join
              </BracketButton>
              <BracketButton variant="secondary" onClick={clearSelection} disabled={joining}>
                Cancel
              </BracketButton>
            </div>
          </div>
        ) : enterprise ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-[1rem] rounded-card bg-sh-black/[0.05] p-[1.2rem]">
            <h2 className="type-display max-w-full break-words text-[1.8rem] leading-none">{selected.ssid}</h2>
            <p className="text-[1rem] font-medium">
              This network needs a username and certificate, which this panel can’t enter.
            </p>
            <BracketButton variant="secondary" onClick={clearSelection}>
              Cancel
            </BracketButton>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-[0.6rem] rounded-card bg-sh-black/[0.05] p-[0.8rem]">
            <div className="flex items-center justify-between gap-[0.8rem]">
              <h2 className="type-display min-w-0 truncate text-[1.5rem] leading-none">{selected.ssid}</h2>
              <BracketButton variant="secondary" onClick={clearSelection} disabled={joining}>
                Cancel
              </BracketButton>
            </div>

            <div className="flex items-stretch gap-[0.5rem]">
              <input
                type={reveal ? "text" : "password"}
                value={password}
                readOnly
                inputMode="none"
                autoComplete="off"
                aria-label="Wi-Fi password"
                aria-describedby="wifi-password-hint"
                className="min-h-[3.25rem] min-w-0 flex-1 rounded-[0.8rem] bg-sh-white px-[0.9rem] text-[1.3rem] font-semibold outline-none"
              />
              <button
                type="button"
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
                className="min-h-[3.25rem] min-w-[5.5rem] rounded-[0.8rem] bg-sh-black/[0.08] px-[0.8rem] text-[1rem] font-semibold transition-colors active:bg-sh-black/15"
              >
                {reveal ? "Hide" : "Show"}
              </button>
              <BracketButton onClick={() => void join(selected)} disabled={!passwordReady || joining}>
                {joining ? "Joining" : "Connect"}
              </BracketButton>
            </div>
            <p id="wifi-password-hint" className="text-[0.9rem] font-medium text-sh-black/70">
              {hint}
            </p>

            {/* Keyed by network, so shift and the symbol layer reset when staff pick another one. */}
            <OnScreenKeyboard key={selected.ssid} value={password} onChange={setPassword} disabled={joining} />
          </div>
        )}
      </section>
    </div>
  );
}
