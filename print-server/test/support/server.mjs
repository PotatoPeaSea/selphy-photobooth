// Starts index.mjs on a random port with the fake CUPS commands first on PATH.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FAKES_DIR = path.join(SERVER_ROOT, "test", "fakes");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(base, child, readOutput) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`print-server exited early:\n${readOutput()}`);
    }
    try {
      const res = await fetch(`${base}/health`);
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`print-server did not start:\n${readOutput()}`);
}

/**
 * Starts the server. `staffPin: null` leaves STAFF_PIN unset;
 * `printerName: null` leaves PRINTER_NAME unset, so the CUPS default is used.
 * Returns helpers for requests, fake CUPS state, and shutdown.
 */
export async function startServer({ staffPin = "2468", printerName = "TestPrinter" } = {}) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "fake-cups-"));
  const historyDir = path.join(stateDir, "history");
  const port = await freePort();

  const env = {
    PATH: `${FAKES_DIR}${path.delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
    FAKE_CUPS_STATE: stateDir,
    FAKE_PRINTER: "TestPrinter",
    PRINT_SERVER_PORT: String(port),
    PRINT_HISTORY_DIR: historyDir,
    CUPS_MEDIA_OPTION: "Postcard",
  };
  if (staffPin !== null) env.STAFF_PIN = staffPin;
  if (printerName !== null) env.PRINTER_NAME = printerName;

  let output = "";
  const child = spawn(process.execPath, [path.join(SERVER_ROOT, "index.mjs")], {
    cwd: SERVER_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const base = `http://127.0.0.1:${port}`;
  await waitUntilUp(base, child, () => output);

  async function request(method, route, { body, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + route, init);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, body: json, text };
  }

  const fakeFile = (name) => path.join(stateDir, name);

  return {
    base,
    stateDir,
    historyDir,
    output: () => output,
    request,
    get: (route, headers) => request("GET", route, { headers }),
    post: (route, body = {}, headers) => request("POST", route, { body, headers }),

    async setState(state) {
      await writeFile(fakeFile("state"), `${state}\n`);
    },

    /** Clears queue, log, failures and history; sets the printer state. */
    async reset(state = "ready") {
      await this.setState(state);
      for (const name of ["jobs", "log", "fail", "next_id", "last_lp_input"]) {
        await rm(fakeFile(name), { force: true });
      }
      await rm(historyDir, { recursive: true, force: true });
    },

    async setJobs(lines) {
      await writeFile(fakeFile("jobs"), `${lines.join("\n")}\n`);
    },

    async failCommand(name) {
      await writeFile(fakeFile("fail"), `${name}\n`);
    },

    /** Argument lists (without the command name) of every call to `name`, in order. */
    async calls(name) {
      const text = await readFile(fakeFile("log"), "utf8").catch(() => "");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t"))
        .filter(([cmd]) => cmd === name)
        .map(([, ...args]) => args);
    },

    async lastLpInput() {
      return readFile(fakeFile("last_lp_input"));
    },

    async historyIndex() {
      try {
        return JSON.parse(await readFile(path.join(historyDir, "index.json"), "utf8"));
      } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
      }
    },

    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

/** A fake 96-byte strip with a data URL around it. */
export function sampleStrip() {
  const bytes = randomBytes(96);
  return { bytes, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
}
