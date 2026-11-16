import { open, stat, unlink } from "node:fs/promises";

const codeOf = (error: unknown) => error instanceof Error && "code" in error ? error.code : undefined;

async function removeStaleLock(filename: string): Promise<boolean> {
  const guard = `${filename}.reap`;
  let reaper;
  try {
    reaper = await open(guard, "wx", 0o600);
  } catch (error) {
    if (codeOf(error) !== "EEXIST") throw error;
    try {
      if (Date.now() - (await stat(guard)).mtimeMs > 15_000) await unlink(guard);
    } catch (problem) {
      if (codeOf(problem) !== "ENOENT") throw problem;
    }
    return false;
  }
  try {
    const info = await stat(filename);
    if (Date.now() - info.mtimeMs <= 15_000) return false;
    const current = await stat(filename);
    if (info.ino !== current.ino || info.dev !== current.dev || info.mtimeMs !== current.mtimeMs) return false;
    await unlink(filename);
    return true;
  } catch (error) {
    if (codeOf(error) === "ENOENT") return true;
    throw error;
  } finally {
    await reaper.close();
    await unlink(guard);
  }
}

export async function acquireWriteLock(filename: string) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      const file = await open(filename, "wx", 0o600);
      let heartbeat = Promise.resolve();
      const timer = setInterval(() => {
        heartbeat = heartbeat.then(async () => {
          const now = new Date();
          await file.utimes(now, now);
        }).catch((error: unknown) => console.error("Could not refresh CAFM state write lock", error));
      }, 4_000);
      timer.unref();
      return async () => {
        clearInterval(timer);
        await heartbeat;
        const owned = await file.stat();
        await file.close();
        try {
          const current = await stat(filename);
          if (current.dev === owned.dev && current.ino === owned.ino) await unlink(filename);
        } catch (error) {
          if (codeOf(error) !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (codeOf(error) !== "EEXIST") throw error;
      try {
        const info = await stat(filename);
        if (Date.now() - info.mtimeMs > 15_000 && await removeStaleLock(filename)) continue;
      } catch (problem) {
        if (codeOf(problem) === "ENOENT") continue;
        throw problem;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 50 + Math.floor(Math.random() * 41))));
    }
  }
}
