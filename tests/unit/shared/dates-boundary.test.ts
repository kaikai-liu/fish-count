// tests/unit/shared/dates-boundary.test.ts
// STO-04 static-grep enforcement: YYYY-MM-DD strings are produced EXCLUSIVELY
// by src/lib/shared/dates.ts (CLAUDE.md Architecture Rules + STO-04).
//
// This is the parallel canary to tests/unit/db/dal-boundary.test.ts (Plan 01-01).
// Downstream plans MUST keep this test green. Any code that derives a
// YYYY-MM-DD string via `.toISOString().slice(0, 10)` or `.split('T')[0]` on a
// raw Date is bypassing the single-producer rule — date-string production
// must go through today() / toIsoDate() from src/lib/shared/dates.ts.
//
// Allowed OUTSIDE the restricted scopes:
//   - `new Date().toISOString()` for full-timestamp logging (scraped_at,
//     started_at, finished_at) — NOT a YYYY-MM-DD extraction.
//   - `.slice(0, N)` on non-Date strings (e.g., truncating log payloads).
//
// Not allowed:
//   - `.toISOString().slice(0, 10)`                 (YYYY-MM-DD from a Date)
//   - `.toISOString().slice(0,10)` (no space)       (same idiom, no space)
//   - `.split('T')[0]` on an ISO string             (alt YYYY-MM-DD extraction)
//
// Scopes scanned: src/lib/scraper, src/lib/db, src/lib/server, src/lib/alerts,
// scripts. src/lib/shared/ is deliberately excluded — that IS the producer.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SCOPE_DIRS = [
  'src/lib/scraper',
  'src/lib/db',
  'src/lib/server',
  'src/lib/alerts',
  'src/lib/ops',
  'src/routes',
  'src/lib/components',
  'scripts'
];

describe('STO-04 date-producer boundary (static grep enforcement)', () => {
  it('no `.toISOString().slice(0, N)` YYYY-MM-DD extraction outside src/lib/shared/dates.ts', () => {
    const existing = SCOPE_DIRS.filter((d) => existsSync(d));
    if (existing.length === 0) {
      expect(true).toBe(true);
      return;
    }

    // Match `.toISOString().slice(0` — with or without a space after the comma.
    // This is the canonical "extract YYYY-MM-DD from a Date" idiom.
    const pattern = 'toISOString\\(\\)\\.slice\\(0';
    let out = '';
    try {
      out = execSync(
        `grep -rnE --include='*.ts' "${pattern}" ${existing.join(' ')} 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
    } catch {
      out = '';
    }

    const violations = out
      .split('\n')
      .filter((l) => l.trim().length > 0)
      // Drop pure-comment hits (line-start comment OR column-number immediately
      // followed by `//`). Comments mentioning the banned pattern for
      // documentation purposes are fine.
      .filter((l) => !/:\s*\/\//.test(l))
      .filter((l) => !/:\s*\*/.test(l));

    expect(
      violations,
      `Forbidden pattern /${pattern}/ found outside src/lib/shared/dates.ts. ` +
        `Use today() / toIsoDate() from src/lib/shared/dates.ts, or pure ` +
        `string arithmetic for range enumeration. Violations:\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('no `.split("T")[0]` ISO-date splitting outside src/lib/shared/dates.ts', () => {
    const existing = SCOPE_DIRS.filter((d) => existsSync(d));
    if (existing.length === 0) {
      expect(true).toBe(true);
      return;
    }

    // Match `.split('T')[0]` or `.split("T")[0]` — alternative YYYY-MM-DD
    // extraction idiom. Uses a character class for the quote to tolerate
    // either style.
    const pattern = '\\.split\\([\\"\\x27]T[\\"\\x27]\\)\\[0\\]';
    let out = '';
    try {
      out = execSync(
        `grep -rnE --include='*.ts' "${pattern}" ${existing.join(' ')} 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
    } catch {
      out = '';
    }

    const violations = out
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .filter((l) => !/:\s*\/\//.test(l))
      .filter((l) => !/:\s*\*/.test(l));

    expect(
      violations,
      `Forbidden pattern /${pattern}/ found outside src/lib/shared/dates.ts. ` +
        `Use today() / toIsoDate() from src/lib/shared/dates.ts. ` +
        `Violations:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
