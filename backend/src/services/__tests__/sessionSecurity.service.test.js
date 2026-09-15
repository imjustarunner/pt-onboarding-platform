import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), compare: vi.fn(), connection: { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: async () => mocks.connection } }));
vi.mock('bcrypt', () => ({ default: { compare: mocks.compare } }));
import { changeSessionSecurity, sessionRouteAllowed, getSessionSecurity, invalidateSessionPolicyCache } from '../sessionSecurity.service.js';

let row;
const policy = { idleBeforeTimedownSeconds: 30, timedownSeconds: 90, useLockScreen: true, pinRequired: true };
const security = () => ({ key: 'signed-session-key', policy });
beforeEach(() => {
  vi.clearAllMocks();
  row = { user_id: 1, last_activity_at: new Date(Date.now() - 40000), absolute_expires_at: Date.now() + 86400000, failed_pin_attempts: 0 };
  mocks.connection.execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT * FROM auth_session_security')) return [[{ ...row }]];
    if (sql.includes('SELECT * FROM user_quick_view_credentials')) return [[{ passcode_hash: 'hash', failed_passcode_attempts: 0 }]];
    return [{ affectedRows: 1 }];
  });
  mocks.compare.mockResolvedValue(true);
});
describe('server session transitions', () => {
  it('rejects client data reads/writes while locked and permits only exact recovery routes', () => {
    for (const phase of ['timedown', 'expired']) {
      const s = { state: { phase } };
      expect(sessionRouteAllowed(s, 'GET', '/api/clients/1')).toBe(false);
      expect(sessionRouteAllowed(s, 'POST', '/api/presence/status/clear')).toBe(false);
      expect(sessionRouteAllowed(s, 'POST', '/api/auth/logout')).toBe(true);
      expect(sessionRouteAllowed(s, 'POST', '/api/auth/session-activity/anything')).toBe(false);
      expect(sessionRouteAllowed(s, 'POST', '/api/auth/session-activity')).toBe(phase !== 'expired');
    }
  });
  it('does not revoke a newer unlock when expiry was based on an older database snapshot', async () => {
    invalidateSessionPolicyCache();
    const expired = { ...row, last_activity_at: new Date(Date.now() - 86400000) };
    const renewed = { ...row, last_activity_at: new Date() };
    let reads = 0;
    mocks.execute.mockImplementation(async sql => {
      if (sql.startsWith('SELECT * FROM auth_session_security')) return [[reads++ === 0 ? expired : renewed]];
      if (sql.startsWith('UPDATE auth_session_security')) return [{ affectedRows: 0 }];
      return [[]];
    });
    const result = await getSessionSecurity({ id: 1, role: 'admin', sessionId: 'signed', iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 }, 'token');
    expect(result.state.phase).toBe('active');
    expect(reads).toBe(2);
    const revoke = mocks.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE auth_session_security'));
    expect(revoke[0]).toContain('last_activity_at = ?');
    expect(revoke[1][1]).toEqual(expired.last_activity_at);
  });
  it('background activity cannot unlock a timed-out session', async () => {
    await expect(changeSessionSecurity(security(), 1, 'activity')).rejects.toMatchObject({ code: 'SESSION_LOCKED' });
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.connection.execute.mock.calls.some(([sql]) => sql.includes('SET last_activity_at'))).toBe(false);
  });
  it('verifies the existing Quick View code and returns an active deadline', async () => {
    const result = await changeSessionSecurity(security(), 1, 'resume', '012345');
    expect(mocks.compare).toHaveBeenCalledWith('012345', 'hash');
    expect(result.phase).toBe('active');
    expect(mocks.connection.commit).toHaveBeenCalled();
    expect(mocks.connection.execute.mock.calls[0][1]).toEqual(['signed-session-key', 1]);
  });
  it('commits failed attempts without clearing the lock', async () => {
    mocks.compare.mockResolvedValue(false);
    await expect(changeSessionSecurity(security(), 1, 'resume', '123456')).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(mocks.connection.commit).toHaveBeenCalled();
    expect(mocks.connection.execute.mock.calls.some(([sql]) => sql.includes('SET last_activity_at'))).toBe(false);
    expect(mocks.connection.execute.mock.calls.some(([sql]) => sql.includes('SET failed_pin_attempts = ?'))).toBe(true);
  });
  it('revokes the session on the third failed attempt', async () => {
    row.failed_pin_attempts = 2;
    mocks.compare.mockResolvedValue(false);
    await expect(changeSessionSecurity(security(), 1, 'resume', '123456')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', session: { phase: 'expired' } });
    expect(mocks.connection.commit).toHaveBeenCalled();
    expect(mocks.connection.execute.mock.calls.find(([sql]) => sql.includes('SET failed_pin_attempts = ?'))[1]).toEqual([3, true, 'signed-session-key']);
  });
  it('an expired session cannot be revived even with the correct code', async () => {
    row.last_activity_at = new Date(Date.now() - 86400000);
    await expect(changeSessionSecurity(security(), 1, 'resume', '123456')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.connection.commit).toHaveBeenCalled();
  });
  it('rechecks expiry after slow verification', async () => {
    const clock = vi.spyOn(Date, 'now');
    const now = Date.now();
    mocks.compare.mockImplementation(async () => { clock.mockReturnValue(now + 86400000); return true; });
    await expect(changeSessionSecurity(security(), 1, 'resume', '123456')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(mocks.connection.execute.mock.calls.some(([sql]) => sql.includes('SET last_activity_at'))).toBe(false);
    clock.mockRestore();
  });
  it('requires full login for a missing or locked Quick View passcode', async () => {
    mocks.connection.execute.mockImplementation(async sql => {
      if (sql.includes('SELECT * FROM auth_session_security')) return [[row]];
      if (sql.includes('SELECT * FROM user_quick_view_credentials')) return [[{ passcode_hash: null }]];
      return [{ affectedRows: 1 }];
    });
    await expect(changeSessionSecurity(security(), 1, 'resume', '123456')).rejects.toMatchObject({ code: 'PIN_NOT_SET' });
    expect(mocks.connection.rollback).toHaveBeenCalled();
  });
});
