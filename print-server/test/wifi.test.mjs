// Pure Wi-Fi helpers (parsers, validators, nmcli arguments), plus the nmcli wrappers run
// against the fake nmcli on PATH.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  connectArgs,
  connectWaitSecs,
  connectWifi,
  isOpenSecurity,
  parseDevStatus,
  parseWifiList,
  readDeviceStatus,
  scanNetworks,
  splitTerseLine,
  validatePasswordForNetwork,
  validatePasswordShape,
  validateSsid,
} from "../wifi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures");
const FAKES = path.join(HERE, "fakes");

describe("splitTerseLine", () => {
  it("splits on colons and reads \\: and \\\\ as literal characters", () => {
    assert.deepEqual(splitTerseLine(String.raw`*:Home\:Net:82:WPA2 WPA3`), ["*", "Home:Net", "82", "WPA2 WPA3"]);
    assert.deepEqual(splitTerseLine(String.raw`:Back\\Yard:40:WPA2`), ["", "Back\\Yard", "40", "WPA2"]);
  });

  it("keeps empty fields, so a missing security column is still a field", () => {
    assert.deepEqual(splitTerseLine("::0:"), ["", "", "0", ""]);
  });
});

describe("parseWifiList", () => {
  it("reads the scan fixture: one entry per name, strongest first, hidden and short lines dropped", async () => {
    const text = await readFile(path.join(FIXTURES, "wifi-list.txt"), "utf8");
    assert.deepEqual(parseWifiList(text), [
      { ssid: "HomeNet", signal: 81, security: "WPA2 WPA3", inUse: true },
      { ssid: "Cafe:Guest", signal: 70, security: "", inUse: false },
      { ssid: "Office 5G", signal: 55, security: "WPA2 802.1X", inUse: false },
      { ssid: "Back\\Yard", signal: 40, security: "WPA2", inUse: false },
      { ssid: "Lake House", signal: 30, security: "WEP", inUse: false },
      { ssid: "Shed", signal: 12, security: "", inUse: false },
    ]);
  });

  it("keeps the strongest access point for a repeated name and marks it in use if any copy is", () => {
    const list = parseWifiList(["*:Mesh:40:WPA2", ":Mesh:77:WPA2", ":Mesh:20:WPA2"].join("\n"));
    assert.deepEqual(list, [{ ssid: "Mesh", signal: 77, security: "WPA2", inUse: true }]);
  });

  it("clamps signal to 0 to 100 and reads a bad signal as 0", () => {
    const list = parseWifiList([":Loud:150:WPA2", ":Quiet:-4:WPA2", ":Odd:abc:WPA2"].join("\n"));
    assert.deepEqual(list.map((n) => [n.ssid, n.signal]), [["Loud", 100], ["Odd", 0], ["Quiet", 0]]);
  });

  it("does not turn a line with a missing security column into an open network", () => {
    assert.deepEqual(parseWifiList("*:NoSecurity:80"), []);
  });

  it("returns an empty list for empty or missing output", () => {
    assert.deepEqual(parseWifiList(""), []);
    assert.deepEqual(parseWifiList(undefined), []);
  });
});

describe("parseDevStatus", () => {
  it("reads the connected Wi-Fi device and its network, skipping other device types", () => {
    assert.deepEqual(parseDevStatus("eth0:ethernet:connected:Wired\nwlan0:wifi:connected:HomeNet\n"), {
      device: "wlan0",
      connected: { ssid: "HomeNet", state: "connected" },
    });
  });

  it("unescapes a colon in the network name", () => {
    assert.deepEqual(parseDevStatus(String.raw`wlan0:wifi:connected:Cafe\:Guest`).connected, {
      ssid: "Cafe:Guest",
      state: "connected",
    });
  });

  it("reports the device with connected null when it is idle", () => {
    assert.deepEqual(parseDevStatus("wlan0:wifi:disconnected:--"), { device: "wlan0", connected: null });
  });

  it("prefers the Wi-Fi device that is joined to a network", () => {
    const text = "wlan0:wifi:disconnected:--\nwlan1:wifi:connected:Shop";
    assert.deepEqual(parseDevStatus(text), { device: "wlan1", connected: { ssid: "Shop", state: "connected" } });
  });

  it("reports no device when there is no Wi-Fi device", () => {
    assert.deepEqual(parseDevStatus("eth0:ethernet:connected:Wired"), { device: null, connected: null });
  });
});

describe("validateSsid", () => {
  it("accepts names of 1 to 32 bytes, including spaces, accents and a name of exactly 32 bytes", () => {
    assert.equal(validateSsid("A").ok, true);
    assert.equal(validateSsid("Cafe Lumière").ok, true);
    assert.equal(validateSsid("é".repeat(16)).ok, true);
    assert.equal(validateSsid("x".repeat(32)).ok, true);
  });

  it("refuses an empty name, and a name longer than 32 bytes even when it is short in characters", () => {
    assert.equal(validateSsid("").ok, false);
    assert.equal(validateSsid(undefined).ok, false);
    assert.match(validateSsid("x".repeat(33)).error, /too long/);
    assert.match(validateSsid("é".repeat(17)).error, /too long/);
  });

  it("refuses control characters and a leading dash, which nmcli would read as an option", () => {
    for (const bad of ["-rf", "--wait", "Bad\tName", "Bad\nName", "Bad\u007fName"]) {
      assert.equal(validateSsid(bad).ok, false, JSON.stringify(bad));
      assert.match(validateSsid(bad).error, /can't be used/);
    }
  });
});

describe("validatePasswordShape", () => {
  it("allows empty (for open networks) and 8 to 63 printable ASCII characters", () => {
    assert.equal(validatePasswordShape("").ok, true);
    assert.equal(validatePasswordShape(undefined).ok, true);
    assert.equal(validatePasswordShape("12345678").ok, true);
    assert.equal(validatePasswordShape("a b!#$%&'()*+,-./:;<=>?@[]^_`{|}~").ok, true);
    assert.equal(validatePasswordShape("x".repeat(63)).ok, true);
  });

  it("refuses 1 to 7 characters, 64 or more, non-text, control characters and non-ASCII", () => {
    assert.match(validatePasswordShape("1234567").error, /8 to 63/);
    assert.match(validatePasswordShape("x".repeat(64)).error, /8 to 63/);
    assert.equal(validatePasswordShape(12345678).ok, false);
    assert.equal(validatePasswordShape("pass\tword1").ok, false);
    assert.equal(validatePasswordShape("pässwörd").ok, false);
  });
});

describe("validatePasswordForNetwork", () => {
  it("treats open networks as needing an empty password", () => {
    assert.equal(validatePasswordForNetwork("", "").ok, true);
    assert.equal(validatePasswordForNetwork("", "--").ok, true);
    assert.equal(validatePasswordForNetwork("12345678", "").ok, false);
  });

  it("requires a password for secured networks", () => {
    assert.equal(validatePasswordForNetwork("tea-and-biscuits", "WPA2 WPA3").ok, true);
    assert.match(validatePasswordForNetwork("", "WPA2").error, /needs a password/);
  });

  it("refuses enterprise (802.1X) networks", () => {
    assert.match(validatePasswordForNetwork("tea-and-biscuits", "WPA2 802.1X").error, /username and certificate/);
  });

  it("still applies the length rule to a secured network", () => {
    assert.equal(validatePasswordForNetwork("short", "WPA2").ok, false);
  });
});

describe("isOpenSecurity", () => {
  it("treats an empty or -- security column as open", () => {
    assert.equal(isOpenSecurity(""), true);
    assert.equal(isOpenSecurity("--"), true);
    assert.equal(isOpenSecurity("WPA2"), false);
  });
});

describe("connectArgs", () => {
  it("builds the secured-network arguments with the password as its own pair", () => {
    assert.deepEqual(connectArgs("HomeNet", "tea-and-biscuits"), [
      "--wait",
      "25",
      "dev",
      "wifi",
      "connect",
      "HomeNet",
      "password",
      "tea-and-biscuits",
    ]);
  });

  it("gives an open network no password argument", () => {
    assert.deepEqual(connectArgs("Cafe:Guest", ""), ["--wait", "25", "dev", "wifi", "connect", "Cafe:Guest"]);
  });

  it("uses the wait it is given", () => {
    assert.deepEqual(connectArgs("Cafe:Guest", "", 13), ["--wait", "13", "dev", "wifi", "connect", "Cafe:Guest"]);
  });
});

describe("connectWaitSecs", () => {
  it("gives a join with no scan time the whole 25 s budget", () => {
    assert.equal(connectWaitSecs(0), 25);
  });

  it("gives the rest of the budget after the scan, rounded down to whole seconds", () => {
    assert.equal(connectWaitSecs(12_000), 13);
    assert.equal(connectWaitSecs(11_900), 13);
    assert.equal(connectWaitSecs(12_100), 12);
  });

  it("never gives less than 5 s, however slow the scan was", () => {
    assert.equal(connectWaitSecs(20_000), 5);
    assert.equal(connectWaitSecs(60_000), 5);
  });

  it("treats a negative elapsed time as none", () => {
    assert.equal(connectWaitSecs(-500), 25);
  });
});

describe("nmcli wrappers through the fake nmcli", () => {
  let stateDir;
  let savedPath;
  let savedState;

  before(async () => {
    stateDir = await mkdtemp(path.join(os.tmpdir(), "fake-nmcli-"));
    savedPath = process.env.PATH;
    savedState = process.env.FAKE_CUPS_STATE;
    process.env.PATH = `${FAKES}${path.delimiter}${savedPath}`;
    process.env.FAKE_CUPS_STATE = stateDir;
  });

  after(async () => {
    process.env.PATH = savedPath;
    if (savedState === undefined) delete process.env.FAKE_CUPS_STATE;
    else process.env.FAKE_CUPS_STATE = savedState;
    await rm(stateDir, { recursive: true, force: true });
  });

  it("scanNetworks parses what nmcli prints", async () => {
    const networks = await scanNetworks();
    assert.equal(networks[0].ssid, "HomeNet");
    assert.equal(networks.length, 6);
  });

  it("readDeviceStatus reads the device through nmcli", async () => {
    assert.deepEqual(await readDeviceStatus(), {
      device: "wlan0",
      connected: { ssid: "HomeNet", state: "connected" },
    });
  });

  it("connectWifi reports success without the password", async () => {
    assert.deepEqual(await connectWifi("HomeNet", "tea-and-biscuits"), { ok: true, message: "Connected to HomeNet" });
  });

  it("connectWifi turns a rejected password into plain wording, and never echoes the password", async () => {
    await writeFile(path.join(stateDir, "nmcli_connect_error"), "Error: Connection activation failed: (802) Secrets were required\n");
    const failed = await connectWifi("HomeNet", "tea-and-biscuits");
    assert.deepEqual(failed, {
      ok: false,
      message: "The network did not accept the password. Check it and try again.",
    });
    await writeFile(path.join(stateDir, "nmcli_connect_error"), "Error: could not use tea-and-biscuits here\n");
    const scrubbed = await connectWifi("HomeNet", "tea-and-biscuits");
    assert.equal(scrubbed.ok, false);
    assert.doesNotMatch(scrubbed.message, /tea-and-biscuits/);
    await rm(path.join(stateDir, "nmcli_connect_error"), { force: true });
  });

  it("scanNetworks throws with nmcli's message when nmcli fails", async () => {
    await writeFile(path.join(stateDir, "fail"), "nmcli\n");
    try {
      await assert.rejects(scanNetworks(), /simulated failure/);
    } finally {
      await rm(path.join(stateDir, "fail"), { force: true });
    }
  });
});
