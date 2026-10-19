import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';

// Signup-only supervision uses the current occurrence, never a copied deadline
// from another date. Both boundaries are absolute instants, including across DST.
export function getSupervisionSignupWindow(session, now = new Date()) {
  const start = utcMysqlToIso(session?.start_at || session?.startAt);
  const startMs = start ? Date.parse(start) : NaN;
  const nowMs = +new Date(now);
  const valid = Number.isFinite(startMs) && Number.isFinite(nowMs);
  const opensMs = startMs - 24 * 3600000;
  const closesMs = startMs - 3600000;
  const cancelled = ['CANCELLED', 'CANCELED'].includes(String(session?.status || '').toUpperCase());
  const signupState = cancelled ? 'cancelled' : !valid ? 'closed'
    : nowMs < opensMs ? 'upcoming' : nowMs < closesMs ? 'open' : 'closed';
  return {
    signupOpensAt: valid ? new Date(opensMs).toISOString() : null,
    signupClosesAt: valid ? new Date(closesMs).toISOString() : null,
    signupOpen: signupState === 'open',
    signupState
  };
}
