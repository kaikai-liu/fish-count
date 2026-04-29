// tests/unit/alerts/disposableEmail.test.ts
// Phase 4 Plan 02 Wave-0 anchor: disposable-email rejection (ALT-04).
import { describe, it, expect } from 'vitest';
import { isDisposable } from '../../../src/lib/alerts/disposableEmail';

describe('disposableEmail.isDisposable', () => {
  it('flags known disposable domains', () => {
    expect(isDisposable('test@mailinator.com')).toBe(true);
    expect(isDisposable('test@10minutemail.com')).toBe(true);
    expect(isDisposable('test@guerrillamail.com')).toBe(true);
  });
  it('accepts mainstream provider domains', () => {
    expect(isDisposable('test@gmail.com')).toBe(false);
    expect(isDisposable('test@yahoo.com')).toBe(false);
    expect(isDisposable('test@icloud.com')).toBe(false);
    expect(isDisposable('test@outlook.com')).toBe(false);
  });
  it('is case-insensitive on the domain', () => {
    expect(isDisposable('user@MAILINATOR.com')).toBe(true);
    expect(isDisposable('user@MailINATor.COM')).toBe(true);
  });
  it('returns false on malformed input (no @)', () => {
    expect(isDisposable('not-an-email')).toBe(false);
  });
});
