// tests/unit/lint/anti-feature.test.ts
// Phase 2 UI-SPEC §"Anti-Feature Guards" + CLAUDE.md anti-features list.
//
// Scans src/routes + src/lib/components for forbidden hype/sponsorship/leaderboard
// patterns. Failing this test is loud (Vitest exit nonzero blocks CI).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [join(ROOT, 'src', 'routes'), join(ROOT, 'src', 'lib', 'components')];

const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'ON FIRE', re: /\bON\s+FIRE\b/i },
  { name: 'HOT BITE', re: /\bHOT\s+BITE\b/i },
  { name: 'flame emoji', re: /🔥/u },
  { name: 'trophy emoji', re: /🏆/u },
  { name: 'star emoji', re: /⭐|🌟/u },
  { name: 'medal emoji', re: /🥇|🥈|🥉/u },
  { name: 'Sponsored slot', re: /\bSponsored\b/i },
  { name: 'Featured slot', re: /\bFeatured\b/i },
  { name: 'Promoted slot', re: /\bPromoted\b/i },
  { name: 'Leaderboard framing', re: /\bLeaderboard\b/i },
  { name: 'Top N this season', re: /\bTop\s+\d+\s+(boats?|this season)/i },
  { name: 'Live update polling', re: /\b(refresh|update)\s+(just\s+now|every\s+\d+s)/i },
  { name: 'Manual scrape trigger', re: /\bScrape\s+now\b/i }
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (full.endsWith('.svelte') || full.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('anti-feature guard (UI-SPEC §Anti-Feature Guards + CLAUDE.md)', () => {
  it('no forbidden hype/sponsorship/leaderboard patterns in src/routes or src/lib/components', () => {
    const violations: { file: string; line: number; text: string; pattern: string }[] = [];
    // Skip comment lines — the check targets user-facing rendered text, not
    // developer notes about what NOT to build. A comment saying "no sponsored
    // slots" is documenting compliance intent, not introducing a violation.
    const COMMENT_RE = /^\s*(\/\/|\/\*|\*|<!--)/;
    for (const dir of SCAN_DIRS) {
      for (const f of walk(dir)) {
        const lines = readFileSync(f, 'utf-8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (COMMENT_RE.test(lines[i])) continue;
          for (const p of FORBIDDEN_PATTERNS) {
            if (p.re.test(lines[i])) {
              violations.push({ file: f, line: i + 1, text: lines[i].trim(), pattern: p.name });
            }
          }
        }
      }
    }
    if (violations.length > 0) {
      console.error('ANTI-FEATURE VIOLATIONS:');
      for (const v of violations)
        console.error(`  ${v.file}:${v.line} [${v.pattern}]  ${v.text}`);
    }
    expect(violations).toEqual([]);
  });
});
