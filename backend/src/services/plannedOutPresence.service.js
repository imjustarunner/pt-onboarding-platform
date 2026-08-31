import PlannedOut, { isPlannedOutActiveNow } from '../models/PlannedOut.model.js';
import UserPresenceStatus from '../models/UserPresenceStatus.model.js';

export function availabilityBandFromPlannedOut(plannedOut) {
  const avail = String(plannedOut?.availability || 'unavailable').toLowerCase();
  // Available during a planned out → Away · reachable (yellow) with planned-out details.
  // Unavailable → red Unavailable even if they are logged in / heartbeating.
  return avail === 'available' ? 'away_reachable' : 'unavailable';
}

export function plannedOutStatusLabel(plannedOut) {
  const avail = String(plannedOut?.availability || 'unavailable').toLowerCase();
  return avail === 'available' ? 'Planned out · available' : 'Out for planned out';
}

/** Persist Team Board rich status to match an active planned out. */
export async function applyPlannedOutPresenceForUser(userId, plannedOut) {
  const uid = Number(userId || 0);
  if (!uid || !plannedOut) return null;
  const label = plannedOutStatusLabel(plannedOut);
  const avail = String(plannedOut.availability || 'unavailable').toLowerCase();
  const richStatus =
    plannedOut.span_type === 'half_day' && String(plannedOut.half_day_part || '').toLowerCase() === 'pm'
      ? 'out_pm'
      : plannedOut.span_type === 'half_day'
        ? 'out_am'
        : plannedOut.all_day
          ? 'out_full_day'
          : 'out_quick';
  try {
    return await UserPresenceStatus.upsertForUser(uid, {
      status: avail === 'available' ? 'in_available_for_phone' : richStatus,
      reason: 'out_day',
      display_label: label,
      note: avail === 'available' ? 'call_text' : null,
      expected_return_at: plannedOut.end_at || null,
      ends_at: plannedOut.end_at || null
    });
  } catch {
    return null;
  }
}

/**
 * Overlay approved planned outs onto presence rows (Team Board + chat directory).
 * Prefer unavailable planned outs over available ones when multiple overlap.
 * Always wins over login heartbeat / Active — planned out is the schedule source of truth.
 */
export function overlayPlannedOutsOnPresenceRows(rows, plannedOuts, now = new Date()) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(plannedOuts) || !plannedOuts.length) {
    return rows;
  }
  const at = now instanceof Date ? now : new Date(now);
  const activeByUser = new Map();
  for (const po of plannedOuts) {
    if (!isPlannedOutActiveNow(po, at)) continue;
    const uid = Number(po.user_id);
    if (!uid) continue;
    const existing = activeByUser.get(uid);
    const poUnavail = String(po.availability || '').toLowerCase() !== 'available';
    if (!existing) {
      activeByUser.set(uid, po);
      continue;
    }
    const existingUnavail = String(existing.availability || '').toLowerCase() !== 'available';
    if (poUnavail && !existingUnavail) activeByUser.set(uid, po);
  }
  if (!activeByUser.size) return rows;
  return rows.map((person) => {
    const uid = Number(person.id || person.user_id || 0);
    const po = activeByUser.get(uid);
    if (!po) return person;
    const band = availabilityBandFromPlannedOut(po);
    const label = plannedOutStatusLabel(po);
    return {
      ...person,
      availability_band: band,
      status_label: label,
      presence_display_label: label,
      planned_out_active: true,
      planned_out_id: po.id,
      planned_out_availability: String(po.availability || 'unavailable').toLowerCase()
    };
  });
}

/** Load active approved planned outs for an agency and overlay onto presence rows. */
export async function attachPlannedOutsToPresenceRows(rows, agencyId) {
  const list = Array.isArray(rows) ? rows : [];
  const aid = Number(agencyId || 0);
  if (!list.length || !aid) return list;
  try {
    if (!(await PlannedOut.tableExists())) return list;
    const plannedOuts = await PlannedOut.listActiveApprovedNowForAgency(aid);
    return overlayPlannedOutsOnPresenceRows(list, plannedOuts);
  } catch {
    return list;
  }
}
