// src/lib/scraper/snapshot.ts
// ING-05 + D-17/D-19: gzip-compressed raw HTML snapshots for every successful fetch.
// Path: {SNAPSHOT_DIR}/YYYY/MM/DD.html.gz (default SNAPSHOT_DIR=/data/snapshots).
// Idempotent: same date overwrites (matches ING-04 semantics per D-19).
//
// Load-bearing invariant (RESEARCH.md:482, enforced by Plan 01-05 pipeline.ts):
//   writeSnapshot MUST be called BEFORE parsePage(html). If parsing is broken,
//   we still have the raw evidence for replay.
//
// Security — T-01-18 (path traversal): `date` flows into a file path. The
// DATE_RE regex rejects any input containing `..`, `/`, or non-digit/hyphen
// characters BEFORE I/O. Tests cover `../etc/passwd`, unpadded months,
// and empty strings.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { logger } from '$lib/server/logger';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultBaseDir(): string {
  return process.env.SNAPSHOT_DIR ?? '/data/snapshots';
}

export function snapshotPathFor(date: string, baseDir: string = defaultBaseDir()): string {
  if (!DATE_RE.test(date)) {
    throw new Error(`snapshot: invalid date "${date}" (expected YYYY-MM-DD)`);
  }
  const [yyyy, mm, dd] = date.split('-');
  return join(baseDir, yyyy, mm, `${dd}.html.gz`);
}

export async function writeSnapshot(
  date: string,
  html: string,
  baseDir: string = defaultBaseDir()
): Promise<string> {
  const path = snapshotPathFor(date, baseDir);
  await mkdir(dirname(path), { recursive: true });
  const gz = gzipSync(html);
  await writeFile(path, gz);
  logger.info({ msg: 'snapshot_written', date, path, bytes: gz.byteLength });
  return path;
}
