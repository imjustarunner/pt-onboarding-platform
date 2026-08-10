import PlannedOut, { isPlannedOutActiveNow } from '../models/PlannedOut.model.js';

export function availabilityBandFromPlannedOut(plannedOut) {
  const avail = String(plannedOut?.availability || 'unavailable').toLowerCase();
  return avail === 'available' ? 'away_reachable' : 'unavailable';
}

export function plannedOutStatusLabel(plannedOut) {
  const avail = String(plannedOut?.availability || 'unavailable').toLowerCase();
  return avail === 'available' ? 'Planned out · available' : 'Out for planned out';
}

/**
 * Overlay approved planned outs onto presence rows (Team Board + chat directory).
 * Prefer unavailable planned outs over available ones when multiple overlap.
 */
export function overlayPlannedOutsOnPresenceRows(rows, plannedOuts) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(plannedOuts) || !plannedOuts.length) {
    return rows;
  }
  const now = new Date();
  const activeByUser = new Map();
  for (const po of plannedOuts) {
    if (!isPlannedOutActiveNow(po, now)) continue;
    const uid = Number(po.user_id);
    if (!uid) continue;
    const existing = activeByUser.get(uid);
    if (!existing || String(po.availability || '').toLowerCase() !== 'available') {
      activeByUser.set(uid, po);
    }
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
      planned_out_id: po.id
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
