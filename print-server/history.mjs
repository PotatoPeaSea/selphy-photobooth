// Saved copies of accepted prints, so staff can reprint without the guest.
// Image bytes live in the history dir and index.json lists the newest entries.
// Ids are minted here and resolved only through the index; no path is ever
// built from a client-supplied value.
import { randomBytes } from "node:crypto";
import { access, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const HISTORY_LIMIT = 20;

const INDEX_FILE = "index.json";
const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const EXTENSIONS = new Map([
  ["png", "png"],
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["webp", "webp"],
  ["gif", "gif"],
]);

/** Map an image subtype to a fixed file extension. Anything unexpected becomes "bin". */
export function normaliseExt(subtype) {
  return EXTENSIONS.get(String(subtype ?? "").toLowerCase()) ?? "bin";
}

export function resolveHistoryDir(env = process.env) {
  const raw = env.PRINT_HISTORY_DIR?.trim();
  if (!raw) return path.join(os.homedir(), ".cache", "photobooth", "prints");
  if (raw === "~" || raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(1));
  return path.resolve(raw);
}

function isEntry(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    ID_PATTERN.test(value.id) &&
    typeof value.createdAt === "string" &&
    Number.isInteger(value.bytes) &&
    typeof value.ext === "string" &&
    (value.jobId === null || typeof value.jobId === "string")
  );
}

function newId() {
  return `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

export function createHistory(dir, { limit = HISTORY_LIMIT, log = () => {} } = {}) {
  const indexPath = path.join(dir, INDEX_FILE);

  // Every write runs after the previous one, so two prints finishing together
  // cannot read the same index and overwrite each other's entry.
  let chain = Promise.resolve();
  function exclusive(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  function fileFor(entry) {
    return path.join(dir, `${entry.id}.${normaliseExt(entry.ext)}`);
  }

  // A rejected index value may hold any id, so a file name is built only from an id that passes the pattern.
  function fileForRejected(value) {
    if (value === null || typeof value !== "object" || typeof value.id !== "string") return null;
    return ID_PATTERN.test(value.id) ? fileFor(value) : null;
  }

  function exists(file) {
    return access(file).then(
      () => true,
      () => false,
    );
  }

  // `dropped` keeps the values the shape check rejected, so their images can still be removed.
  async function readIndex() {
    let text;
    try {
      text = await readFile(indexPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return { entries: [], dropped: [], corrupt: false };
      throw err;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return { entries: [], dropped: [], corrupt: true };
      return {
        entries: parsed.filter(isEntry),
        dropped: parsed.filter((value) => !isEntry(value)),
        corrupt: false,
      };
    } catch {
      return { entries: [], dropped: [], corrupt: true };
    }
  }

  // Temp file in the same directory, then rename: readers see the old index or the new one, never half of one.
  async function writeAtomic(target, data) {
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      const handle = await open(tmp, "w", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, target);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  function save(bytes, { ext, jobId = null } = {}) {
    return exclusive(async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const entry = {
        id: newId(),
        createdAt: new Date().toISOString(),
        bytes: bytes.length,
        ext: normaliseExt(ext),
        jobId,
      };
      await writeAtomic(fileFor(entry), bytes);

      const { entries: previous, dropped, corrupt } = await readIndex();
      if (corrupt) {
        // Keep the unreadable index for inspection instead of silently dropping it.
        const aside = path.join(dir, `index.corrupt-${Date.now()}.json`);
        await rename(indexPath, aside).catch(() => {});
        log(`History index was unreadable; moved to ${aside}`);
      }

      const all = [entry, ...previous];
      const kept = all.slice(0, limit);
      const evicted = all.slice(limit);
      try {
        await writeAtomic(indexPath, `${JSON.stringify(kept, null, 2)}\n`);
      } catch (err) {
        await unlink(fileFor(entry)).catch(() => {});
        throw err;
      }

      // Images of evicted and rejected entries go, unless a kept entry still names the same file.
      const inUse = new Set(kept.map(fileFor));
      const orphans = new Set([...evicted.map(fileFor), ...dropped.map(fileForRejected).filter(Boolean)]);
      await Promise.all(
        [...orphans].filter((file) => !inUse.has(file)).map((file) => unlink(file).catch(() => {})),
      );
      return entry;
    });
  }

  /**
   * Newest first. An entry whose image has gone is removed from the index, so the
   * panel never lists a print that cannot be reprinted.
   */
  function list() {
    return exclusive(async () => {
      const { entries } = await readIndex();
      const present = [];
      for (const entry of entries) {
        if (await exists(fileFor(entry))) present.push(entry);
      }
      if (present.length !== entries.length) {
        try {
          await writeAtomic(indexPath, `${JSON.stringify(present, null, 2)}\n`);
        } catch (err) {
          log(`Could not prune the history index: ${err.message}`);
        }
      }
      return present;
    });
  }

  /** { entry, bytes } for an id in the index, or null. */
  async function read(id) {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
    const { entries } = await readIndex();
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return null;
    try {
      return { entry, bytes: await readFile(fileFor(entry)) };
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  return { dir, limit, save, list, read };
}
