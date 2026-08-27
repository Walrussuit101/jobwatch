import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendFile, mkdir, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { withLock, LockTimeoutError } from "../src/lock.js";

const TMP = join(tmpdir(), `pulse-lock-test-${process.pid}`);
await mkdir(TMP, { recursive: true });

after(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("Lock", () => {
  test("single writer acquires immediately and releases", async () => {
    const lockPath = join(TMP, "single.lock");
    let ran = false;
    await withLock(lockPath, async () => {
      ran = true;
    });
    assert.ok(ran);
    await assert.rejects(() => readFile(lockPath), { code: "ENOENT" });
  });

  test("releases lock even when fn throws", async () => {
    const lockPath = join(TMP, "throw.lock");
    await assert.rejects(
      () => withLock(lockPath, async () => { throw new Error("boom"); }),
      { message: "boom" },
    );
    await assert.rejects(() => readFile(lockPath), { code: "ENOENT" });
  });

  test("concurrent writers all complete without data loss", async () => {
    const lockPath = join(TMP, "concurrent.lock");
    const dataFile = join(TMP, "concurrent.txt");
    const N = 20;

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        withLock(lockPath, async () => {
          await appendFile(dataFile, `${i}\n`, "utf8");
        }),
      ),
    );

    const lines = (await readFile(dataFile, "utf8")).trim().split("\n").filter(Boolean);
    assert.equal(lines.length, N);
    const nums = lines.map(Number).sort((a, b) => a - b);
    assert.deepEqual(nums, Array.from({ length: N }, (_, i) => i));
  });

  test("breaks a stale lock whose process is dead", async () => {
    const lockPath = join(TMP, "stalePid.lock");
    // PID 2147483647 exceeds the max on any OS — guaranteed ESRCH
    await writeFile(lockPath, "2147483647", "utf8");

    let ran = false;
    await withLock(lockPath, async () => { ran = true; }, { retryIntervalMs: 10 });
    assert.ok(ran);
  });

  test("breaks a stale lock whose mtime is old", async () => {
    const lockPath = join(TMP, "staleMtime.lock");
    // Current PID — process.kill says alive — but mtime is backdated
    await writeFile(lockPath, String(process.pid), "utf8");
    const oldTime = new Date(Date.now() - 60_000);
    await utimes(lockPath, oldTime, oldTime);

    let ran = false;
    await withLock(lockPath, async () => { ran = true; }, {
      retryIntervalMs: 10,
      staleAfterMs: 30_000,
    });
    assert.ok(ran);
  });

  test("throws LockTimeoutError when lock is held by a live process", async () => {
    const lockPath = join(TMP, "timeout.lock");
    await writeFile(lockPath, String(process.pid), "utf8");
    try {
      await assert.rejects(
        () => withLock(lockPath, async () => {}, { timeoutMs: 150, retryIntervalMs: 20 }),
        (err: unknown) => {
          assert.ok(err instanceof LockTimeoutError, `expected LockTimeoutError, got ${err}`);
          return true;
        },
      );
    } finally {
      await unlink(lockPath).catch(() => {});
    }
  });
});
