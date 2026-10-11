import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createHistory, normaliseExt, resolveHistoryDir } from "./history.mjs";
import {
  acceptsJobs,
  classifyPrinter,
  extractAlerts,
  guestMessage as guestMessageFor,
  isPrintable,
  isRecoverable,
  parseJobs,
  parseQueueOrder,
} from "./printerState.mjs";
import {
  connectWaitSecs,
  connectWifi,
  readDeviceStatus,
  scanNetworks,
  validatePasswordForNetwork,
  validatePasswordShape,
  validateSsid,
} from "./wifi.mjs";

const exec = promisify(execFile);

const PORT = Number(process.env.PRINT_SERVER_PORT ?? 3847);
const PRINTER_NAME = process.env.PRINTER_NAME?.trim() || null;
const MEDIA_OPTION = process.env.CUPS_MEDIA_OPTION ?? "Postcard";
const STAFF_PIN = (process.env.STAFF_PIN ?? "").trim();
// The keypad takes 4 to 8 digits. Any other PIN could never be typed, so the panel stays off
// rather than locking staff out.
const STAFF_PIN_OK = /^\d{4,8}$/.test(STAFF_PIN);
const printHistory = createHistory(resolveHistoryDir(), { log });

const PRINTER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.@-]*$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9_][\w.-]*-\d+$/;

// One global counter for the whole staff panel, not per client: a per-client
// limit would let a brute-forcer rotate addresses. Staff routes are the only
// place a PIN is checked.
const STAFF_FAILURE_LIMIT = 5;
const STAFF_WINDOW_MS = 60_000;
const STAFF_LOCK_MS = 60_000;
let staffFailures = [];
let staffLockedUntil = 0;

const app = express();
// Staff routes get no CORS headers. The Next.js server calls them server-side,
// so browsers have no reason to, and a web page must not be able to try PINs.
// Express routes ignore letter case, so this match ignores it too.
const STAFF_PATH = /^\/staff(?:\/|$)/i;
const boothCors = cors({ origin: true });
app.use((req, res, next) => (STAFF_PATH.test(req.path) ? next() : boothCors(req, res, next)));
// The PIN gate runs before the JSON parser, so an unauthenticated staff body is never read.
app.use("/staff", requireStaffPin);
app.use(express.json({ limit: "20mb" }));
// A malformed body makes express.json throw a SyntaxError whose message quotes the text near the
// error, and that text can be a Wi-Fi password. The default handler would send it back and log
// it, so this handler answers with a fixed message and logs nothing from the error itself.
app.use((err, req, res, next) => {
  if (err?.type !== "entity.parse.failed") {
    next(err);
    return;
  }
  log(`Rejected a malformed JSON body on ${req.method} ${req.path}`);
  res.status(400).json({ error: "Request body is not valid JSON" });
});

function log(...args) {
  console.log("[print-server]", ...args);
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

// Express 4 does not catch rejected promises from async handlers.
function route(handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err) => {
        log("Request failed:", messageOf(err));
        if (!res.headersSent) res.status(500).json({ error: messageOf(err) });
      });
  };
}

async function runCmd(bin, args, timeout = 10_000) {
  const { stdout, stderr } = await exec(bin, args, { timeout });
  return (stdout + stderr).trim();
}

async function listPrinters() {
  try {
    const stdout = await runCmd("lpstat", ["-p"]);
    const lines = stdout.split("\n").filter(Boolean);
    const printers = lines
      .map((line) => {
        const match = line.match(/^printer\s+(\S+)\s+(.+)$/i);
        if (!match) return null;
        const [, name, rest] = match;
        return { name, enabled: !/disabled/i.test(rest), state: rest.trim() };
      })
      .filter(Boolean);

    let defaultPrinter = null;
    try {
      const defOut = await runCmd("lpstat", ["-d"]);
      const defMatch = defOut.match(/system default destination:\s*(\S+)/i);
      if (defMatch) defaultPrinter = defMatch[1];
    } catch {
      /* no default */
    }

    return { printers, defaultPrinter };
  } catch {
    return { printers: [], defaultPrinter: null };
  }
}

async function getPrinterStatus(printer) {
  let raw = "";
  let lookupError = null;
  try {
    raw = await runCmd("lpstat", ["-l", "-p", printer]);
  } catch (err) {
    lookupError = err;
  }

  let state = lookupError ? "unknown" : classifyPrinter(raw);
  const alerts = lookupError ? [] : extractAlerts(raw);

  // lpstat can say "idle" while lpq reports the device is gone; the queue wins.
  if (state === "ready" || state === "busy") {
    const lpq = await runCmd("lpq", ["-P", printer]).catch((err) =>
      `${err.stdout ?? ""}${err.stderr ?? ""}`,
    );
    if (/not ready/i.test(lpq)) state = "offline";
  }

  const headerLine = raw.split("\n").find((line) => /^\s*printer\s/i.test(line)) ?? "";
  const headerRest = headerLine.replace(/^\s*printer\s+\S+\s*/i, "").trim();
  const printing = /now printing/i.test(headerLine);
  const idle = /\bidle\b/i.test(headerLine);
  const disabled = state === "disabled";
  const notReady = state === "offline";
  let reason = alerts.length ? alerts.join(", ") : null;
  if (!reason && lookupError) reason = messageOf(lookupError);
  if (!reason && !disabled) reason = headerRest || null;

  let error = null;
  if (disabled) {
    error = `Printer "${printer}" is disabled in CUPS${reason ? `: ${reason}` : ""}. Check USB/power, then run: cupsenable ${printer} && cupsaccept ${printer}`;
  } else if (notReady) {
    error = `Printer "${printer}" is not ready. Check that it is on, connected, and has paper/ink.`;
  } else if (state === "unknown") {
    error = `Could not read printer status for "${printer}".`;
  }

  return {
    printer,
    state,
    guestMessage: guestMessageFor(state),
    alerts,
    ready: !lookupError && !disabled && !notReady,
    disabled,
    printing,
    idle,
    notReady,
    reason,
    error,
    raw,
  };
}

async function resumePrinter(printer) {
  await runCmd("cupsenable", [printer]);
  await runCmd("cupsaccept", [printer]);
  return getPrinterStatus(printer);
}

async function getQueueStatus(printer) {
  const printerStatus = await getPrinterStatus(printer);

  let jobs = [];
  // A failed lpstat is not an empty queue. The guest's Done screen waits on this flag, so a
  // hiccup never reads as "your job has printed".
  let jobsKnown = true;
  try {
    jobs = parseJobs(await runCmd("lpstat", ["-o"]), printer);
  } catch {
    jobsKnown = false;
  }
  // The guest's Done screen needs every queued job, so the list is not truncated.
  const ordered = parseQueueOrder(jobs, { printer, printerState: printerStatus.state });
  const activeJobId = ordered[0]?.id ?? null;

  let warning = printerStatus.error;
  if (!warning && isRecoverable(printerStatus.state)) warning = printerStatus.guestMessage;
  if (!warning && ordered.length > 1 && printerStatus.printing) {
    warning = `${ordered.length} jobs queued. Active: ${activeJobId ?? "unknown"}.`;
  } else if (!warning && ordered.length > 0 && !printerStatus.ready) {
    warning = `${ordered.length} job(s) pending but printer is not ready.`;
  }

  return {
    printer,
    state: printerStatus.state,
    guestMessage: printerStatus.guestMessage,
    jobCount: ordered.length,
    jobs: ordered,
    jobsKnown,
    activeJobId,
    printerStatus,
    warning,
  };
}

function resolvePrinter(requested, defaultPrinter) {
  return requested?.trim() || PRINTER_NAME || defaultPrinter || null;
}

// Printer names reach execFile arguments, so anything that could read as an option is refused.
function requestedPrinterName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return "";
  return PRINTER_PATTERN.test(name) ? name : null;
}

async function defaultPrinterTarget() {
  const { defaultPrinter } = await listPrinters();
  return resolvePrinter(null, defaultPrinter);
}

function parseImage(image) {
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    return { error: "Expected { image: data:image/...;base64,... }" };
  }
  const match = image.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) return { error: "Invalid image data URL" };
  return { buffer: Buffer.from(match[2], "base64"), ext: normaliseExt(match[1]) };
}

function printArgs(printer, copies) {
  return [
    "-d",
    printer,
    "-n",
    String(copies),
    "-o",
    `PageSize=${MEDIA_OPTION}`,
    "-o",
    "StpiShrinkOutput=Shrink",
    "-o",
    "StpColorCorrection=None",
    "-t",
    "Photobooth strip",
    "-",
  ];
}

function jobIdFrom(stdout) {
  return stdout.match(/request id is\s+(\S+)/i)?.[1] ?? null;
}

// Resolves to { ok, stdout } or { ok: false, error }. The image goes in on stdin, so it never appears in argv.
function runLp(args, buffer) {
  return new Promise((resolve) => {
    const child = execFile(
      "lp",
      args,
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
        if (err) {
          resolve({ ok: false, error: out || messageOf(err) });
        } else {
          resolve({ ok: true, stdout: out });
        }
      },
    );
    // If lp exits before reading all of stdin, the exit callback reports it.
    child.stdin.on("error", () => {});
    child.stdin.end(buffer);
  });
}

function pinMatches(given) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(STAFF_PIN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function recordStaffFailure(now) {
  while (staffFailures.length && now - staffFailures[0] >= STAFF_WINDOW_MS) staffFailures.shift();
  staffFailures.push(now);
  if (staffFailures.length >= STAFF_FAILURE_LIMIT) {
    staffLockedUntil = now + STAFF_LOCK_MS;
    staffFailures = [];
    log("Staff panel locked for 60 s after repeated wrong PINs");
  }
}

function requireStaffPin(req, res, next) {
  res.set("Cache-Control", "no-store");
  if (!STAFF_PIN_OK) {
    res.status(403).json({ error: "Staff panel disabled" });
    return;
  }
  const now = Date.now();
  if (now < staffLockedUntil) {
    res.set("Retry-After", String(Math.ceil((staffLockedUntil - now) / 1000)));
    res.status(429).json({ error: "Too many wrong PINs. Wait a minute and try again." });
    return;
  }
  const given = req.get("x-staff-pin");
  if (given === undefined) {
    // No PIN was tried, so there is no guess to count against the lock.
    res.status(401).json({ error: "Staff PIN required" });
    return;
  }
  if (pinMatches(given)) {
    next();
    return;
  }
  recordStaffFailure(now);
  res.status(401).json({ error: "Wrong PIN" });
}

app.get(
  "/health",
  route(async (_req, res) => {
    const { defaultPrinter } = await listPrinters();
    const printer = resolvePrinter(null, defaultPrinter);
    const queue = printer ? await getQueueStatus(printer) : null;
    const state = queue ? queue.state : "offline";
    res.json({
      ok: Boolean(printer && isPrintable(state)),
      printer,
      media: MEDIA_OPTION,
      port: PORT,
      state,
      guestMessage: queue ? queue.guestMessage : guestMessageFor("offline"),
      queue,
    });
  }),
);

app.get(
  "/queue",
  route(async (req, res) => {
    const { defaultPrinter } = await listPrinters();
    const requested = requestedPrinterName(req.query.printer);
    if (requested === null) {
      res.status(400).json({ error: "Invalid printer name" });
      return;
    }
    const printer = resolvePrinter(requested, defaultPrinter);
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }
    res.json(await getQueueStatus(printer));
  }),
);

// Public on purpose: the guest's Review screen calls it.
app.post(
  "/resume",
  route(async (req, res) => {
    const { defaultPrinter } = await listPrinters();
    const requested = requestedPrinterName(req.body?.printer);
    if (requested === null) {
      res.status(400).json({ error: "Invalid printer name" });
      return;
    }
    const printer = resolvePrinter(requested, defaultPrinter);
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }

    try {
      log(`Resume requested for ${printer}`);
      const status = await resumePrinter(printer);
      log(`Printer status after resume: ready=${status.ready}`);
      res.json({ ok: status.ready, status });
    } catch (err) {
      const message = messageOf(err) || "Could not resume printer";
      log("Resume failed:", message);
      res.status(500).json({ error: message });
    }
  }),
);

app.get(
  "/printers",
  route(async (_req, res) => {
    res.json(await listPrinters());
  }),
);

app.post(
  "/print",
  route(async (req, res) => {
    const { image, copies = 1, printer: requestedPrinter } = req.body ?? {};

    const parsed = parseImage(image);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const requested = requestedPrinterName(requestedPrinter);
    if (requested === null) {
      res.status(400).json({ error: "Invalid printer name" });
      return;
    }

    const { defaultPrinter } = await listPrinters();
    const printer = resolvePrinter(requested, defaultPrinter);
    if (!printer) {
      res.status(503).json({
        error: "No printer configured. Set PRINTER_NAME or choose a CUPS default.",
      });
      return;
    }

    // Mechanical faults (jam, paper, ink, cover) still accept the job: CUPS holds it until staff clear the fault.
    const status = await getPrinterStatus(printer);
    if (!acceptsJobs(status.state)) {
      log("Print blocked — printer not ready:", status.error);
      res.status(503).json({
        error: status.error,
        status,
        hint: `Try: cupsenable ${printer} && cupsaccept ${printer}`,
      });
      return;
    }

    const copyCount = Math.max(1, Math.min(10, Math.floor(Number(copies) || 1)));
    log(`Print request: ${parsed.buffer.length} bytes → ${printer} (PageSize=${MEDIA_OPTION}, state=${status.state})`);

    const result = await runLp(printArgs(printer, copyCount), parsed.buffer);
    if (!result.ok) {
      log("lp failed:", result.error);
      res.status(500).json({ error: result.error });
      return;
    }

    const jobId = jobIdFrom(result.stdout);
    try {
      await printHistory.save(parsed.buffer, { ext: parsed.ext, jobId });
    } catch (err) {
      // The print is already in CUPS; a failed history write must not turn it into an error.
      log("History save failed:", messageOf(err));
    }

    const queueAfter = await getQueueStatus(printer);
    const queued = isRecoverable(status.state);
    log(`Submitted ${jobId ?? "job"} (${status.state}) — queue depth: ${queueAfter.jobCount}`);

    res.json({
      ok: true,
      jobId,
      queued,
      state: status.state,
      guestMessage: status.guestMessage,
      printer,
      message: result.stdout,
      bytes: parsed.buffer.length,
      queue: queueAfter,
      warning: queueAfter.warning,
    });
  }),
);

app.get(
  "/staff/status",
  route(async (_req, res) => {
    const saved = (await printHistory.list()).map(({ id, createdAt, bytes, jobId }) => ({
      id,
      createdAt,
      bytes,
      jobId,
    }));

    const printer = await defaultPrinterTarget();
    if (!printer) {
      res.json({
        printer: null,
        state: "offline",
        guestMessage: guestMessageFor("offline"),
        warning: null,
        alerts: [],
        jobs: [],
        history: saved,
      });
      return;
    }

    const queue = await getQueueStatus(printer);
    res.json({
      printer,
      state: queue.state,
      guestMessage: queue.guestMessage,
      warning: queue.warning,
      alerts: queue.printerStatus.alerts,
      jobs: queue.jobs.map(({ id, owner, size, submitted, state }) => ({
        id,
        owner,
        size,
        submitted,
        state,
      })),
      history: saved,
    });
  }),
);

app.post(
  "/staff/resume",
  route(async (_req, res) => {
    const printer = await defaultPrinterTarget();
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }
    await runCmd("cupsenable", [printer]);
    await runCmd("cupsaccept", [printer]);
    const status = await getPrinterStatus(printer);
    log(`Staff resume for ${printer}: ${status.state}`);
    res.json({
      ok: acceptsJobs(status.state),
      state: status.state,
      guestMessage: status.guestMessage,
      error: status.error,
    });
  }),
);

app.post(
  "/staff/jobs/cancel",
  route(async (req, res) => {
    const jobId = req.body?.jobId;
    if (typeof jobId !== "string" || !JOB_ID_PATTERN.test(jobId)) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }
    const printer = await defaultPrinterTarget();
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }
    // Only jobs that are really in this printer's queue can be cancelled.
    const queue = await getQueueStatus(printer);
    if (!queue.jobs.some((job) => job.id === jobId)) {
      res.status(404).json({ error: "Job is not in the queue" });
      return;
    }
    await runCmd("cancel", [jobId]);
    log(`Staff cancelled ${jobId}`);
    res.json({ ok: true });
  }),
);

app.post(
  "/staff/jobs/clear",
  route(async (_req, res) => {
    const printer = await defaultPrinterTarget();
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }
    const queue = await getQueueStatus(printer);
    await runCmd("cancel", ["-a", printer]);
    log(`Staff cleared ${queue.jobCount} job(s) from ${printer}`);
    res.json({ ok: true, cancelled: queue.jobCount });
  }),
);

app.post(
  "/staff/reprint",
  route(async (req, res) => {
    const { historyId, copies } = req.body ?? {};
    const copyCount = copies === undefined ? 1 : Number(copies);
    if (typeof historyId !== "string") {
      res.status(400).json({ error: "Expected historyId" });
      return;
    }
    if (!Number.isInteger(copyCount) || copyCount < 1 || copyCount > 3) {
      res.status(400).json({ error: "copies must be 1 to 3" });
      return;
    }

    // Reprints come from the saved file the index names. The client never supplies a path.
    const saved = await printHistory.read(historyId);
    if (!saved) {
      res.status(404).json({ error: "Print not found in history" });
      return;
    }

    const printer = await defaultPrinterTarget();
    if (!printer) {
      res.status(503).json({ error: "No printer configured" });
      return;
    }
    const status = await getPrinterStatus(printer);
    if (!acceptsJobs(status.state)) {
      res.status(503).json({
        error: status.error,
        status,
        hint: `Try: cupsenable ${printer} && cupsaccept ${printer}`,
      });
      return;
    }

    const result = await runLp(printArgs(printer, copyCount), saved.bytes);
    if (!result.ok) {
      log("Reprint lp failed:", result.error);
      res.status(500).json({ error: result.error });
      return;
    }
    const jobId = jobIdFrom(result.stdout);
    log(`Staff reprint ${historyId} as ${jobId ?? "job"} (${copyCount} copies)`);
    res.json({
      ok: true,
      jobId,
      queued: isRecoverable(status.state),
      state: status.state,
      guestMessage: status.guestMessage,
    });
  }),
);

app.get(
  "/staff/wifi",
  route(async (_req, res) => {
    try {
      // Run together, so the list takes as long as its slower read, not both added up.
      const [status, networks] = await Promise.all([readDeviceStatus(), scanNetworks()]);
      res.json({ device: status.device, connected: status.connected, networks });
    } catch (err) {
      log("Wi-Fi list failed:", messageOf(err));
      res.status(503).json({ error: `Could not read Wi-Fi: ${messageOf(err)}` });
    }
  }),
);

// One join at a time. The staff browser gives up after 30 s and may be retried while the first
// join is still running, and a second scan and connect would run against the same adapter.
let wifiJoinRunning = false;

// Shape checks run before any command. The security comes from a fresh scan, so the
// client's view of the network is never trusted.
app.post(
  "/staff/wifi/connect",
  route(async (req, res) => {
    const ssidCheck = validateSsid(req.body?.ssid);
    if (!ssidCheck.ok) {
      res.status(400).json({ error: ssidCheck.error });
      return;
    }
    const passwordShape = validatePasswordShape(req.body?.password);
    if (!passwordShape.ok) {
      res.status(400).json({ error: passwordShape.error });
      return;
    }
    if (wifiJoinRunning) {
      res.status(409).json({ error: "A Wi-Fi join is already running. Wait a moment, then check the Wi-Fi tab." });
      return;
    }

    wifiJoinRunning = true;
    try {
      const started = Date.now();
      let networks;
      try {
        networks = await scanNetworks();
      } catch (err) {
        res.status(503).json({ error: `Could not read Wi-Fi: ${messageOf(err)}` });
        return;
      }
      const network = networks.find((entry) => entry.ssid === ssidCheck.ssid);
      if (!network) {
        res.status(404).json({ error: "That network is not in range. Refresh the list and try again." });
        return;
      }
      const check = validatePasswordForNetwork(passwordShape.password, network.security);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }

      // The password is never logged, in any form.
      log(`Wi-Fi connect requested for "${ssidCheck.ssid}" (${network.security || "open"})`);
      const result = await connectWifi(
        ssidCheck.ssid,
        passwordShape.password,
        connectWaitSecs(Date.now() - started),
      );
      log(result.ok ? `Wi-Fi connected to "${ssidCheck.ssid}"` : `Wi-Fi connect to "${ssidCheck.ssid}" failed`);
      res.json(result);
    } finally {
      wifiJoinRunning = false;
    }
  }),
);

// Order matters: the launcher's loop must stop before Chromium does, or it starts Chromium
// again. Two patterns only; anything broader could hit other processes. The Chromium pattern
// matches the kiosk's own command line (the --kiosk flag and its URL, as set in
// deploy/pi/photobooth-kiosk.sh), so an ordinary Chromium window the staff have open is left alone.
const KIOSK_STOP = [
  ["-f", "lwrespawn.*photobooth-kiosk"],
  ["-f", "kiosk .*127\\.0\\.0\\.1:3001"],
];

async function stopKiosk() {
  for (const args of KIOSK_STOP) {
    try {
      await exec("pkill", args, { timeout: 10_000 });
    } catch (err) {
      // pkill exits 1 when nothing matched, which is the normal case here.
      if (err.code !== 1) log(`pkill ${args.join(" ")} failed:`, messageOf(err));
    }
  }
}

app.post(
  "/staff/leave-kiosk",
  route((_req, res) => {
    // The answer goes out first. The kiosk is closed once the response is written, so the
    // staff browser is not cut off before it has its answer.
    res.json({ ok: true });
    res.once("finish", () => {
      log("Staff leaving the booth: closing the kiosk");
      stopKiosk();
    });
  }),
);

app.listen(PORT, "127.0.0.1", () => {
  log(`Listening on http://127.0.0.1:${PORT}`);
  if (PRINTER_NAME) log(`Printer override: ${PRINTER_NAME}`);
  log(`Media: PageSize=${MEDIA_OPTION}`);
  log(`Print history: ${printHistory.dir}`);
  if (STAFF_PIN_OK) log("Staff panel enabled");
  else if (STAFF_PIN) log("Staff panel disabled: STAFF_PIN must be 4 to 8 digits");
  else log("Staff panel disabled (STAFF_PIN unset)");
});
