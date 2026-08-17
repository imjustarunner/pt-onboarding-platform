import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeSchoolPortalFirstLoginOnboarding,
  markSchoolPortalFirstLoginOnboarding,
  shouldMarkSchoolPortalFirstLoginOnboarding
} from '../schoolPortalFirstLoginOnboarding.js';

describe('schoolPortalFirstLoginOnboarding', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('only marks school staff on first login', () => {
    expect(shouldMarkSchoolPortalFirstLoginOnboarding({ role: 'school_staff' }, { isFirstLogin: true })).toBe(true);
    expect(shouldMarkSchoolPortalFirstLoginOnboarding({ role: 'school_staff', isFirstLogin: true })).toBe(true);
    expect(shouldMarkSchoolPortalFirstLoginOnboarding({ role: 'school_staff' }, { isFirstLogin: false })).toBe(false);
    expect(shouldMarkSchoolPortalFirstLoginOnboarding({ role: 'admin' }, { isFirstLogin: true })).toBe(false);
  });

  it('stores and consumes the first-login flag once', () => {
    expect(markSchoolPortalFirstLoginOnboarding({ role: 'school_staff' }, { isFirstLogin: true })).toBe(true);
    expect(consumeSchoolPortalFirstLoginOnboarding()).toBe(true);
    expect(consumeSchoolPortalFirstLoginOnboarding()).toBe(false);
  });

  it('does not store a flag for returning staff', () => {
    expect(markSchoolPortalFirstLoginOnboarding({ role: 'school_staff' }, { isFirstLogin: false })).toBe(false);
    expect(consumeSchoolPortalFirstLoginOnboarding()).toBe(false);
  });
});
