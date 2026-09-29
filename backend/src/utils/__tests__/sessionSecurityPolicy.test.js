import { describe, it, expect } from 'vitest';
import { resolveSessionPolicy, sessionSecurityState, validateSessionSettings } from '../sessionSecurityPolicy.js';

describe('session security policy', () => {
  it.each(['admin', 'support', 'super_admin', 'superadmin', 'super-admin', 'super admin'])(
    'gives non-hourly %s ten minutes idle and ten minutes to resume despite generic agency settings', (role) => {
      const policy = resolveSessionPolicy({ role, isHourlyWorker: false, settings: [{ idleBeforeTimedownSeconds: 180, timedownSeconds: 90 }] });
      expect(policy).toMatchObject({ nonHourlyAdminSession: true, idleBeforeTimedownSeconds: 600, timedownSeconds: 600 });
      const row = { last_activity_at: new Date(0), absolute_expires_at: 3600000 };
      expect(sessionSecurityState(row, policy, 599999).phase).toBe('active');
      expect(sessionSecurityState(row, policy, 600000).phase).toBe('timedown');
      expect(sessionSecurityState(row, policy, 1199999).phase).toBe('timedown');
      expect(sessionSecurityState(row, policy, 1200000).phase).toBe('expired');
    }
  );
  it.each(['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider', 'staff'])(
    'preserves existing policy for hourly or unverified %s', (role) => {
      const settings = [{ idleBeforeTimedownSeconds: 180, timedownSeconds: 90 }];
      for (const isHourlyWorker of [true, undefined]) {
        expect(resolveSessionPolicy({ role, isHourlyWorker, settings })).toMatchObject({ nonHourlyAdminSession: false, idleBeforeTimedownSeconds: 180, timedownSeconds: 90 });
      }
      if (!['admin', 'support', 'super_admin'].includes(role)) {
        expect(resolveSessionPolicy({ role, isHourlyWorker: false, settings })).toMatchObject({ nonHourlyAdminSession: false, idleBeforeTimedownSeconds: 180, timedownSeconds: 90 });
      }
    }
  );
  it('keeps explicit shorter lock limits and required PINs for non-hourly admins', () => {
    const input = { role: 'admin', isHourlyWorker: false };
    expect(resolveSessionPolicy({ ...input, platformMax: 2 }).idleBeforeTimedownSeconds).toBe(120);
    expect(resolveSessionPolicy({ ...input, settings: [{ maxInactivityTimeoutMinutes: 3, requireQuickViewPinRoles: ['admin'] }] })).toMatchObject({ idleBeforeTimedownSeconds: 180, pinRequired: true, useLockScreen: true });
    expect(resolveSessionPolicy({ ...input, preferences: { session_lock_enabled: 1, inactivity_timeout_minutes: 1 } }).idleBeforeTimedownSeconds).toBe(60);
  });
  it('enforces selected roles regardless of user preferences or agency ordering', () => {
    const settings = [{ idleBeforeTimedownSeconds: 900 }, { requireQuickViewPinRoles: ['admin'], idleBeforeTimedownSeconds: 120, timedownSeconds: 90 }];
    const policy = resolveSessionPolicy({ role: 'admin', settings, preferences: { session_lock_enabled: false } });
    expect(policy).toMatchObject({ useLockScreen: true, pinRequired: true, pinLength: 6, idleBeforeTimedownSeconds: 120, timedownSeconds: 90 });
    expect(resolveSessionPolicy({ role: 'admin', settings: [...settings].reverse() })).toEqual(policy);
    expect(resolveSessionPolicy({ role: 'provider', settings }).pinRequired).toBe(false);
  });
  it('caps admin and superadmin deadlines and normalizes legacy role names', () => {
    for (const role of ['admin', 'super_admin', 'superadmin', 'super-admin']) {
      expect(resolveSessionPolicy({ role, settings: [{ idleBeforeTimedownSeconds: 3600, timedownSeconds: 3600 }] })).toMatchObject({ idleBeforeTimedownSeconds: 600, timedownSeconds: 600 });
    }
  });
  it('retains optional legacy four-digit PINs and enforces lower caps', () => {
    expect(resolveSessionPolicy({ role: 'provider', preferences: { session_lock_enabled: 1, session_lock_pin_hash: 'hash', inactivity_timeout_minutes: 1 } })).toMatchObject({ useLockScreen: true, pinLength: 4, idleBeforeTimedownSeconds: 60 });
    expect(resolveSessionPolicy({ role: 'admin', platformMax: 2 }).idleBeforeTimedownSeconds).toBe(120);
  });
  it('rejects malformed role settings', () => {
    expect(() => validateSessionSettings({ requireQuickViewPinRoles: 'admin' })).toThrow();
    expect(() => validateSessionSettings({ requireQuickViewPinRoles: ['made_up'] })).toThrow();
    expect(validateSessionSettings({ requireQuickViewPinRoles: [] })).toEqual({ requireQuickViewPinRoles: [] });
  });
  it('locks and expires at absolute boundaries even after a day without any timers', () => {
    const row = { last_activity_at: new Date(100000), absolute_expires_at: 10000000 };
    const policy = { idleBeforeTimedownSeconds: 30, timedownSeconds: 90 };
    expect(sessionSecurityState(row, policy, 129999).phase).toBe('active');
    expect(sessionSecurityState(row, policy, 130000).phase).toBe('timedown');
    expect(sessionSecurityState(row, policy, 220000).phase).toBe('expired');
    expect(sessionSecurityState(row, policy, 86400000).phase).toBe('expired');
    expect(sessionSecurityState({ ...row, revoked_at: new Date(101000) }, policy, 110000).phase).toBe('expired');
  });
});
