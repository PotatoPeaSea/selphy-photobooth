import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptsJobs,
  classifyPrinter,
  extractAlerts,
  guestMessage,
  isPrintable,
  isRecoverable,
  parseJobs,
  parseQueueOrder,
} from "../printerState.mjs";

const header = "printer TestPrinter is idle.  enabled since Sun 11 Oct 2026 10:00:00 AM BST";

function longOutput(alertLine, { headerLine = header } = {}) {
  return [
    headerLine,
    "\tForm mounted:",
    "\tDescription: Photobooth SELPHY ink station",
    "\tConnection: direct usb",
    alertLine,
  ].join("\n");
}

describe("classifyPrinter", () => {
  it("reads an idle, healthy printer as ready", () => {
    assert.equal(classifyPrinter(longOutput("\tAlerts: none")), "ready");
    assert.equal(classifyPrinter(header), "ready");
  });

  it("reads a printing printer as busy", () => {
    const text = "printer TestPrinter now printing TestPrinter-12.  enabled since Sun 11 Oct 2026";
    assert.equal(classifyPrinter(text), "busy");
  });

  it("reads a CUPS-disabled printer as disabled, whatever the reasons", () => {
    const text = "printer TestPrinter disabled since Sun 11 Oct 2026 10:00:00 AM BST -\n\tpaused";
    assert.equal(classifyPrinter(text), "disabled");
    assert.equal(classifyPrinter(longOutput("\tAlerts: media-jam-error").replace(header, "printer TestPrinter disabled since Sun 11 Oct 2026 -")), "disabled");
  });

  it("maps each mechanical alert to its state", () => {
    assert.equal(classifyPrinter(longOutput("\tAlerts: media-jam-error")), "jammed");
    assert.equal(classifyPrinter(longOutput("\tAlerts: media-empty-error")), "out_of_paper");
    assert.equal(classifyPrinter(longOutput("\tAlerts: media-needed-warning")), "out_of_paper");
    assert.equal(classifyPrinter(longOutput("\tAlerts: marker-supply-empty-error")), "out_of_ink");
    assert.equal(classifyPrinter(longOutput("\tAlerts: cover-open-error")), "cover_open");
    assert.equal(classifyPrinter(longOutput("\tAlerts: door-open-error")), "cover_open");
  });

  it("recognises jam wording in free text", () => {
    assert.equal(classifyPrinter(longOutput("\tprinter-state-reasons: paper jam")), "jammed");
    assert.equal(classifyPrinter(longOutput("\tAlerts: jammed")), "jammed");
  });

  it("reads an offline device as offline", () => {
    assert.equal(classifyPrinter(longOutput("\tAlerts: offline-report")), "offline");
    assert.equal(classifyPrinter(longOutput("\tAlerts: none").replace("is idle", "is not responding")), "offline");
  });

  it("applies the priority order when several reasons are present", () => {
    assert.equal(classifyPrinter(longOutput("\tAlerts: cover-open-error, media-jam-error")), "jammed");
    assert.equal(classifyPrinter(longOutput("\tAlerts: marker-supply-empty-error, media-empty-error")), "out_of_paper");
    assert.equal(classifyPrinter(longOutput("\tAlerts: cover-open-error, marker-supply-empty-error")), "out_of_ink");
    assert.equal(classifyPrinter(longOutput("\tAlerts: offline-report, media-jam-error")), "offline");
    assert.equal(
      classifyPrinter(longOutput("\tAlerts: media-jam-error").replace("is idle", "disabled since Sun 11 Oct 2026 -")),
      "disabled",
    );
  });

  it("ignores the printer name and device description when matching keywords", () => {
    // A printer called "Jam" or "Ink" must not look jammed or out of ink.
    assert.equal(classifyPrinter("printer Jam_Ink is idle.  enabled since Sun 11 Oct 2026"), "ready");
    assert.equal(
      classifyPrinter("printer Ink-Station is idle.  enabled since Sun 11 Oct 2026\n\tDescription: Ink and jam station\n\tAlerts: none"),
      "ready",
    );
    assert.equal(classifyPrinter("printer TestPrinter now printing Ink-12.  enabled since Sun 11 Oct 2026"), "busy");
  });

  it("does not read the queue name in the Interface (PPD path) line as state", () => {
    // CUPS prints "Interface: /etc/cups/ppd/<queue>.ppd" in the long listing.
    const block = (queue, alert = "none") =>
      [
        `printer ${queue} is idle.  enabled since Sun 11 Oct 2026 10:00:00 AM BST`,
        "\tForm mounted:",
        "\tDescription: Photobooth SELPHY",
        "\tConnection: direct usb",
        `\tInterface: /etc/cups/ppd/${queue}.ppd`,
        `\tAlerts: ${alert}`,
      ].join("\n");
    assert.equal(classifyPrinter(block("Disabled-Canon")), "ready");
    assert.equal(classifyPrinter(block("Ink-Station")), "ready");
    assert.equal(classifyPrinter(block("Jam-Station")), "ready");
    assert.equal(classifyPrinter(block("SELPHY-ink")), "ready");
    assert.equal(classifyPrinter(block("Ink-Station", "media-jam-error")), "jammed");
  });

  it("returns unknown when there is no printer header", () => {
    assert.equal(classifyPrinter(""), "unknown");
    assert.equal(classifyPrinter(undefined), "unknown");
    assert.equal(classifyPrinter("lpstat: Unknown destination \"TestPrinter\"."), "unknown");
  });
});

describe("extractAlerts", () => {
  it("collects reason tokens and drops 'none'", () => {
    assert.deepEqual(extractAlerts(longOutput("\tAlerts: media-jam-error, cover-open-error")), [
      "media-jam-error",
      "cover-open-error",
    ]);
    assert.deepEqual(extractAlerts(longOutput("\tAlerts: none")), []);
  });

  it("picks up bare reason lines", () => {
    assert.deepEqual(extractAlerts("printer X is idle.\n\tmarker-supply-empty-error"), ["marker-supply-empty-error"]);
  });
});

describe("guestMessage and state helpers", () => {
  it("gives the staff-are-on-it wording for mechanical faults", () => {
    assert.equal(guestMessage("jammed"), "Printer jammed — staff are on it");
    assert.equal(guestMessage("out_of_paper"), "Out of paper — staff are on it");
    assert.equal(guestMessage("out_of_ink"), "Out of ink — staff are on it");
    assert.equal(guestMessage("cover_open"), "Printer cover is open — staff are on it");
  });

  it("gives the offline wording for offline, disabled and unknown", () => {
    for (const state of ["offline", "disabled", "unknown"]) {
      assert.match(guestMessage(state), /^Printer offline/);
    }
  });

  it("has no guest message when the printer is fine or the state is not a state", () => {
    assert.equal(guestMessage("ready"), null);
    assert.equal(guestMessage("busy"), null);
    assert.equal(guestMessage("constructor"), null);
    assert.equal(guestMessage(undefined), null);
  });

  it("marks only the four mechanical states recoverable", () => {
    for (const state of ["jammed", "out_of_paper", "out_of_ink", "cover_open"]) {
      assert.equal(isRecoverable(state), true, state);
    }
    for (const state of ["ready", "busy", "offline", "disabled", "unknown"]) {
      assert.equal(isRecoverable(state), false, state);
    }
  });

  it("accepts jobs when printable or recoverable, and nothing else", () => {
    assert.equal(isPrintable("ready"), true);
    assert.equal(isPrintable("busy"), true);
    assert.equal(isPrintable("jammed"), false);
    assert.equal(acceptsJobs("ready"), true);
    assert.equal(acceptsJobs("busy"), true);
    assert.equal(acceptsJobs("jammed"), true);
    assert.equal(acceptsJobs("cover_open"), true);
    assert.equal(acceptsJobs("disabled"), false);
    assert.equal(acceptsJobs("offline"), false);
    assert.equal(acceptsJobs("unknown"), false);
  });
});

describe("parseJobs", () => {
  const output = [
    "TestPrinter-12   homeserver   1024   Sun 11 Oct 2026 10:00:00 AM BST",
    "TestPrinter-13   homeserver   2048   Sun 11 Oct 2026 10:01:00 AM BST",
    "Canon-2          someone        512    Sun 11 Oct 2026 10:02:00 AM BST",
    "Canon-SELPHY-7   someone        256    Sun 11 Oct 2026 10:03:00 AM BST",
    "this line is not a job",
    "",
  ].join("\n");

  it("parses every job line", () => {
    const jobs = parseJobs(output);
    assert.equal(jobs.length, 4);
    assert.deepEqual(jobs[0], {
      id: "TestPrinter-12",
      owner: "homeserver",
      size: 1024,
      submitted: "Sun 11 Oct 2026 10:00:00 AM BST",
    });
  });

  it("keeps only one printer's jobs, matching the exact printer part of the id", () => {
    assert.deepEqual(parseJobs(output, "TestPrinter").map((j) => j.id), ["TestPrinter-12", "TestPrinter-13"]);
    assert.deepEqual(parseJobs(output, "Canon").map((j) => j.id), ["Canon-2"]);
    assert.deepEqual(parseJobs(output, "Canon-SELPHY").map((j) => j.id), ["Canon-SELPHY-7"]);
    assert.deepEqual(parseJobs(output, "Canon-S"), []);
  });

  it("returns an empty list for empty output", () => {
    assert.deepEqual(parseJobs(""), []);
    assert.deepEqual(parseJobs(undefined), []);
  });
});

describe("parseQueueOrder", () => {
  const jobs = [
    { id: "TestPrinter-12", owner: "a", size: 1, submitted: "x" },
    { id: "TestPrinter-13", owner: "b", size: 2, submitted: "y" },
    { id: "TestPrinter-14", owner: "c", size: 3, submitted: "z" },
  ];

  it("numbers jobs by how many are ahead of them, keeping queue order", () => {
    const ordered = parseQueueOrder(jobs);
    assert.deepEqual(ordered.map((j) => [j.id, j.ahead]), [
      ["TestPrinter-12", 0],
      ["TestPrinter-13", 1],
      ["TestPrinter-14", 2],
    ]);
  });

  it("marks the head job as printing when the printer is busy", () => {
    const ordered = parseQueueOrder(jobs, { printerState: "busy" });
    assert.deepEqual(ordered.map((j) => j.state), ["printing", "queued", "queued"]);
  });

  it("marks the head job as stalled when a fault holds it", () => {
    const ordered = parseQueueOrder(jobs, { printerState: "jammed" });
    assert.deepEqual(ordered.map((j) => j.state), ["stalled", "queued", "queued"]);
  });

  it("accepts lpstat text as well as parsed jobs, and does not mutate its input", () => {
    const text = "TestPrinter-5 me 10 now\nOther-1 me 10 now\nTestPrinter-6 me 10 now";
    const ordered = parseQueueOrder(text, { printer: "TestPrinter" });
    assert.deepEqual(ordered.map((j) => [j.id, j.ahead]), [
      ["TestPrinter-5", 0],
      ["TestPrinter-6", 1],
    ]);
    assert.equal(jobs[0].ahead, undefined);
  });
});
