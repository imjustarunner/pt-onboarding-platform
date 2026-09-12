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

describe('missed-session credit hierarchy and reversal', () => {
  const reservedPaid = [{ direction: 'RESERVE', metadata_json: { creditBucket: 'paid' } }];
  it('uses a free miss and releases the paid reservation', () => {
    expect(plan({ mode: 'forfeit', remaining: 4, reserved: 1, freeMisses: 1, bonusRemaining: 2, history: reservedPaid }))
      .toMatchObject({ remaining: 5, reserved: 0, freeMisses: 0, bonusRemaining: 2, reason: 'MISSED_FREE_MISS', metadata: { creditBucket: 'free_miss' } });
  });
  it('returns a reserved bonus credit when a free miss is available', () => {
    expect(plan({ mode: 'forfeit', reserved: 1, freeMisses: 1, bonusReserved: 1,
      history: [{ direction: 'RESERVE', metadata_json: { creditBucket: 'bonus' } }] }))
      .toMatchObject({ remaining: 3, reserved: 0, bonusRemaining: 1, bonusReserved: 0, freeMisses: 0 });
  });
  it('uses an available bonus credit before the reserved paid credit', () => {
    expect(plan({ mode: 'forfeit', remaining: 4, reserved: 1, bonusRemaining: 1, history: reservedPaid }))
      .toMatchObject({ remaining: 4, reserved: 0, bonusRemaining: 0, metadata: { creditBucket: 'bonus' } });
  });
  it('does not take a bonus credit reserved for another appointment', () => {
    expect(plan({ mode: 'forfeit', reserved: 2, bonusReserved: 1, history: reservedPaid }))
      .toMatchObject({ reserved: 1, bonusReserved: 1, metadata: { creditBucket: 'paid' } });
  });
  it.each(['free_miss', 'bonus', 'paid'])('restores exactly the %s bucket once', (bucket) => {
    const history = [{ direction: 'CONSUME', reason_code: bucket === 'free_miss' ? 'MISSED_FREE_MISS' : 'SESSION_NOSHOW_FORFEIT', metadata_json: { creditBucket: bucket } }];
    const result = plan({ mode: 'restore_missed', remaining: 0, status: 'EXHAUSTED', history });
    expect(result).toMatchObject({ remaining: bucket === 'free_miss' ? 0 : 1, freeMisses: bucket === 'free_miss' ? 1 : 0,
      bonusRemaining: bucket === 'bonus' ? 1 : 0, metadata: { creditBucket: bucket } });
    history.push({ direction: result.direction, reason_code: result.reason, metadata_json: result.metadata });
    expect(plan({ mode: 'restore_missed', history })).toBeNull();
    expect(plan({ mode: 'forfeit', history })).toBeNull();
  });
  it('does not allow a completed session debit to be refunded as a missed appointment', () => {
    expect(() => plan({ mode: 'restore_missed', history: [{ direction: 'CONSUME', reason_code: 'SESSION_COMPLETE' }] })).toThrow('No missed-session debit');
  });
  it('makes repeated free misses idempotent', () => {
    expect(plan({ mode: 'forfeit', freeMisses: 2, history: [{ direction: 'RELEASE', reason_code: 'MISSED_FREE_MISS' }] })).toBeNull();
  });
});
