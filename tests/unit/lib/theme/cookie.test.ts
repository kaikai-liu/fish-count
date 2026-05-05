// tests/unit/lib/theme/cookie.test.ts
// Phase 8 Plan 04 — THM-02. Pitfall 2 (cookie injection guard).
//
// validateTheme is the SOLE trust boundary between the untrusted fc_theme
// cookie value and the <html data-theme="..."> attribute the hook injects.
import { describe, it, expect } from 'vitest';
import { validateTheme, THEME_COOKIE } from '../../../../src/lib/shared/theme';

describe('validateTheme', () => {
  it('accepts canonical literals', () => {
    expect(validateTheme('auto')).toBe('auto');
    expect(validateTheme('light')).toBe('light');
    expect(validateTheme('dark')).toBe('dark');
  });

  it('falls back to auto on undefined/null', () => {
    expect(validateTheme(undefined)).toBe('auto');
    expect(validateTheme(null)).toBe('auto');
  });

  it('falls back to auto on garbage', () => {
    expect(validateTheme('garbage')).toBe('auto');
    expect(validateTheme('')).toBe('auto');
    expect(validateTheme('system')).toBe('auto');
  });

  it('is case-sensitive (LIGHT is not light)', () => {
    expect(validateTheme('LIGHT')).toBe('auto');
    expect(validateTheme('Dark')).toBe('auto');
    expect(validateTheme('AUTO')).toBe('auto');
  });

  it('rejects HTML/JS injection attempts (Pitfall 2)', () => {
    expect(validateTheme('" onerror="alert(1)')).toBe('auto');
    expect(validateTheme('<script>alert(1)</script>')).toBe('auto');
    expect(validateTheme('light onerror=alert(1)')).toBe('auto');
    expect(validateTheme('"><img src=x>')).toBe('auto');
  });
});

describe('THEME_COOKIE', () => {
  it('is the literal "fc_theme"', () => {
    expect(THEME_COOKIE).toBe('fc_theme');
  });
});
