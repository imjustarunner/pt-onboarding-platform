const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };
const metadata = (row) => typeof row?.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row?.metadata_json || {};

/** Pure ledger transition. All counters are read under the entitlement row lock.
 * Remaining/reserved include bonus credits; bonus counters are subsets, not extra capacity.
 */
export function planPackageUsage({ mode, remaining, reserved, status, history = [], consumeOn = 'reserve',
  freeMisses = 0, bonusRemaining = 0, bonusReserved = 0 }) {
  if (!['reserve', 'complete', 'forfeit', 'release', 'restore_missed'].includes(mode)) fail('Invalid package usage action');
  let a = Number(remaining), r = Number(reserved), f = Number(freeMisses), b = Number(bonusRemaining), br = Number(bonusReserved);
  if (![a, r, f, b, br].every((n) => Number.isSafeInteger(n) && n >= 0) || b > a || br > r) fail('Package balances need reconciliation');
  const last = history.at(-1);
  const missed = history.find((h) => ['SESSION_NOSHOW_FORFEIT', 'MISSED_FREE_MISS'].includes(h.reason_code));
  const restored = history.some((h) => h.reason_code === 'MISSED_WAIVER_RESTORE');
  let direction, reason, bucket = metadata(last).creditBucket || 'paid', quantity = 1;
  const finish = () => ({ remaining: a, reserved: r, freeMisses: f, bonusRemaining: b, bonusReserved: br,
    direction, reason, quantity, metadata: { creditBucket: bucket,
      before: { sessionsRemaining: Number(remaining) + Number(reserved), freeMissesRemaining: Number(freeMisses), bonusSessionsRemaining: Number(bonusRemaining) + Number(bonusReserved) },
      after: { sessionsRemaining: a + r, freeMissesRemaining: f, bonusSessionsRemaining: b + br } },
    status: status === 'CANCELLED' ? status : a <= 0 && r <= 0 ? 'EXHAUSTED' : 'ACTIVE' });
  if (mode === 'restore_missed') {
    if (restored) return null;
    if (!missed) fail('No missed-session debit exists to restore');
    bucket = missed.reason_code === 'MISSED_FREE_MISS' ? 'free_miss' : metadata(missed).creditBucket || 'paid';
    if (bucket === 'free_miss') { f += 1; quantity = 0; }
    else { a += 1; if (bucket === 'bonus') b += 1; }
    direction = 'CREDIT'; reason = 'MISSED_WAIVER_RESTORE';
    return finish();
  }
  if (missed && mode === 'reserve') fail('Book a new appointment after a missed-session outcome');
  if (missed && ['forfeit', 'complete', 'release'].includes(mode)) return null;
  const hasReservation = last?.direction === 'RESERVE';
  if (last?.direction === 'CONSUME') {
    if (['complete', 'forfeit', 'release'].includes(mode)) return null;
    fail('This appointment has already consumed its package session');
  }
  if (mode === 'reserve' && hasReservation) return null;
  if (mode === 'release' && !hasReservation) return null;
  if (mode !== 'release' && status !== 'ACTIVE') fail('Entitlement not available');
  const release = () => {
    if (r < 1 || (bucket === 'bonus' && br < 1)) fail('Package reservation balance needs reconciliation');
    r -= 1; a += 1;
    if (bucket === 'bonus') { br -= 1; b += 1; }
  };
  if (mode === 'reserve') {
    if (a < 1) fail('No sessions remaining on package');
    bucket = b > 0 ? 'bonus' : 'paid'; a -= 1; r += 1;
    if (bucket === 'bonus') { b -= 1; br += 1; }
    direction = 'RESERVE'; reason = 'BOOKING_RESERVE';
  } else if (mode === 'release') {
    release(); direction = 'RELEASE'; reason = 'BOOKING_RELEASE';
  } else if (mode === 'forfeit' && f > 0) {
    if (hasReservation) release();
    f -= 1; bucket = 'free_miss'; quantity = 0;
    direction = hasReservation ? 'RELEASE' : 'ADJUST'; reason = 'MISSED_FREE_MISS';
  } else {
    if (hasReservation) {
      if (r < 1 || (bucket === 'bonus' && br < 1)) fail('Package reservation balance needs reconciliation');
      r -= 1;
      if (bucket === 'bonus') br -= 1;
      else if (mode === 'forfeit' && b > 0) {
        // Retain the reserved paid credit and consume an available bonus credit.
        b -= 1; bucket = 'bonus';
      }
    } else {
      if (consumeOn !== 'complete') fail('This appointment has no reserved package session');
      if (a < 1) fail('No sessions remaining on package');
      bucket = b > 0 ? 'bonus' : 'paid'; a -= 1;
      if (bucket === 'bonus') b -= 1;
    }
    direction = 'CONSUME'; reason = mode === 'complete' ? 'SESSION_COMPLETE' : 'SESSION_NOSHOW_FORFEIT';
  }
  return finish();
}
