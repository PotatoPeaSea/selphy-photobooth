// Staff Wi-Fi and leave-kiosk routes: the real index.mjs with the fake nmcli and pkill
// first on PATH. Each test resets the fake state first.
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { startServer } from "./support/server.mjs";

const PIN = "2468";
const auth = { "x-staff-pin": PIN };
const KIOSK_PATTERNS = [
  ["-f", "lwrespawn.*photobooth-kiosk"],
  ["-f", "kiosk .*127\\.0\\.0\\.1:3001"],
];
const OVERRIDE_FILES = [
  "nmcli_wifi_list",
  "nmcli_dev_status",
  "nmcli_connect_error",
  "nmcli_connect_delay",
  "pkill_delay",
  "pkill_nomatch",
  "fail",
];

// The wait is what is left of the join budget after the scan, so the test checks its range,
// not an exact number: the scan takes a few milliseconds here, which can round either way.
function assertJoinArgs(args, tail) {
  assert.equal(args[0], "--wait");
  const wait = Number(args[1]);
  assert.ok(Number.isInteger(wait) && wait >= 5 && wait <= 25, `wait was ${args[1]}`);
  assert.deepEqual(args.slice(2), ["dev", "wifi", "connect", ...tail]);
}

async function resetWifi(server, state = "ready") {
  await server.reset(state);
  for (const name of OVERRIDE_FILES) {
    await rm(path.join(server.stateDir, name), { force: true });
  }
}

async function setFile(server, name, text) {
  await writeFile(path.join(server.stateDir, name), text);
}

function connectCalls(server) {
  return server.calls("nmcli").then((all) => all.filter((args) => args.includes("connect")));
}

async function waitForCalls(server, name, count, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let calls = await server.calls(name);
  while (calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    calls = await server.calls(name);
  }
  return calls;
}

describe("staff Wi-Fi and leave-kiosk, PIN set", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: PIN });
  });
  after(async () => {
    await server?.stop();
  });

  describe("PIN gate", () => {
    it("answers 401 on every new route without a PIN and runs no command", async () => {
      await resetWifi(server);
      assert.equal((await server.get("/staff/wifi")).status, 401);
      assert.equal((await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" })).status, 401);
      assert.equal((await server.post("/staff/leave-kiosk", {})).status, 401);
      assert.equal((await server.get("/staff/wifi", { "x-staff-pin": "1111" })).status, 401);
      assert.equal((await server.calls("nmcli")).length, 0);
      assert.equal((await server.calls("pkill")).length, 0);
    });
  });

  describe("GET /staff/wifi", () => {
    it("returns the device, the connection and the networks, strongest first, one per name", async () => {
      await resetWifi(server);
      const res = await server.get("/staff/wifi", auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.device, "wlan0");
      assert.deepEqual(res.body.connected, { ssid: "HomeNet", state: "connected" });
      assert.deepEqual(
        res.body.networks.map((n) => n.ssid),
        ["HomeNet", "Cafe:Guest", "Office 5G", "Back\\Yard", "Lake House", "Shed"],
      );
      assert.deepEqual(res.body.networks[0], { ssid: "HomeNet", signal: 81, security: "WPA2 WPA3", inUse: true });
      assert.equal(res.body.networks[1].security, "");
    });

    it("asks nmcli for the terse list with a fresh scan", async () => {
      await resetWifi(server);
      await server.get("/staff/wifi", auth);
      const scans = await server.calls("nmcli");
      assert.deepEqual(scans.find((args) => args.includes("list")), [
        "-t",
        "-f",
        "IN-USE,SSID,SIGNAL,SECURITY",
        "dev",
        "wifi",
        "list",
        "--rescan",
        "auto",
      ]);
    });

    it("reports connected as null when the Wi-Fi device is idle", async () => {
      await resetWifi(server);
      await setFile(server, "nmcli_dev_status", "wlan0:wifi:disconnected:--\n");
      const res = await server.get("/staff/wifi", auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.device, "wlan0");
      assert.equal(res.body.connected, null);
    });

    it("answers 503 with nmcli's message when Wi-Fi cannot be read", async () => {
      await resetWifi(server);
      await server.failCommand("nmcli");
      const res = await server.get("/staff/wifi", auth);
      assert.equal(res.status, 503);
      assert.match(res.body.error, /^Could not read Wi-Fi: nmcli: simulated failure/);
    });
  });

  describe("POST /staff/wifi/connect", () => {
    it("joins a secured network with exactly the nmcli arguments, and answers ok", async () => {
      await resetWifi(server);
      const res = await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true, message: "Connected to HomeNet" });
      const calls = await connectCalls(server);
      assert.equal(calls.length, 1);
      assertJoinArgs(calls[0], ["HomeNet", "password", "tea-and-biscuits"]);
    });

    it("joins an open network with no password argument at all", async () => {
      await resetWifi(server);
      const res = await server.post("/staff/wifi/connect", { ssid: "Cafe:Guest", password: "" }, auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      const calls = await connectCalls(server);
      assert.equal(calls.length, 1);
      assertJoinArgs(calls[0], ["Cafe:Guest"]);
    });

    it("refuses a second join while one is running, runs no second scan or connect, and the first still answers ok", async () => {
      await resetWifi(server);
      await setFile(server, "nmcli_connect_delay", "1.5");
      const first = server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth);
      // Scan plus connect: the second nmcli call is logged before the fake connect sleeps.
      await waitForCalls(server, "nmcli", 2);
      const second = await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth);
      assert.equal(second.status, 409);
      assert.match(second.body.error, /already running/);
      const firstRes = await first;
      assert.equal(firstRes.status, 200);
      assert.deepEqual(firstRes.body, { ok: true, message: "Connected to HomeNet" });
      assert.equal((await server.calls("nmcli")).length, 2, "the refused join ran no nmcli command");
      assert.equal((await connectCalls(server)).length, 1);
    });

    it("accepts a join again once the running one has finished", async () => {
      await resetWifi(server);
      const res = await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it("answers a malformed JSON body with a fixed 400, and never repeats the body in the answer or the log", async () => {
      await resetWifi(server);
      const raw = '{"ssid":"HomeNet","password":Abcd1234}';
      const res = await fetch(`${server.base}/staff/wifi/connect`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-staff-pin": PIN },
        body: raw,
      });
      const text = await res.text();
      assert.equal(res.status, 400);
      assert.deepEqual(JSON.parse(text), { error: "Request body is not valid JSON" });
      assert.doesNotMatch(text, /Abcd1234/);
      assert.doesNotMatch(server.output(), /Abcd1234/);
      assert.equal((await server.calls("nmcli")).length, 0);
    });

    it("gives the same fixed 400 for a malformed body on the public print routes", async () => {
      await resetWifi(server);
      const res = await fetch(`${server.base}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"printer":Abcd1234}',
      });
      const text = await res.text();
      assert.equal(res.status, 400);
      assert.deepEqual(JSON.parse(text), { error: "Request body is not valid JSON" });
      assert.doesNotMatch(text, /Abcd1234/);
      assert.doesNotMatch(server.output(), /Abcd1234/);
    });

    it("answers 200 with ok false and plain wording when the password is rejected", async () => {
      await resetWifi(server);
      await setFile(server, "nmcli_connect_error", "Error: Connection activation failed: (802) Secrets were required, but not provided.\n");
      const res = await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "wrong-pass-123" }, auth);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        ok: false,
        message: "The network did not accept the password. Check it and try again.",
      });
    });

    it("never logs or returns the password, even when nmcli's own message contains it", async () => {
      await resetWifi(server);
      await setFile(server, "nmcli_connect_error", "Error: could not use hunter2-secret\n");
      const res = await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "hunter2-secret" }, auth);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, false);
      assert.doesNotMatch(res.text, /hunter2-secret/);
      assert.doesNotMatch(server.output(), /hunter2-secret/);
      assert.match(server.output(), /Wi-Fi connect requested for "HomeNet"/);
    });

    it("validates the name and password shape before any command runs", async () => {
      await resetWifi(server);
      const bad = [
        { ssid: "-rf", password: "tea-and-biscuits" },
        { ssid: "", password: "tea-and-biscuits" },
        { ssid: "x".repeat(33), password: "tea-and-biscuits" },
        { ssid: "Bad\tName", password: "tea-and-biscuits" },
        { ssid: "HomeNet", password: "short" },
        { ssid: "HomeNet", password: "x".repeat(64) },
        { ssid: "HomeNet", password: "pässwörd" },
      ];
      for (const body of bad) {
        const res = await server.post("/staff/wifi/connect", body, auth);
        assert.equal(res.status, 400, JSON.stringify(body.ssid));
        assert.equal(typeof res.body.error, "string");
      }
      assert.equal((await server.calls("nmcli")).length, 0);
    });

    it("re-checks the security from a fresh scan: open with a password, secured without one, enterprise, unknown", async () => {
      await resetWifi(server);
      const cases = [
        [{ ssid: "Cafe:Guest", password: "tea-and-biscuits" }, 400],
        [{ ssid: "HomeNet", password: "" }, 400],
        [{ ssid: "Office 5G", password: "tea-and-biscuits" }, 400],
        [{ ssid: "Nowhere Net", password: "tea-and-biscuits" }, 404],
      ];
      for (const [body, status] of cases) {
        const res = await server.post("/staff/wifi/connect", body, auth);
        assert.equal(res.status, status, JSON.stringify(body));
      }
      assert.equal((await connectCalls(server)).length, 0, "no connect was attempted");
    });

  });

  describe("POST /staff/leave-kiosk", () => {
    it("answers ok, then runs the two kiosk patterns in order", async () => {
      await resetWifi(server);
      const res = await server.post("/staff/leave-kiosk", {}, auth);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
      const calls = await waitForCalls(server, "pkill", 2);
      assert.deepEqual(calls, KIOSK_PATTERNS);
    });

    it("aims the Chromium pattern at the kiosk's own command line, not at an ordinary Chromium window", async () => {
      await resetWifi(server);
      await server.post("/staff/leave-kiosk", {}, auth);
      const [, [, chromiumPattern]] = await waitForCalls(server, "pkill", 2);
      const kioskRe = new RegExp(chromiumPattern);
      const kioskLine = "/usr/lib/chromium/chromium --ozone-platform=wayland --kiosk --no-first-run --disable-infobars http://127.0.0.1:3001";
      const ordinaryLine = "/usr/lib/chromium/chromium --new-window https://example.com/cards";
      assert.equal(kioskRe.test(kioskLine), true);
      assert.equal(kioskRe.test(ordinaryLine), false);
    });

    it("answers before a slow pkill finishes, so the staff browser gets its reply", async () => {
      await resetWifi(server);
      await setFile(server, "pkill_delay", "1.5");
      const started = Date.now();
      const res = await server.post("/staff/leave-kiosk", {}, auth);
      const answeredAfterMs = Date.now() - started;
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
      assert.ok(answeredAfterMs < 1000, `answered after ${answeredAfterMs} ms, so the server waited for pkill`);
      assert.deepEqual(await waitForCalls(server, "pkill", 2, 10_000), KIOSK_PATTERNS);
      await rm(path.join(server.stateDir, "pkill_delay"), { force: true });
    });

    it("still closes Chromium when the launcher pattern matches nothing", async () => {
      await resetWifi(server);
      await setFile(server, "pkill_nomatch", "1\n");
      const res = await server.post("/staff/leave-kiosk", {}, auth);
      assert.deepEqual(res.body, { ok: true });
      assert.deepEqual(await waitForCalls(server, "pkill", 2), KIOSK_PATTERNS);
    });

    it("runs no pkill for a request that the PIN gate refuses", async () => {
      await resetWifi(server);
      const res = await server.post("/staff/leave-kiosk", {}, { "x-staff-pin": "1111" });
      assert.equal(res.status, 401);
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal((await server.calls("pkill")).length, 0);
    });
  });
});

describe("staff Wi-Fi and leave-kiosk, STAFF_PIN unset", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: null });
  });
  after(async () => {
    await server?.stop();
  });

  it("answers 403 on the new routes, even with a PIN header, and runs nothing", async () => {
    await resetWifi(server);
    assert.equal((await server.get("/staff/wifi", auth)).status, 403);
    assert.equal((await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth)).status, 403);
    assert.equal((await server.post("/staff/leave-kiosk", {}, auth)).status, 403);
    assert.equal((await server.calls("nmcli")).length, 0);
    assert.equal((await server.calls("pkill")).length, 0);
  });
});

describe("staff Wi-Fi and leave-kiosk share the PIN lock", () => {
  let server;
  before(async () => {
    server = await startServer({ staffPin: PIN });
  });
  after(async () => {
    await server?.stop();
  });

  it("refuses the new routes with 429 while the lock from five wrong PINs holds", async () => {
    await resetWifi(server);
    for (let i = 0; i < 5; i += 1) {
      const res = await server.get("/staff/wifi", { "x-staff-pin": `000${i}` });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    assert.equal((await server.get("/staff/wifi", auth)).status, 429);
    assert.equal((await server.post("/staff/wifi/connect", { ssid: "HomeNet", password: "tea-and-biscuits" }, auth)).status, 429);
    assert.equal((await server.post("/staff/leave-kiosk", {}, auth)).status, 429);
    assert.equal((await server.calls("nmcli")).length, 0);
    assert.equal((await server.calls("pkill")).length, 0);
  });
});
