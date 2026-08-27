import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export interface LockOptions {
  retryIntervalMs?: number;
  timeoutMs?: number;
  staleAfterMs?: number;
}

export class LockTimeoutError extends Error {
  constructor(lockPath: string, timeoutMs: number) {
    super(`timed out waiting ${timeoutMs}ms to acquire lock ${lockPath}`);
    this.name = "LockTimeoutError";
  }
}

/**
 * Runs fn while holding an exclusive advisory lock on lockPath.
 * Uses O_EXCL for atomic acquisition; detects stale locks via PID liveness and mtime.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  opts?: LockOptions,
): Promise<T> {
  const retryIntervalMs = opts?.retryIntervalMs ?? 50;
  const timeoutMs = opts?.timeoutMs ?? 5_000;
  const staleAfterMs = opts?.staleAfterMs ?? 30_000;

  await mkdir(dirname(lockPath), { recursive: true });
  await acquire(lockPath, Date.now() + timeoutMs, retryIntervalMs, staleAfterMs, timeoutMs);
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

async function acquire(
  lockPath: string,
  deadline: number,
  retryIntervalMs: number,
  staleAfterMs: number,
  timeoutMs: number,
): Promise<void> {
  while (true) {
    try {
      const fd = await open(lockPath, "wx");
      await fd.writeFile(String(process.pid), "utf8");
      await fd.close();
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    await tryBreakStale(lockPath, staleAfterMs);

    if (Date.now() >= deadline) throw new LockTimeoutError(lockPath, timeoutMs);

    await sleep(retryIntervalMs);
  }
}

async function tryBreakStale(lockPath: string, staleAfterMs: number): Promise<void> {
  let pid: number | undefined;
  try {
    const content = await readFile(lockPath, "utf8");
    const n = parseInt(content.trim(), 10);
    if (!isNaN(n)) pid = n;
  } catch {
    return;
  }

  // Mtime check first — catches PID reuse on long-running systems
  try {
    const st = await stat(lockPath);
    if (Date.now() - st.mtimeMs > staleAfterMs) {
      await unlink(lockPath).catch(() => {});
      return;
    }
  } catch {
    return;
  }

  // PID liveness check via signal 0 (throws ESRCH if process is dead)
  if (pid !== undefined) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") {
        await unlink(lockPath).catch(() => {});
      }
      // EPERM: process exists but belongs to another user — treat as alive
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
