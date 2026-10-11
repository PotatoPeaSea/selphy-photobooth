// Wi-Fi for the staff panel. The parsers and validators are pure. The nmcli wrappers
// run through execFile with argument arrays, never a shell.
import { execFile } from "node:child_process";

// The staff browser gives up on the list after 15 s and on a join after 30 s
// (components/staff/staffApi.ts), so every server-side wait has to finish inside those.
const SCAN_TIMEOUT_MS = 12_000;
const STATUS_TIMEOUT_MS = 10_000;
// A join's scan and nmcli wait share this budget, which ends before the browser's 30 s.
const CONNECT_BUDGET_MS = 25_000;
const CONNECT_MIN_WAIT_SECS = 5;
// nmcli gives up after --wait; the backstop past that only matters if nmcli itself hangs.
const CONNECT_BACKSTOP_GRACE_MS = 2_000;

const SCAN_ARGS = ["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "auto"];
const STATUS_ARGS = ["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev", "status"];

const SSID_MAX_BYTES = 32;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 63;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// WPA passphrases are printable ASCII, and the staff keyboard types nothing else.
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/**
 * Splits one `nmcli -t` line on unescaped colons. In terse mode nmcli writes a literal
 * colon as "\:" and a literal backslash as "\\".
 */
export function splitTerseLine(line) {
  const fields = [];
  let field = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      field += line[i + 1];
      i += 1;
    } else if (ch === ":") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** Open networks show an empty security column in terse mode, or "--" in the table. */
export function isOpenSecurity(security) {
  const value = String(security ?? "").trim();
  return value === "" || value === "--";
}

/** 802.1X (enterprise) needs a username and certificate, which the panel cannot enter. */
function isEnterpriseSecurity(security) {
  return /802\.1x|eap/i.test(String(security ?? ""));
}

function signalOf(raw) {
  const value = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Parses `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list`. Hidden networks (empty
 * SSID) and lines with too few fields are dropped. Each SSID appears once, with the
 * strongest signal and its security; inUse is true if any access point with that name is
 * in use. Strongest first, then by name. Open networks come back with security "".
 */
export function parseWifiList(text) {
  const bySsid = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitTerseLine(line);
    if (fields.length < 4) continue;
    const [inUse, ssid, signal, ...security] = fields;
    if (!ssid) continue;
    const securityText = security.join(":").trim();
    const entry = {
      ssid,
      signal: signalOf(signal),
      security: isOpenSecurity(securityText) ? "" : securityText,
      inUse: inUse.trim() === "*",
    };
    const previous = bySsid.get(ssid);
    if (!previous) {
      bySsid.set(ssid, entry);
    } else {
      const stronger = entry.signal > previous.signal ? entry : previous;
      bySsid.set(ssid, { ...stronger, inUse: previous.inUse || entry.inUse });
    }
  }
  return [...bySsid.values()].sort((a, b) => {
    if (b.signal !== a.signal) return b.signal - a.signal;
    if (a.ssid === b.ssid) return 0;
    return a.ssid < b.ssid ? -1 : 1;
  });
}

/**
 * Parses `nmcli -t -f DEVICE,TYPE,STATE,CONNECTION dev status` into the Wi-Fi device and
 * the network it is joined to. connected is null when the device has no connection.
 */
export function parseDevStatus(text) {
  const wifi = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitTerseLine(line);
    if (fields.length < 4) continue;
    const [device, type, state, ...connection] = fields;
    if (type !== "wifi") continue;
    wifi.push({ device, state, connection: connection.join(":") });
  }
  // With more than one Wi-Fi device, the one that is joined to a network is the one to show.
  const chosen = wifi.find((d) => d.connection && d.connection !== "--") ?? wifi[0] ?? null;
  if (!chosen) return { device: null, connected: null };
  const joined = chosen.connection && chosen.connection !== "--";
  return {
    device: chosen.device,
    connected: joined ? { ssid: chosen.connection, state: chosen.state } : null,
  };
}

/** { ok: true, ssid } or { ok: false, error }. Runs before anything else is called. */
export function validateSsid(ssid) {
  if (typeof ssid !== "string" || Buffer.byteLength(ssid) === 0) {
    return { ok: false, error: "Choose a network first" };
  }
  if (Buffer.byteLength(ssid) > SSID_MAX_BYTES) {
    return { ok: false, error: "That network name is too long" };
  }
  // nmcli would read a leading "-" as an option.
  if (CONTROL_CHARS.test(ssid) || ssid.startsWith("-")) {
    return { ok: false, error: "This network name can't be used" };
  }
  return { ok: true, ssid };
}

/**
 * Shape only: empty is allowed, because an open network needs no password. Whether the
 * network wants one is decided by validatePasswordForNetwork, from a fresh scan.
 */
export function validatePasswordShape(password) {
  if (password === undefined || password === null) return { ok: true, password: "" };
  if (typeof password !== "string") return { ok: false, error: "Password must be text" };
  if (password === "") return { ok: true, password };
  if (!PRINTABLE_ASCII.test(password)) {
    return { ok: false, error: "Use letters, numbers and common symbols only" };
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { ok: false, error: "Wi-Fi passwords are 8 to 63 characters" };
  }
  return { ok: true, password };
}

/** Checks the password against the security the network reported in the scan. */
export function validatePasswordForNetwork(password, security) {
  const shape = validatePasswordShape(password);
  if (!shape.ok) return shape;
  if (isEnterpriseSecurity(security)) {
    return { ok: false, error: "This network needs a username and certificate, which this panel can't enter" };
  }
  if (isOpenSecurity(security)) {
    return shape.password === ""
      ? shape
      : { ok: false, error: "This network is open, so leave the password empty" };
  }
  if (shape.password === "") return { ok: false, error: "This network needs a password" };
  return shape;
}

/**
 * The nmcli --wait for a join that has already spent elapsedMs on its scan: what is left of
 * the budget, never less than a few seconds.
 */
export function connectWaitSecs(elapsedMs) {
  const left = Math.floor((CONNECT_BUDGET_MS - Math.max(0, elapsedMs)) / 1000);
  return Math.max(CONNECT_MIN_WAIT_SECS, left);
}

/** nmcli arguments for joining a network. An open network gets no password argument. */
export function connectArgs(ssid, password, waitSecs = CONNECT_BUDGET_MS / 1000) {
  const args = ["--wait", String(waitSecs), "dev", "wifi", "connect", ssid];
  if (password) args.push("password", password);
  return args;
}

function runNmcli(args, timeout) {
  return new Promise((resolve) => {
    execFile("nmcli", args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) {
        resolve({ ok: true, stdout: String(stdout) });
        return;
      }
      // err.message would echo the whole command, password included, so it is never used.
      const firstLine = `${stderr ?? ""}\n${stdout ?? ""}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      const fallback = err.code === "ENOENT" ? "nmcli is not installed" : "NetworkManager did not respond";
      resolve({
        ok: false,
        timedOut: Boolean(err.killed),
        message: (firstLine ?? fallback).replace(/^Error:\s*/, ""),
      });
    });
  });
}

/** Scans and parses the list. Throws with nmcli's own message when it cannot. */
export async function scanNetworks() {
  const result = await runNmcli(SCAN_ARGS, SCAN_TIMEOUT_MS);
  if (!result.ok) throw new Error(result.message);
  return parseWifiList(result.stdout);
}

/** Reads the Wi-Fi device and its connection without scanning. Throws on nmcli failure. */
export async function readDeviceStatus() {
  const result = await runNmcli(STATUS_ARGS, STATUS_TIMEOUT_MS);
  if (!result.ok) throw new Error(result.message);
  return parseDevStatus(result.stdout);
}

function connectFailure(result, password) {
  if (result.timedOut) return "Connecting took too long. Try again.";
  if (/secret|802|password/i.test(result.message)) {
    return "The network did not accept the password. Check it and try again.";
  }
  // nmcli should never echo the password, but if it did, the answer must not carry it.
  const scrubbed = password ? result.message.split(password).join("********") : result.message;
  return `Could not connect. ${scrubbed}`.slice(0, 300);
}

/**
 * Joins a network. Resolves { ok, message }; the password is never part of the message.
 * waitSecs is the nmcli --wait, from connectWaitSecs.
 */
export async function connectWifi(ssid, password, waitSecs = CONNECT_BUDGET_MS / 1000) {
  const backstopMs = waitSecs * 1000 + CONNECT_BACKSTOP_GRACE_MS;
  const result = await runNmcli(connectArgs(ssid, password, waitSecs), backstopMs);
  if (result.ok) return { ok: true, message: `Connected to ${ssid}` };
  return { ok: false, message: connectFailure(result, password) };
}
