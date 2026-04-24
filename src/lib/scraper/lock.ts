// src/lib/scraper/lock.ts
// D-13 tier 2: cross-process file mutex preventing CLI + scheduler from running
// concurrently. Pairs with rate-limiter.ts (tier 1, in-process p-queue).
// Source: 01-RESEARCH.md Pattern 4 + Context7 /moxystudio/node-proper-lockfile.
//
// Fail-fast by design: retries: { retries: 0 } means a second process trying
// to acquire the lock gets an immediate error — the CLI should print
// "scheduler is running, try later" and exit, NOT queue up indefinitely.
//
// SCRAPE_LOCK_PATH env var allows operator override (default /data/scrape.lock
// on the Fly volume). Tests set this to a tmpdir path per test.
import lockfile from 'proper-lockfile';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_LOCK_PATH = process.env.SCRAPE_LOCK_PATH ?? '/data/scrape.lock';

async function ensureLockTarget(path: string): Promise<void> {
  // proper-lockfile requires the target file to exist (it creates a sibling
  // <path>.lock directory for atomicity). Creating the target is our responsibility.
  try {
    await access(path);
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `pid:${process.pid}\n`);
  }
}

export async function withScrapeLock<T>(
  fn: () => Promise<T>,
  path: string = DEFAULT_LOCK_PATH
): Promise<T> {
  await ensureLockTarget(path);
  const release = await lockfile.lock(path, {
    stale: 60_000, // assume crashed after 60s (matches Fly SIGTERM grace + buffer)
    retries: { retries: 0 } // fail fast — CLI should print "scheduler is running" and exit
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
