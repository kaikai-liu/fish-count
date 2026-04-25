// tests/unit/db/dal-boundary.test.ts
// STO-03 static-grep enforcement: only files under src/lib/db/ issue SQL.
// This is the canary for the DAL boundary rule in CLAUDE.md Architecture Rules.
// Downstream plans (scraper, CLI, server tick) MUST keep this test green.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SCOPE_DIRS = [
  'src/lib/scraper',
  'src/lib/server',
  'src/lib/alerts',
  'src/lib/shared',
  'src/lib/ops',
  'src/routes',
  'src/lib/components',
  'scripts'
];

describe('STO-03 DAL boundary (static grep enforcement)', () => {
  it('no SQL keywords in code paths outside src/lib/db/', () => {
    // Filter to directories that actually exist (Phase 1 may land before some
    // siblings are populated).
    const existing = SCOPE_DIRS.filter((d) => existsSync(d));
    if (existing.length === 0) {
      // Nothing to scan yet — trivially passes. Later phases will add content.
      expect(true).toBe(true);
      return;
    }

    // Match SELECT / INSERT INTO / UPDATE <table> / DELETE FROM at word
    // boundaries, case-sensitive (matches the SQL uppercase convention used
    // by the DAL). Filter out pure-comment hits so a doc line mentioning SQL
    // doesn't fail the test.
    const pattern = '\\b(SELECT|INSERT INTO|UPDATE [a-zA-Z_]+|DELETE FROM)\\b';
    let out = '';
    try {
      out = execSync(
        `grep -rnE --include='*.ts' "${pattern}" ${existing.join(' ')} 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
    } catch {
      out = '';
    }

    const lines = out
      .split('\n')
      .filter((l) => l.trim().length > 0)
      // Drop pure-comment hits (lines where the match is inside a // comment).
      .filter((l) => !/:\s*\/\//.test(l))
      .filter((l) => !/:\s*\*/.test(l));

    expect(
      lines,
      `Unexpected SQL outside src/lib/db/:\n${lines.join('\n')}`
    ).toEqual([]);
  });
});
