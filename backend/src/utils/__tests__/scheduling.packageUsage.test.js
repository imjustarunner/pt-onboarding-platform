import { describe, it, expect } from 'vitest';
import { planPackageUsage } from '../bookingPackageUsage.js';

const plan = (overrides = {}) => planPackageUsage({ mode: 'reserve', remaining: 2, reserved: 0, status: 'ACTIVE', ...overrides });
describe('appointment package ledger transitions', () => {
  it('reserves capacity even for consume-on-complete packages', () => {
    expect(plan({ consumeOn: 'complete' })).toMatchObject({ remaining: 1, reserved: 1, direction: 'RESERVE' });
  });
  it('a repeated reservation cannot take another session', () => {
    expect(plan({ history: [{ direction: 'RESERVE' }] })).toBeNull();
  });
  it('completes only the reservation for this appointment', () => {
    expect(plan({ mode: 'complete', remaining: 1, reserved: 1, history: [{ direction: 'RESERVE' }] }))
      .toMatchObject({ remaining: 1, reserved: 0, direction: 'CONSUME' });
    expect(() => plan({ mode: 'complete', reserved: 2 })).toThrow('no reserved package session');
  });
  it('last-session retries are safe after exhaustion', () => {
    for (const mode of ['complete', 'forfeit', 'release']) {
      expect(plan({ mode, status: 'EXHAUSTED', remaining: 0, history: [{ direction: 'RESERVE' }, { direction: 'CONSUME' }] })).toBeNull();
    }
  });
  it('canceling another appointment cannot release this reservation', () => {
    expect(plan({ mode: 'release', reserved: 1 })).toBeNull();
  });
  it('cancel/rebook/retry uses the latest transition', () => {
    const history = [{ direction: 'RESERVE' }, { direction: 'RELEASE' }];
    expect(plan({ history })).toMatchObject({ remaining: 1, reserved: 1 });
    expect(plan({ mode: 'release', history, reserved: 1 })).toBeNull();
  });
  it('supports legacy complete-time packages without taking someone else’s reservation', () => {
    expect(plan({ mode: 'complete', consumeOn: 'complete', remaining: 2, reserved: 1 }))
      .toMatchObject({ remaining: 1, reserved: 1 });
  });
  it('blocks exhausted and inconsistent balances', () => {
    expect(() => plan({ remaining: 0 })).toThrow('No sessions remaining');
    expect(() => plan({ mode: 'complete', reserved: 0, history: [{ direction: 'RESERVE' }] })).toThrow('reconciliation');
  });
});
