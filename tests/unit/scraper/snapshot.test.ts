// tests/unit/scraper/snapshot.test.ts
// Covers ING-05 + D-17/D-19: gzip-compressed raw HTML snapshots per successful fetch,
// stored at {SNAPSHOT_DIR}/YYYY/MM/DD.html.gz. Threat T-01-18: date input is used in a
// file path, so the DATE_RE validator must reject traversal-ish inputs BEFORE I/O.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { writeSnapshot, snapshotPathFor } from '../../../src/lib/scraper/snapshot';

describe('snapshot.ts (ING-05)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-snap-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('snapshotPathFor produces YYYY/MM/DD.html.gz under the base dir', () => {
    expect(snapshotPathFor('2024-08-15', tmp)).toBe(join(tmp, '2024', '08', '15.html.gz'));
  });

  it('snapshotPathFor throws on invalid date', () => {
    expect(() => snapshotPathFor('not-a-date', tmp)).toThrow(/invalid date/);
    expect(() => snapshotPathFor('2024-8-15', tmp)).toThrow(); // not zero-padded
  });

  it('snapshotPathFor blocks traversal attempts (T-01-18)', () => {
    // Anything with `..`, `/`, or other non-digit-hyphen chars must fail the regex BEFORE path join.
    expect(() => snapshotPathFor('../etc/passwd', tmp)).toThrow(/invalid date/);
    expect(() => snapshotPathFor('2024-08-15/../..', tmp)).toThrow(/invalid date/);
    expect(() => snapshotPathFor('', tmp)).toThrow(/invalid date/);
  });

  it('writeSnapshot round-trips: gunzip(stored) === original html', async () => {
    const html = '<html><body><p>test payload ñ漁</p></body></html>';
    const path = await writeSnapshot('2024-08-15', html, tmp);
    const bytes = readFileSync(path);
    const restored = gunzipSync(bytes).toString('utf8');
    expect(restored).toBe(html);
  });

  it('writeSnapshot creates nested directories (mkdir recursive)', async () => {
    const html = '<html></html>';
    const path = await writeSnapshot('2026-12-25', html, tmp);
    expect(path).toBe(join(tmp, '2026', '12', '25.html.gz'));
    // File must exist and be nonzero
    expect(readFileSync(path).byteLength).toBeGreaterThan(0);
  });

  it('writeSnapshot is idempotent — second call overwrites', async () => {
    await writeSnapshot('2024-08-15', 'first', tmp);
    const path = await writeSnapshot('2024-08-15', 'second', tmp);
    const restored = gunzipSync(readFileSync(path)).toString('utf8');
    expect(restored).toBe('second');
  });
});
