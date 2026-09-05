/**
 * When a Messages Hub recipient is outside Availability Hours or Planned Out,
 * delay outbound email until they are back and available.
 */
import PlannedOut, {
  isPlannedOutActiveNow,
  ymdFromStoredDate
} from '../models/PlannedOut.model.js';
import {
  resolveAvailabilitySchedule,
  isInsideSchedule,
  nextAvailableAt
} from './availabilityWindow.service.js';

function plannedOutEndsAt(po) {
  if (!po) return null;
  if (po.all_day) {
    const endYmd = ymdFromStoredDate(po.end_date);
    if (!endYmd) return null;
    // end_date is exclusive — they return at start of that calendar day (UTC morning proxy;
    // availability nextAvailableAt refines to their real work window).
    return new Date(`${endYmd}T06:00:00.000Z`);
  }
  const end = po.end_at ? new Date(po.end_at) : null;
  return end && !Number.isNaN(end.getTime()) ? end : null;
}

function formatReceiveWhen(date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * @returns {Promise<null|{
 *   availableNow: boolean,
 *   receiveAt: string|null,
 *   reason: string|null,
 *   message: string|null,
 *   plannedOut: boolean,
 *   outsideAvailability: boolean
 * }>}
 */
export async function resolveRecipientDeliveryGate({
  agencyId,
  userId,
  displayName,
  now = new Date()
} = {}) {
  const uid = Number(userId || 0);
  if (!uid) return null;

  const name = String(displayName || 'They').trim() || 'They';
  const reasons = [];
  let holdUntil = null;

  try {
    if (await PlannedOut.tableExists()) {
      const activeRows = await PlannedOut.listActiveApprovedNowForAgency(agencyId, {
        userId: uid,
        limit: 5
      });
      const po = (activeRows || []).find((row) => isPlannedOutActiveNow(row, now)) || activeRows?.[0];
      if (po) {
        const ends = plannedOutEndsAt(po);
        if (ends && ends > now) {
          holdUntil = ends;
          reasons.push('planned_out');
        }
      }
    }
  } catch (e) {
    console.warn('[hubRecipientDelivery] planned out:', e?.message || e);
  }

  let outsideAvailability = false;
  try {
    const schedule = await resolveAvailabilitySchedule(uid, { agencyId });
    const probe = holdUntil && holdUntil > now ? holdUntil : now;
    if (schedule.enabled) {
      if (!isInsideSchedule(schedule, probe)) {
        const next = nextAvailableAt(schedule, probe);
        if (!holdUntil || next > holdUntil) holdUntil = next;
        outsideAvailability = true;
        reasons.push('outside_availability');
      } else if (holdUntil) {
        const next = nextAvailableAt(schedule, holdUntil);
        if (next > holdUntil) {
          holdUntil = next;
          outsideAvailability = true;
          if (!reasons.includes('outside_availability')) reasons.push('outside_availability');
        }
      } else if (!isInsideSchedule(schedule, now)) {
        holdUntil = nextAvailableAt(schedule, now);
        outsideAvailability = true;
        reasons.push('outside_availability');
      }
    }
  } catch (e) {
    console.warn('[hubRecipientDelivery] availability:', e?.message || e);
  }

  if (!holdUntil || holdUntil.getTime() <= now.getTime() + 2000) {
    return {
      availableNow: true,
      receiveAt: null,
      reason: null,
      message: null,
      plannedOut: false,
      outsideAvailability: false
    };
  }

  const whenLabel = formatReceiveWhen(holdUntil);
  let message;
  if (reasons.includes('planned_out') && outsideAvailability) {
    message = `${name} is planned out and outside availability hours — they will receive this email ${whenLabel}.`;
  } else if (reasons.includes('planned_out')) {
    message = `${name} is planned out — they will receive this email ${whenLabel}.`;
  } else {
    message = `${name} is outside availability hours — they will receive this email ${whenLabel}.`;
  }

  return {
    availableNow: false,
    receiveAt: holdUntil.toISOString(),
    reason: reasons.join('+') || 'held',
    message,
    plannedOut: reasons.includes('planned_out'),
    outsideAvailability
  };
}

/**
 * Sender-side gate: when the actor is outside their own availability hours.
 * Used for "Send during next available time" (separate from recipient holds).
 */
export async function resolveSenderDeliveryGate({
  agencyId,
  userId,
  now = new Date()
} = {}) {
  const uid = Number(userId || 0);
  if (!uid) {
    return { availableNow: true, sendAt: null, message: null, outsideAvailability: false };
  }
  try {
    const schedule = await resolveAvailabilitySchedule(uid, { agencyId });
    if (!schedule.enabled || isInsideSchedule(schedule, now)) {
      return { availableNow: true, sendAt: null, message: null, outsideAvailability: false };
    }
    const next = nextAvailableAt(schedule, now);
    if (!next || next.getTime() <= now.getTime() + 2000) {
      return { availableNow: true, sendAt: null, message: null, outsideAvailability: false };
    }
    const whenLabel = formatReceiveWhen(next);
    return {
      availableNow: false,
      sendAt: next.toISOString(),
      message: `You're outside your availability hours. This will send during your next available time (${whenLabel}).`,
      outsideAvailability: true
    };
  } catch (e) {
    console.warn('[hubRecipientDelivery] sender gate:', e?.message || e);
    return { availableNow: true, sendAt: null, message: null, outsideAvailability: false };
  }
}

export async function findAgencyUserIdByEmail(agencyId, email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized || !agencyId) return null;
  const pool = (await import('../config/database.js')).default;
  try {
    const [rows] = await pool.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE LOWER(u.email) = ?
       LIMIT 1`,
      [agencyId, normalized]
    );
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}
