// tests/unit/components/ThemeToggle.test.ts
// Phase 8 Plan 04 — THM-01 / D-27. Aria-label contract: must spell out the
// CURRENT state and what clicking will do, not just the next action.
//
// We test the pure aria helper rather than rendering the Svelte component,
// because the component's only logic beyond the helper is the cookie write
// which is exercised by hooks.server tests + manual D-40 validation.
import { describe, it, expect } from 'vitest';
import { themeToggleAria, THEME_TOGGLE_TOOLTIP } from '../../../src/lib/copy/theme';

describe('themeToggleAria', () => {
  it('auto: announces current state and previews next (light)', () => {
    const label = themeToggleAria('auto');
    expect(label).toContain('Theme: Auto (follow system)');
    expect(label).toContain('Click for Light');
  });

  it('light: announces current state and previews next (dark)', () => {
    const label = themeToggleAria('light');
    expect(label).toContain('Theme: Light');
    expect(label).toContain('Click for Dark');
  });

  it('dark: announces current state and previews next (auto)', () => {
    const label = themeToggleAria('dark');
    expect(label).toContain('Theme: Dark');
    expect(label).toContain('Click for Auto (follow system)');
  });

  it('always reads as "Theme: <current>. Click for <next>."', () => {
    expect(themeToggleAria('auto')).toMatch(/^Theme: .+\. Click for .+\.$/);
    expect(themeToggleAria('light')).toMatch(/^Theme: .+\. Click for .+\.$/);
    expect(themeToggleAria('dark')).toMatch(/^Theme: .+\. Click for .+\.$/);
  });
});

describe('THEME_TOGGLE_TOOLTIP', () => {
  it('describes the cycle direction (Auto → Light → Dark)', () => {
    expect(THEME_TOGGLE_TOOLTIP).toMatch(/Auto/);
    expect(THEME_TOGGLE_TOOLTIP).toMatch(/Light/);
    expect(THEME_TOGGLE_TOOLTIP).toMatch(/Dark/);
  });
});
