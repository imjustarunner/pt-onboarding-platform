import { describe, expect, it } from 'vitest';
import { isNewerSession, localSessionState, phaseAt, sessionStorageKey } from '../sessionDeadline';

describe('shared session ordering', () => {
  it('ignores a late locked/expired response for activity preceding a successful unlock', () => {
    const resumed = { activityVersion: 2000, serverNow: 3000 };
    expect(isNewerSession({ activityVersion: 1000, serverNow: 4000, phase: 'timedown' }, resumed)).toBe(false);
    expect(isNewerSession({ activityVersion: 1000, serverNow: 4000, phase: 'expired' }, resumed)).toBe(false);
    expect(isNewerSession({ activityVersion: 2000, serverNow: 4000, phase: 'expired' }, resumed)).toBe(true);
  });
  it('translates clock skew without altering the activity ordering version', () => {
    const local = localSessionState({ activityVersion: 100, lastActivityAt: 100, lockAt: 200, expiresAt: 300, serverNow: 150, phase: 'active' }, 1150);
    expect(local).toMatchObject({ activityVersion: 100, lastActivityAt: 1100, lockAt: 1200, expiresAt: 1300 });
    expect(phaseAt(local, 1250)).toBe('timedown');
    expect(phaseAt(local, 1300)).toBe('expired');
  });
  it('isolates other users and fresh logins', () => {
    expect(sessionStorageKey(1, 'first')).not.toBe(sessionStorageKey(2, 'first'));
    expect(sessionStorageKey(1, 'first')).not.toBe(sessionStorageKey(1, 'second'));
  });
});
