// Pure printer-state helpers. No I/O: callers pass the text from
// `lpstat -l -p <printer>` and the text from `lpstat -o`.

const RECOVERABLE = new Set(["jammed", "out_of_paper", "out_of_ink", "cover_open"]);

const GUEST_OFFLINE = "Printer offline — you’ll still get a QR code";

const GUEST_MESSAGES = Object.freeze({
  jammed: "Printer jammed — staff are on it",
  out_of_paper: "Out of paper — staff are on it",
  out_of_ink: "Out of ink — staff are on it",
  cover_open: "Printer cover is open — staff are on it",
  offline: GUEST_OFFLINE,
  disabled: GUEST_OFFLINE,
  unknown: GUEST_OFFLINE,
});

// Device description lines can contain words like "ink" (a printer called
// "Ink Station", a URI, or the PPD path "Interface: /etc/cups/ppd/<queue>.ppd"
// that CUPS prints under the queue's name). They describe the device, not its
// state, so skip them.
const DEVICE_LINE =
  /^\s*(description|connection|interfaces?|location|information|make and model|device uri|uri)\s*:/i;

const KEYWORDS = {
  disabledHeader: /\bdisabled\b|\bstopped\b|\bpaused\b/i,
  disabledDetail: /\bdisabled\b|\bpaused\b/i,
  offline: /offline|not ready|not responding|not connected|no device|unreachable|connecting-to-device/i,
  jammed: /(?:^|[^a-z])jam(?:med)?(?![a-z])/i,
  outOfPaper: /media-empty|media-needed|out of paper|no paper/i,
  outOfInk: /marker-supply-empty|out of ink|(?:^|[^a-z])ink(?![a-z])/i,
  coverOpen: /cover-open|door-open|cover open|door open/i,
};

/**
 * Classify the text of `lpstat -l -p <printer>`.
 * Priority: disabled > offline > jammed > out_of_paper > out_of_ink >
 * cover_open > busy > ready. Text without a "printer <name>" header is unknown.
 */
export function classifyPrinter(lpstatText) {
  const lines = String(lpstatText ?? "").split(/\r?\n/);
  const headerAt = lines.findIndex((line) => /^\s*printer\s+\S+/i.test(line));
  if (headerAt === -1) return "unknown";

  // The printer name is stripped so a printer called "Jam" or "Ink" cannot match.
  const header = lines[headerAt].replace(/^\s*printer\s+\S+\s*/i, "");
  const detail = lines
    .filter((line, i) => i !== headerAt && !DEVICE_LINE.test(line) && !line.includes("://"))
    .join("\n");

  if (KEYWORDS.disabledHeader.test(header) || KEYWORDS.disabledDetail.test(detail)) return "disabled";
  if (KEYWORDS.offline.test(header) || KEYWORDS.offline.test(detail)) return "offline";
  if (KEYWORDS.jammed.test(detail)) return "jammed";
  if (KEYWORDS.outOfPaper.test(detail)) return "out_of_paper";
  if (KEYWORDS.outOfInk.test(detail)) return "out_of_ink";
  if (KEYWORDS.coverOpen.test(detail)) return "cover_open";
  if (/now printing|processing/i.test(header)) return "busy";
  return "ready";
}

/** Reason tokens such as "media-jam-error" from an Alerts line or a bare reason line. */
export function extractAlerts(lpstatText) {
  const alerts = new Set();
  for (const raw of String(lpstatText ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const labelled = line.match(/^(alerts|printer-state-reasons)\s*:\s*(.*)$/i);
    if (labelled) {
      for (const token of labelled[2].split(/[,\s]+/)) {
        if (token && token.toLowerCase() !== "none") alerts.add(token);
      }
    } else if (/^[a-z][a-z-]*-(error|warning|report)$/i.test(line)) {
      alerts.add(line);
    }
  }
  return [...alerts];
}

/** Guest-facing wording, or null when the guest needs no message. */
export function guestMessage(state) {
  return Object.hasOwn(GUEST_MESSAGES, state) ? GUEST_MESSAGES[state] : null;
}

/** Mechanical problems that staff can clear. Prints are still accepted and held in the queue. */
export function isRecoverable(state) {
  return RECOVERABLE.has(state);
}

/** Ready or busy: the printer is fine and takes prints. */
export function isPrintable(state) {
  return state === "ready" || state === "busy";
}

/** Whether POST /print accepts a job in this state (printable, or recoverable and held). */
export function acceptsJobs(state) {
  return isPrintable(state) || isRecoverable(state);
}

/**
 * Parse `lpstat -o` lines. Each line is "<printer>-<n> <owner> <size> <date>".
 * With a printer name, only that printer's jobs are kept; the match is on the
 * exact printer part of the id, so "Canon-2" does not match printer "Canon".
 */
export function parseJobs(lpstatOutput, printer = null) {
  const jobs = [];
  for (const raw of String(lpstatOutput ?? "").split(/\r?\n/)) {
    const match = raw.trim().match(/^(\S+)\s+(\S+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, id, owner, size, submitted] = match;
    const idParts = id.match(/^(.+)-(\d+)$/);
    if (!idParts) continue;
    if (printer !== null && idParts[1] !== printer) continue;
    jobs.push({ id, owner, size: Number(size), submitted: submitted.trim() });
  }
  return jobs;
}

function jobState(index, printerState) {
  if (index !== 0) return "queued";
  if (printerState === "busy") return "printing";
  if (isRecoverable(printerState)) return "stalled";
  return "queued";
}

/**
 * Queue order with `ahead` (jobs before this one) and a coarse `state` per job.
 * Takes parsed jobs, or lpstat text which is parsed first.
 */
export function parseQueueOrder(source, { printer = null, printerState = null } = {}) {
  const jobs = typeof source === "string" ? parseJobs(source, printer) : source;
  return jobs.map((job, index) => ({
    ...job,
    ahead: index,
    state: jobState(index, printerState),
  }));
}
