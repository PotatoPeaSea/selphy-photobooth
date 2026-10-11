import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createHistory, normaliseExt, resolveHistoryDir, HISTORY_LIMIT } from "../history.mjs";

let root;

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "history-test-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function freshDir(name) {
  return path.join(root, name);
}

describe("createHistory", () => {
  it("saves bytes, lists the newest first, and reads them back", async () => {
    const dir = await freshDir("basic");
    const history = createHistory(dir);
    const first = randomBytes(40);
    const second = randomBytes(55);

    const a = await history.save(first, { ext: "png", jobId: "TestPrinter-1" });
    const b = await history.save(second, { ext: "jpeg", jobId: "TestPrinter-2" });

    const listed = await history.list();
    assert.deepEqual(listed.map((e) => e.id), [b.id, a.id]);
    assert.equal(listed[0].ext, "jpg");
    assert.equal(listed[0].bytes, 55);
    assert.equal(listed[0].jobId, "TestPrinter-2");
    assert.match(listed[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const read = await history.read(a.id);
    assert.ok(read);
    assert.deepEqual(read.bytes, first);
  });

  it("keeps only the newest 20 entries and deletes the files of the rest", async () => {
    const dir = await freshDir("cap");
    const history = createHistory(dir);
    const saved = [];
    for (let i = 0; i < HISTORY_LIMIT + 3; i += 1) {
      saved.push(await history.save(Buffer.from(`print ${i}`), { ext: "png", jobId: `TestPrinter-${i}` }));
    }

    const listed = await history.list();
    assert.equal(listed.length, HISTORY_LIMIT);
    assert.equal(listed[0].id, saved[saved.length - 1].id);

    for (const old of saved.slice(0, 3)) {
      assert.equal(existsSync(path.join(dir, `${old.id}.png`)), false, "evicted file should be gone");
      assert.equal(await history.read(old.id), null);
    }
    const files = (await readdir(dir)).filter((name) => name.endsWith(".png"));
    assert.equal(files.length, HISTORY_LIMIT);
  });

  it("leaves no temp files behind after writes", async () => {
    const dir = await freshDir("temps");
    const history = createHistory(dir);
    await Promise.all(Array.from({ length: 8 }, (_, i) => history.save(Buffer.from(`${i}`), { ext: "png" })));
    const names = await readdir(dir);
    assert.deepEqual(names.filter((name) => name.endsWith(".tmp")), []);
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    assert.equal(index.length, 8);
  });

  it("keeps the index valid when many saves run at once", async () => {
    const dir = await freshDir("concurrent");
    const history = createHistory(dir);
    const payloads = Array.from({ length: 30 }, (_, i) => Buffer.from(`strip-${i}-${randomBytes(8).toString("hex")}`));

    const results = await Promise.all(payloads.map((bytes, i) => history.save(bytes, { ext: "png", jobId: `TestPrinter-${i}` })));

    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    assert.equal(index.length, HISTORY_LIMIT);
    const ids = new Set(index.map((e) => e.id));
    assert.equal(ids.size, HISTORY_LIMIT, "no duplicate entries");
    for (const entry of index) {
      const file = await readFile(path.join(dir, `${entry.id}.png`));
      assert.equal(file.length, entry.bytes);
    }
    // Every save got a distinct id. Saves run in call order, so the kept
    // entries are exactly the last 20 calls.
    assert.equal(new Set(results.map((r) => r.id)).size, 30);
    assert.deepEqual(ids, new Set(results.slice(-HISTORY_LIMIT).map((r) => r.id)));
  });

  it("resolves ids only through the index", async () => {
    const dir = await freshDir("ids");
    const history = createHistory(dir);
    const saved = await history.save(Buffer.from("secret strip"), { ext: "png" });

    for (const hostile of ["../index", "../../etc/passwd", "index", "", "a/b", "..", `${saved.id}/..`]) {
      assert.equal(await history.read(hostile), null, `rejects ${JSON.stringify(hostile)}`);
    }
    assert.equal(await history.read(undefined), null);
    assert.equal(await history.read(42), null);
    assert.ok(await history.read(saved.id));
  });

  it("answers null for an id whose file has gone missing", async () => {
    const dir = await freshDir("missing");
    const history = createHistory(dir);
    const saved = await history.save(Buffer.from("gone"), { ext: "png" });
    await rm(path.join(dir, `${saved.id}.png`));
    assert.equal(await history.read(saved.id), null);
  });

  it("drops an entry from the list and the index once its image file has gone", async () => {
    const dir = await freshDir("pruned");
    const history = createHistory(dir);
    const kept = await history.save(Buffer.from("first"), { ext: "png" });
    const gone = await history.save(Buffer.from("second"), { ext: "png" });
    await rm(path.join(dir, `${gone.id}.png`));

    assert.deepEqual((await history.list()).map((e) => e.id), [kept.id]);
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    assert.deepEqual(index.map((e) => e.id), [kept.id]);
  });

  it("deletes the image of an index entry it no longer accepts, and never builds a path from a bad id", async () => {
    const dir = await freshDir("dropped");
    const history = createHistory(dir);
    const bad = await history.save(Buffer.from("bad shape"), { ext: "png" });
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    index[0].bytes = "twelve";
    index.push({ id: "../escape", createdAt: "x", bytes: 1, ext: "png", jobId: null });
    await writeFile(path.join(dir, "index.json"), JSON.stringify(index));

    const next = await history.save(Buffer.from("next"), { ext: "png" });
    assert.equal(existsSync(path.join(dir, `${bad.id}.png`)), false, "dropped entry's image removed");
    assert.equal(existsSync(path.join(dir, `${next.id}.png`)), true, "new print kept");
    assert.deepEqual((await history.list()).map((e) => e.id), [next.id]);
  });

  it("treats an empty or absent history as empty", async () => {
    const history = createHistory(await freshDir("never-written"));
    assert.deepEqual(await history.list(), []);
    assert.equal(await history.read("anything"), null);
  });

  it("moves an unreadable index aside and carries on", async () => {
    const dir = await freshDir("corrupt");
    const history = createHistory(dir);
    await history.save(Buffer.from("before"), { ext: "png" });
    await writeFile(path.join(dir, "index.json"), "{ not json");

    const logged = [];
    const recovering = createHistory(dir, { log: (msg) => logged.push(msg) });
    assert.deepEqual(await recovering.list(), []);
    const saved = await recovering.save(Buffer.from("after"), { ext: "png" });

    assert.equal((await recovering.list())[0].id, saved.id);
    const names = await readdir(dir);
    assert.ok(names.some((name) => name.startsWith("index.corrupt-")), "bad index kept for inspection");
    assert.equal(logged.length, 1);
  });

  it("ignores index entries that do not have the expected shape", async () => {
    const dir = await freshDir("shape");
    const history = createHistory(dir);
    await history.save(Buffer.from("ok"), { ext: "png" });
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    index.push({ id: "../../escape", createdAt: "x", bytes: 1, ext: "png", jobId: null });
    await writeFile(path.join(dir, "index.json"), JSON.stringify(index));
    const listed = await history.list();
    assert.equal(listed.length, 1);
  });
});

describe("normaliseExt and resolveHistoryDir", () => {
  it("maps subtypes onto a fixed extension list", () => {
    assert.equal(normaliseExt("png"), "png");
    assert.equal(normaliseExt("JPEG"), "jpg");
    assert.equal(normaliseExt("webp"), "webp");
    assert.equal(normaliseExt("svg+xml"), "bin");
    assert.equal(normaliseExt("../../x"), "bin");
    assert.equal(normaliseExt(undefined), "bin");
  });

  it("defaults to ~/.cache/photobooth/prints and expands a leading ~", () => {
    assert.equal(resolveHistoryDir({}), path.join(os.homedir(), ".cache", "photobooth", "prints"));
    assert.equal(resolveHistoryDir({ PRINT_HISTORY_DIR: "" }), path.join(os.homedir(), ".cache", "photobooth", "prints"));
    assert.equal(resolveHistoryDir({ PRINT_HISTORY_DIR: "~/strips" }), path.join(os.homedir(), "strips"));
    assert.equal(resolveHistoryDir({ PRINT_HISTORY_DIR: "/var/lib/strips" }), "/var/lib/strips");
  });
});
