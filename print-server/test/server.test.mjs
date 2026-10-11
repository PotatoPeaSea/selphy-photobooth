// Integration tests: the real index.mjs on a random port, with fake CUPS
// commands first on PATH. Each test resets the fake state first.
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { sampleStrip, startServer } from "./support/server.mjs";

const PIN = "2468";
const JAM = "Printer jammed — staff are on it";

describe("print server, staff PIN set", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: PIN });
  });
  after(async () => {
    await server?.stop();
  });

  describe("health and queue", () => {
    it("reports a ready printer as ok, with state, guestMessage and printer status", async () => {
      await server.reset("ready");
      const res = await server.get("/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.printer, "TestPrinter");
      assert.equal(res.body.media, "Postcard");
      assert.equal(res.body.state, "ready");
      assert.equal(res.body.guestMessage, null);
      assert.equal(res.body.queue.state, "ready");
      assert.deepEqual(res.body.queue.jobs, []);
      assert.equal(res.body.queue.printerStatus.ready, true);
      assert.equal(res.body.queue.printerStatus.state, "ready");
    });

    it("reports jobsKnown false when the queue cannot be read, so an empty list is not read as printed", async () => {
      await server.reset("ready");
      const failFile = path.join(server.stateDir, "fail_jobs");
      await writeFile(failFile, "1\n");
      const broken = await server.get("/health");
      assert.equal(broken.status, 200);
      assert.equal(broken.body.queue.jobsKnown, false);
      await rm(failFile, { force: true });
      assert.equal((await server.get("/health")).body.queue.jobsKnown, true);
    });

    it("answers ok only for ready and busy printers, with the guest wording for the rest", async () => {
      const cases = [
        ["busy", true, null],
        ["jammed", false, JAM],
        ["out_of_paper", false, "Out of paper — staff are on it"],
        ["out_of_ink", false, "Out of ink — staff are on it"],
        ["cover_open", false, "Printer cover is open — staff are on it"],
        ["offline", false, /^Printer offline/],
        ["disabled", false, /^Printer offline/],
      ];
      for (const [state, ok, guest] of cases) {
        await server.reset(state);
        const res = await server.get("/health");
        assert.equal(res.body.state, state, state);
        assert.equal(res.body.ok, ok, `${state} ok`);
        if (guest instanceof RegExp) {
          assert.match(res.body.guestMessage, guest, state);
        } else {
          assert.equal(res.body.guestMessage, guest, state);
        }
      }
    });

    it("gives every queued job its place in line, and does not cut the list short", async () => {
      await server.reset("jammed");
      const lines = Array.from({ length: 12 }, (_, i) => `TestPrinter-${i + 1} homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST`);
      await server.setJobs(lines);
      const res = await server.get("/queue");
      assert.equal(res.status, 200);
      assert.equal(res.body.jobCount, 12);
      assert.equal(res.body.jobs.length, 12);
      assert.deepEqual(res.body.jobs.map((job) => job.ahead), Array.from({ length: 12 }, (_, i) => i));
      assert.equal(res.body.jobs[0].state, "stalled");
      assert.equal(res.body.jobs[1].state, "queued");
      assert.equal(res.body.warning, JAM);
    });

    it("ignores jobs that belong to another printer", async () => {
      await server.reset("ready");
      await server.setJobs([
        "TestPrinter-1 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
        "Other-9 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
      ]);
      const res = await server.get("/queue");
      assert.deepEqual(res.body.jobs.map((job) => job.id), ["TestPrinter-1"]);
    });

    it("keeps /printers public", async () => {
      await server.reset("ready");
      const res = await server.get("/printers");
      assert.equal(res.status, 200);
      assert.equal(res.body.defaultPrinter, "TestPrinter");
      assert.deepEqual(res.body.printers.map((p) => p.name), ["TestPrinter"]);
    });
  });

  describe("POST /print acceptance", () => {
    it("prints on a ready printer, sends the exact bytes on stdin, and keeps a copy", async () => {
      await server.reset("ready");
      const strip = sampleStrip();
      const res = await server.post("/print", { image: strip.dataUrl, copies: 2 });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.queued, false);
      assert.equal(res.body.state, "ready");
      assert.equal(res.body.guestMessage, null);
      assert.equal(res.body.jobId, "TestPrinter-1");

      const [lpArgs] = await server.calls("lp");
      assert.deepEqual(lpArgs.slice(0, 8), [
        "-d",
        "TestPrinter",
        "-n",
        "2",
        "-o",
        "PageSize=Postcard",
        "-o",
        "StpiShrinkOutput=Shrink",
      ]);
      assert.equal(lpArgs.at(-1), "-");
      assert.deepEqual(await server.lastLpInput(), strip.bytes);

      const index = await server.historyIndex();
      assert.equal(index.length, 1);
      assert.equal(index[0].jobId, "TestPrinter-1");
      assert.equal(index[0].bytes, strip.bytes.length);
      assert.equal(index[0].ext, "png");
      const saved = await readFile(path.join(server.historyDir, `${index[0].id}.png`));
      assert.deepEqual(saved, strip.bytes);
    });

    it("accepts a print while jammed and says it is queued, not failed", async () => {
      await server.reset("jammed");
      const strip = sampleStrip();
      const res = await server.post("/print", { image: strip.dataUrl });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.queued, true);
      assert.equal(res.body.state, "jammed");
      assert.equal(res.body.guestMessage, JAM);
      assert.equal(res.body.jobId, "TestPrinter-1");
      assert.equal(res.body.queue.jobs[0].ahead, 0);
      assert.equal((await server.calls("lp")).length, 1);
      assert.equal((await server.historyIndex()).length, 1);
    });

    it("refuses a disabled or offline printer with 503, so the guest gets the QR code", async () => {
      for (const state of ["disabled", "offline"]) {
        await server.reset(state);
        const res = await server.post("/print", { image: sampleStrip().dataUrl });
        assert.equal(res.status, 503, state);
        assert.ok(res.body.error, state);
        assert.equal(res.body.hint, "Try: cupsenable TestPrinter && cupsaccept TestPrinter");
      }
      assert.match((await server.post("/print", { image: sampleStrip().dataUrl })).body.error, /not ready/);
      assert.equal((await server.calls("lp")).length, 0, "nothing was sent to lp");
      assert.equal((await server.historyIndex()).length, 0, "nothing was kept");
    });

    it("answers 400 for a body that is not an image data URL", async () => {
      await server.reset("ready");
      const missing = await server.post("/print", {});
      assert.equal(missing.status, 400);
      const broken = await server.post("/print", { image: "data:image/png;base64" });
      assert.equal(broken.status, 400);
      assert.equal((await server.calls("lp")).length, 0);
    });

    it("answers 400 for a printer name that could be read as an option", async () => {
      await server.reset("ready");
      const res = await server.post("/print", { image: sampleStrip().dataUrl, printer: "-x" });
      assert.equal(res.status, 400);
      assert.equal((await server.calls("lp")).length, 0);
    });

    it("answers 500 when lp fails, and keeps nothing", async () => {
      await server.reset("ready");
      await server.failCommand("lp");
      const res = await server.post("/print", { image: sampleStrip().dataUrl });
      assert.equal(res.status, 500);
      assert.match(res.body.error, /simulated failure/);
      assert.equal((await server.historyIndex()).length, 0);
    });

    it("handles prints that arrive at the same time without losing history entries", async () => {
      await server.reset("ready");
      const strips = Array.from({ length: 6 }, () => sampleStrip());
      const results = await Promise.all(strips.map((strip) => server.post("/print", { image: strip.dataUrl })));
      for (const res of results) assert.equal(res.status, 200, res.text);

      const jobIds = results.map((res) => res.body.jobId);
      assert.equal(new Set(jobIds).size, 6);

      const index = await server.historyIndex();
      assert.equal(index.length, 6);
      for (const entry of index) {
        const bytes = await readFile(path.join(server.historyDir, `${entry.id}.png`));
        assert.equal(bytes.length, entry.bytes);
        assert.ok(strips.some((strip) => strip.bytes.equals(bytes)), "entry matches a strip that was printed");
      }
    });

    it("keeps /resume public and makes a disabled printer printable again", async () => {
      await server.reset("disabled");
      const res = await server.post("/resume", { printer: "TestPrinter" });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.status.state, "ready");
      assert.equal((await server.calls("cupsenable")).length, 1);
      assert.equal((await server.calls("cupsaccept")).length, 1);
    });

    it("does not report resume as ok when the printer status cannot be read", async () => {
      await server.reset("unknown");
      const res = await server.post("/resume", { printer: "TestPrinter" });
      assert.equal(res.status, 200);
      assert.equal(res.body.status.state, "unknown");
      assert.equal(res.body.status.ready, false);
      assert.equal(res.body.ok, false);
    });

    it("rounds a fractional copy count down before it reaches lp", async () => {
      await server.reset("ready");
      const res = await server.post("/print", { image: sampleStrip().dataUrl, copies: 2.5 });
      assert.equal(res.status, 200, res.text);
      const [lpArgs] = await server.calls("lp");
      assert.equal(lpArgs[lpArgs.indexOf("-n") + 1], "2");
    });
  });

  describe("staff API", () => {
    const auth = { "x-staff-pin": PIN };

    it("answers 401 for a missing or wrong PIN, without running anything", async () => {
      await server.reset("ready");
      const missing = await server.get("/staff/status");
      assert.equal(missing.status, 401);
      const wrong = await server.get("/staff/status", { "x-staff-pin": "1111" });
      assert.equal(wrong.status, 401);
      // Same length as the real PIN, so the comparison itself runs.
      const longer = await server.get("/staff/status", { "x-staff-pin": "24680" });
      assert.equal(longer.status, 401);
      const resume = await server.post("/staff/resume", {}, { "x-staff-pin": "1111" });
      assert.equal(resume.status, 401);
      assert.equal((await server.calls("cupsenable")).length, 0);
    });

    it("does not send CORS headers on staff routes", async () => {
      const res = await server.get("/staff/status", { ...auth, origin: "https://evil.example" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("access-control-allow-origin"), null);
      const health = await server.get("/health", { origin: "https://evil.example" });
      assert.equal(health.headers.get("access-control-allow-origin"), "https://evil.example");
    });

    it("does not send CORS headers on staff routes in any letter case", async () => {
      // Express routes ignore case, so /STAFF/status reaches the staff handler too.
      const res = await server.get("/STAFF/status", { ...auth, origin: "https://evil.example" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("access-control-allow-origin"), null);
      const preflight = await server.request("OPTIONS", "/STAFF/status", {
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-staff-pin",
        },
      });
      assert.equal(preflight.headers.get("access-control-allow-origin"), null);
      assert.equal(preflight.headers.get("access-control-allow-headers"), null);
    });

    it("checks the PIN before it parses a staff body", async () => {
      await server.reset("ready");
      const res = await fetch(`${server.base}/staff/jobs/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      assert.equal(res.status, 401);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      assert.equal((await server.calls("cancel")).length, 0);
    });

    it("GET /staff/status returns the printer state, alerts, jobs and history", async () => {
      await server.reset("jammed");
      await server.setJobs(["TestPrinter-7 homeserver 300 Sun 11 Oct 2026 10:00:00 AM BST"]);
      await server.post("/print", { image: sampleStrip().dataUrl });
      const res = await server.get("/staff/status", auth);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.body.printer, "TestPrinter");
      assert.equal(res.body.state, "jammed");
      assert.equal(res.body.guestMessage, JAM);
      assert.deepEqual(res.body.alerts, ["media-jam-error"]);
      assert.equal(res.body.jobs.length, 2);
      assert.deepEqual(Object.keys(res.body.jobs[0]).sort(), ["id", "owner", "size", "state", "submitted"]);
      assert.equal(res.body.history.length, 1);
      assert.deepEqual(Object.keys(res.body.history[0]).sort(), ["bytes", "createdAt", "id", "jobId"]);
    });

    it("cancels one job that is in the queue, and rejects anything else", async () => {
      await server.reset("ready");
      await server.setJobs([
        "TestPrinter-1 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
        "TestPrinter-2 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
      ]);
      for (const jobId of ["TestPrinter-1; rm -rf /", "-a", "--help-1", "../TestPrinter-1", "TestPrinter", "", 7]) {
        const res = await server.post("/staff/jobs/cancel", { jobId }, auth);
        assert.equal(res.status, 400, JSON.stringify(jobId));
      }
      const unknown = await server.post("/staff/jobs/cancel", { jobId: "TestPrinter-99" }, auth);
      assert.equal(unknown.status, 404);
      assert.equal((await server.calls("cancel")).length, 0, "no cancel ran for rejected ids");

      const ok = await server.post("/staff/jobs/cancel", { jobId: "TestPrinter-1" }, auth);
      assert.equal(ok.status, 200);
      assert.deepEqual(await server.calls("cancel"), [["TestPrinter-1"]]);
      const queue = await server.get("/queue");
      assert.deepEqual(queue.body.jobs.map((job) => job.id), ["TestPrinter-2"]);
    });

    it("clears the whole queue with cancel -a and reports how many went", async () => {
      await server.reset("jammed");
      await server.setJobs([
        "TestPrinter-1 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
        "TestPrinter-2 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
        "TestPrinter-3 homeserver 100 Sun 11 Oct 2026 10:00:00 AM BST",
      ]);
      const res = await server.post("/staff/jobs/clear", {}, auth);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true, cancelled: 3 });
      assert.deepEqual((await server.calls("cancel")).at(-1), ["-a", "TestPrinter"]);
      assert.equal((await server.get("/queue")).body.jobCount, 0);
    });

    it("resumes a disabled printer and reports the state afterwards", async () => {
      await server.reset("disabled");
      const res = await server.post("/staff/resume", {}, auth);
      assert.equal(res.status, 200);
      assert.deepEqual(
        { ok: res.body.ok, state: res.body.state },
        { ok: true, state: "ready" },
      );
      assert.deepEqual(await server.calls("cupsenable"), [["TestPrinter"]]);
      assert.deepEqual(await server.calls("cupsaccept"), [["TestPrinter"]]);
    });

    it("reports a jammed printer as ok after resume, because it still takes prints", async () => {
      await server.reset("jammed");
      const res = await server.post("/staff/resume", {}, auth);
      assert.equal(res.body.state, "jammed");
      assert.equal(res.body.ok, true);
    });

    it("reprints a saved strip from history, with the saved bytes and copies", async () => {
      await server.reset("ready");
      const strip = sampleStrip();
      await server.post("/print", { image: strip.dataUrl });
      const [saved] = await server.historyIndex();
      assert.equal((await server.calls("lp")).length, 1);

      const res = await server.post("/staff/reprint", { historyId: saved.id, copies: 3 }, auth);
      assert.equal(res.status, 200, res.text);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.jobId, "TestPrinter-2");
      const lpCalls = await server.calls("lp");
      assert.equal(lpCalls.length, 2);
      assert.equal(lpCalls[1][lpCalls[1].indexOf("-n") + 1], "3");
      assert.deepEqual(await server.lastLpInput(), strip.bytes);
      assert.equal((await server.historyIndex()).length, 1, "a reprint does not add a history entry");
    });

    it("rejects bad reprint requests and never resolves an id outside the index", async () => {
      await server.reset("ready");
      await server.post("/print", { image: sampleStrip().dataUrl });
      const [saved] = await server.historyIndex();

      assert.equal((await server.post("/staff/reprint", { historyId: saved.id, copies: 4 }, auth)).status, 400);
      assert.equal((await server.post("/staff/reprint", { historyId: saved.id, copies: 0 }, auth)).status, 400);
      assert.equal((await server.post("/staff/reprint", { historyId: saved.id, copies: "two" }, auth)).status, 400);
      assert.equal((await server.post("/staff/reprint", {}, auth)).status, 400);
      assert.equal((await server.post("/staff/reprint", { historyId: 12 }, auth)).status, 400);

      for (const historyId of ["nope", "../../etc/passwd", path.join(server.historyDir, `${saved.id}.png`)]) {
        const res = await server.post("/staff/reprint", { historyId }, auth);
        assert.equal(res.status, 404, historyId);
      }
      assert.equal((await server.calls("lp")).length, 1, "only the original print reached lp");
    });

    it("reprints while jammed as queued, and refuses while disabled", async () => {
      await server.reset("ready");
      await server.post("/print", { image: sampleStrip().dataUrl });
      const [saved] = await server.historyIndex();

      await server.setState("jammed");
      const jammed = await server.post("/staff/reprint", { historyId: saved.id }, auth);
      assert.equal(jammed.status, 200);
      assert.equal(jammed.body.queued, true);

      await server.setState("disabled");
      const disabled = await server.post("/staff/reprint", { historyId: saved.id }, auth);
      assert.equal(disabled.status, 503);
      assert.equal((await server.calls("lp")).length, 2, "the first print and the jammed reprint reached lp");
    });

    it("stops listing a print whose saved image has gone, so the panel never offers a reprint that 404s", async () => {
      await server.reset("ready");
      await server.post("/print", { image: sampleStrip().dataUrl });
      const [saved] = await server.historyIndex();
      await rm(path.join(server.historyDir, `${saved.id}.png`));

      const status = await server.get("/staff/status", auth);
      assert.deepEqual(status.body.history, []);
      const reprint = await server.post("/staff/reprint", { historyId: saved.id }, auth);
      assert.equal(reprint.status, 404);
      assert.deepEqual(await server.historyIndex(), []);
    });
  });
});

describe("print server, STAFF_PIN unset", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: null });
  });
  after(async () => {
    await server?.stop();
  });

  it("answers 403 on every staff route, even with a PIN header", async () => {
    await server.reset("ready");
    const headers = { "x-staff-pin": "anything" };
    const routes = [
      ["GET", "/staff/status"],
      ["POST", "/staff/resume"],
      ["POST", "/staff/jobs/clear"],
      ["POST", "/staff/jobs/cancel"],
      ["POST", "/staff/reprint"],
    ];
    for (const [method, route] of routes) {
      const res = await server.request(method, route, { headers, body: method === "POST" ? {} : undefined });
      assert.equal(res.status, 403, `${method} ${route}`);
      assert.deepEqual(res.body, { error: "Staff panel disabled" });
    }
    assert.equal((await server.calls("cupsenable")).length, 0);
    assert.equal((await server.calls("cancel")).length, 0);
  });

  it("keeps the public routes working", async () => {
    await server.reset("ready");
    assert.equal((await server.get("/health")).status, 200);
    assert.equal((await server.post("/print", { image: sampleStrip().dataUrl })).status, 200);
  });
});

describe("print server, staff PIN rate limit", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: PIN });
  });
  after(async () => {
    await server?.stop();
  });

  it("does not count requests that send no PIN toward the lock", async () => {
    await server.reset("ready");
    for (let i = 0; i < 6; i += 1) {
      const res = await server.get("/staff/status");
      assert.equal(res.status, 401, `headerless attempt ${i + 1}`);
    }
    const right = await server.get("/staff/status", { "x-staff-pin": PIN });
    assert.equal(right.status, 200);
  });

  it("locks the staff panel for a minute after five wrong PINs, for every client", async () => {
    await server.reset("ready");
    for (let i = 0; i < 5; i += 1) {
      const res = await server.get("/staff/status", { "x-staff-pin": `000${i}` });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }

    // Even the right PIN is refused while the lock holds.
    const locked = await server.get("/staff/status", { "x-staff-pin": PIN, "x-forwarded-for": "10.0.0.9" });
    assert.equal(locked.status, 429);
    assert.match(locked.headers.get("retry-after"), /^\d+$/);
    const wrongToo = await server.get("/staff/status", { "x-staff-pin": "0000" });
    assert.equal(wrongToo.status, 429);

    // The guest-facing routes are not part of the lock.
    assert.equal((await server.get("/health")).status, 200);
  });
});

describe("print server, PRINTER_NAME empty (CUPS default printer)", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: null, printerName: null });
  });
  after(async () => {
    await server?.stop();
  });

  it("uses lpstat's default destination for health and printing", async () => {
    await server.reset("ready");
    const health = await server.get("/health");
    assert.equal(health.body.printer, "TestPrinter");
    assert.equal(health.body.ok, true);

    const res = await server.post("/print", { image: sampleStrip().dataUrl });
    assert.equal(res.status, 200, res.text);
    assert.equal((await server.calls("lp"))[0][1], "TestPrinter");
  });
});

describe("print server, STAFF_PIN not 4 to 8 digits", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: "12a4" });
  });
  after(async () => {
    await server?.stop();
  });

  it("keeps the staff panel off rather than locking out a PIN the keypad cannot type", async () => {
    await server.reset("ready");
    const res = await server.request("GET", "/staff/status", { headers: { "x-staff-pin": "12a4" } });
    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: "Staff panel disabled" });
  });
});
