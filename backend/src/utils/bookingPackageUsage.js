const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

/** Plan one appointment's ledger transition while its entitlement row is locked. */
export function planPackageUsage({ mode, remaining, reserved, status, history = [], consumeOn = 'reserve' }) {
  if (!['reserve', 'complete', 'forfeit', 'release'].includes(mode)) fail('Invalid package usage action');
  const last = history.at(-1);
  const consumed = last?.direction === 'CONSUME';
  const hasReservation = last?.direction === 'RESERVE';
  if (consumed) {
    if (mode === 'complete' || mode === 'forfeit') return null;
    if (mode === 'release') return null; // Refunds require a separate, explicit adjustment.
    fail('This appointment has already consumed its package session');
  }
  if (mode === 'reserve' && hasReservation) return null;
  if (mode === 'release' && !hasReservation) return null;
  if (mode !== 'release' && status !== 'ACTIVE') fail('Entitlement not available');
  let nextRemaining = Number(remaining);
  let nextReserved = Number(reserved);
  let direction;
  let reason;
  if (mode === 'reserve') {
    if (nextRemaining < 1) fail('No sessions remaining on package');
    nextRemaining -= 1;
    nextReserved += 1;
    direction = 'RESERVE';
    reason = 'BOOKING_RESERVE';
  } else if (mode === 'release') {
    if (nextReserved < 1) fail('Package reservation balance needs reconciliation');
    nextReserved -= 1;
    nextRemaining += 1;
    direction = 'RELEASE';
    reason = 'BOOKING_RELEASE';
  } else {
    if (hasReservation) {
      if (nextReserved < 1) fail('Package reservation balance needs reconciliation');
      nextReserved -= 1;
    } else {
      // Older consume-on-complete bookings did not create reservations.
      if (consumeOn !== 'complete') fail('This appointment has no reserved package session');
      if (nextRemaining < 1) fail('No sessions remaining on package');
      nextRemaining -= 1;
    }
    direction = 'CONSUME';
    reason = mode === 'complete' ? 'SESSION_COMPLETE' : 'SESSION_NOSHOW_FORFEIT';
  }
  return {
    remaining: nextRemaining, reserved: nextReserved, direction, reason,
    status: nextRemaining <= 0 && nextReserved <= 0 ? 'EXHAUSTED' : 'ACTIVE'
  };
}
