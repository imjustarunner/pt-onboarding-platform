/**
 * Feature billing service.
 *
 * Computes pro-rated charges for tenant- and user-level feature entitlements
 * for a given billing period. Walks the event log and clips enable intervals
 * to the period to produce exact day counts, applies a minimum-days floor per
 * enable cycle, and returns structured line-item data ready for invoices.
 */

import pool from '../config/database.js';
import { getFeatureCatalog } from './billingPricing.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDayUTC(date) {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetween(startMs, endMs) {
  const start = startOfDayUTC(new Date(startMs));
  const end = startOfDayUTC(new Date(endMs));
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
}

/**
 * Reduce a list of (effective_at, event_type) events into [enabledStart, enabledEnd] intervals
 * clipped to [periodStartMs, periodEndMs).
 */
function reconstructIntervals(events, periodStartMs, periodEndMs) {
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.effective_at).getTime();
    const tb = new Date(b.effective_at).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });

  let stateBeforePeriod = false;
  for (const ev of sorted) {
    const t = new Date(ev.effective_at).getTime();
    if (t >= periodStartMs) break;
    stateBeforePeriod = ev.event_type === 'enabled';
  }

  const intervals = [];
  let openStart = stateBeforePeriod ? periodStartMs : null;

  for (const ev of sorted) {
    const t = new Date(ev.effective_at).getTime();
    if (t < periodStartMs) continue;
    if (t >= periodEndMs) break;
    if (ev.event_type === 'enabled') {
      if (openStart == null) openStart = t;
    } else {
      if (openStart != null) {
        intervals.push([openStart, t]);
        openStart = null;
      }
    }
  }

  if (openStart != null) {
    intervals.push([openStart, periodEndMs]);
  }

  return intervals;
}

function intervalsToEnabledDays(intervals) {
  let total = 0;
  for (const [s, e] of intervals) {
    total += daysBetween(s, e);
  }
  return total;
}

function intervalsCount(intervals) {
  return intervals.length;
}

function applyProrationFloor({ enabledDays, intervals, minProrationDays, daysInPeriod }) {
  if (enabledDays <= 0) return 0;
  const floor = Math.min(Math.max(0, Number(minProrationDays || 0)), daysInPeriod);
  if (floor <= 0) return enabledDays;
  const cycleCount = intervalsCount(intervals);
  const minRequired = floor * cycleCount;
  return Math.min(daysInPeriod, Math.max(enabledDays, minRequired));
}

function chargeFromBillableDays({ unitMonthlyCents, billableDays, daysInPeriod }) {
  if (!unitMonthlyCents || !billableDays || !daysInPeriod) return 0;
  return Math.round((Number(unitMonthlyCents) * Number(billableDays)) / Number(daysInPeriod));
}

async function fetchTenantEvents(agencyId, periodEndMs) {
  const [rows] = await pool.execute(
    `SELECT id, feature_key, event_type, effective_at
       FROM agency_feature_entitlement_events
      WHERE agency_id = ? AND effective_at < ?
      ORDER BY effective_at ASC, id ASC`,
    [agencyId, new Date(periodEndMs)]
  );
  return rows;
}

async function fetchUserEvents(agencyId, periodEndMs) {
  const [rows] = await pool.execute(
    `SELECT id, user_id, feature_key, event_type, effective_at
       FROM user_feature_entitlement_events
      WHERE agency_id = ? AND effective_at < ?
      ORDER BY effective_at ASC, id ASC`,
    [agencyId, new Date(periodEndMs)]
  );
  return rows;
}

async function fetchUserNames(userIds) {
  if (!userIds.length) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, email FROM users WHERE id IN (${placeholders})`,
    userIds
  );
  const map = new Map();
  for (const r of rows) {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
    map.set(Number(r.id), { id: Number(r.id), name: name || r.email || `User ${r.id}`, email: r.email || null });
  }
  return map;
}

async function fetchLastTenantEventMeta(agencyId, featureKey) {
  const [rows] = await pool.execute(
    `SELECT e.id, e.effective_at, e.event_type, e.actor_user_id, e.actor_role,
            u.first_name, u.last_name, u.email
       FROM agency_feature_entitlement_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.agency_id = ? AND e.feature_key = ?
      ORDER BY e.effective_at DESC, e.id DESC
      LIMIT 1`,
    [agencyId, featureKey]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return {
    eventId: Number(r.id),
    effectiveAt: r.effective_at,
    eventType: r.event_type,
    actorUserId: r.actor_user_id || null,
    actorRole: r.actor_role || null,
    actorName: name || r.email || (r.actor_user_id ? `User ${r.actor_user_id}` : 'system')
  };
}

async function fetchLastUserEventMeta(agencyId, userId, featureKey) {
  const [rows] = await pool.execute(
    `SELECT e.id, e.effective_at, e.event_type, e.actor_user_id, e.actor_role,
            u.first_name, u.last_name, u.email
       FROM user_feature_entitlement_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.agency_id = ? AND e.user_id = ? AND e.feature_key = ?
      ORDER BY e.effective_at DESC, e.id DESC
      LIMIT 1`,
    [agencyId, userId, featureKey]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return {
    eventId: Number(r.id),
    effectiveAt: r.effective_at,
    eventType: r.event_type,
    actorUserId: r.actor_user_id || null,
    actorRole: r.actor_role || null,
    actorName: name || r.email || (r.actor_user_id ? `User ${r.actor_user_id}` : 'system')
  };
}

/**
 * Compute pro-rated billing portions for a tenant over a billing period.
 *
 * @param {number} agencyId
 * @param {Date|string} periodStart inclusive
 * @param {Date|string} periodEnd exclusive
 * @param {object} pricingConfig effective pricing JSON (with featureCatalog)
 * @returns {Promise<{ daysInPeriod, tenantPortions, userPortions, totals }>}
 */
export async function computeFeatureBillingForPeriod(agencyId, periodStart, periodEnd, pricingConfig) {
  const aid = Number(agencyId);
  if (!aid) throw new Error('agencyId is required');

  const periodStartMs = new Date(periodStart).getTime();
  const periodEndMs = new Date(periodEnd).getTime();
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs) || periodEndMs <= periodStartMs) {
    throw new Error('Invalid billing period');
  }
  const daysInPeriod = daysBetween(periodStartMs, periodEndMs);

  const featureCatalog = getFeatureCatalog(pricingConfig);

  const [tenantEvents, userEvents] = await Promise.all([
    fetchTenantEvents(aid, periodEndMs),
    fetchUserEvents(aid, periodEndMs)
  ]);

  const tenantByFeature = new Map();
  for (const ev of tenantEvents) {
    if (!tenantByFeature.has(ev.feature_key)) tenantByFeature.set(ev.feature_key, []);
    tenantByFeature.get(ev.feature_key).push(ev);
  }

  const userByFeatureUser = new Map();
  for (const ev of userEvents) {
    const k = `${ev.feature_key}::${ev.user_id}`;
    if (!userByFeatureUser.has(k)) userByFeatureUser.set(k, []);
    userByFeatureUser.get(k).push(ev);
  }

  const userIds = Array.from(new Set(userEvents.map((e) => Number(e.user_id))));
  const userNameMap = await fetchUserNames(userIds);

  const tenantPortions = [];
  const userPortions = [];

  const featureKeys = new Set([
    ...Object.keys(featureCatalog),
    ...tenantByFeature.keys(),
    ...userEvents.map((e) => e.feature_key)
  ]);

  for (const featureKey of featureKeys) {
    const feature = featureCatalog[featureKey] || {
      key: featureKey,
      label: featureKey,
      tenantMonthlyCents: 0,
      userMonthlyCents: 0,
      minProrationDays: 7,
      perUserBillable: false
    };

    const tenantUnit = Math.max(0, Number(feature.tenantMonthlyCents || 0));
    const userUnit = Math.max(0, Number(feature.userMonthlyCents || 0));
    const minDays = Math.max(0, Number(feature.minProrationDays || 0));

    if (tenantByFeature.has(featureKey)) {
      const intervals = reconstructIntervals(tenantByFeature.get(featureKey), periodStartMs, periodEndMs);
      const enabledDays = intervalsToEnabledDays(intervals);
      const billableDays = applyProrationFloor({ enabledDays, intervals, minProrationDays: minDays, daysInPeriod });
      const chargeCents = chargeFromBillableDays({ unitMonthlyCents: tenantUnit, billableDays, daysInPeriod });
      if (enabledDays > 0 || tenantUnit > 0) {
        const lastMeta = await fetchLastTenantEventMeta(aid, featureKey);
        tenantPortions.push({
          featureKey,
          featureLabel: feature.label,
          enabledDays,
          billableDays,
          daysInPeriod,
          unitMonthlyCents: tenantUnit,
          chargeCents,
          cycleCount: intervalsCount(intervals),
          lastEventId: lastMeta?.eventId || null,
          lastEventType: lastMeta?.eventType || null,
          lastEffectiveAt: lastMeta?.effectiveAt || null,
          lastActorUserId: lastMeta?.actorUserId || null,
          lastActorRole: lastMeta?.actorRole || null,
          lastActorName: lastMeta?.actorName || null
        });
      }
    }

    if (userUnit > 0) {
      for (const [k, evs] of userByFeatureUser.entries()) {
        if (!k.startsWith(`${featureKey}::`)) continue;
        const userId = Number(k.slice(featureKey.length + 2));
        const intervals = reconstructIntervals(evs, periodStartMs, periodEndMs);
        const enabledDays = intervalsToEnabledDays(intervals);
        if (enabledDays === 0) continue;
        const billableDays = applyProrationFloor({ enabledDays, intervals, minProrationDays: minDays, daysInPeriod });
        const chargeCents = chargeFromBillableDays({ unitMonthlyCents: userUnit, billableDays, daysInPeriod });
        const lastMeta = await fetchLastUserEventMeta(aid, userId, featureKey);
        const userInfo = userNameMap.get(userId) || { id: userId, name: `User ${userId}`, email: null };
        userPortions.push({
          featureKey,
          featureLabel: feature.label,
          userId,
          userName: userInfo.name,
          userEmail: userInfo.email,
          enabledDays,
          billableDays,
          daysInPeriod,
          unitMonthlyCents: userUnit,
          chargeCents,
          cycleCount: intervalsCount(intervals),
          lastEventId: lastMeta?.eventId || null,
          lastEventType: lastMeta?.eventType || null,
          lastEffectiveAt: lastMeta?.effectiveAt || null,
          lastActorUserId: lastMeta?.actorUserId || null,
          lastActorRole: lastMeta?.actorRole || null,
          lastActorName: lastMeta?.actorName || null
        });
      }
    }
  }

  tenantPortions.sort((a, b) => a.featureLabel.localeCompare(b.featureLabel));
  userPortions.sort((a, b) => {
    if (a.featureLabel !== b.featureLabel) return a.featureLabel.localeCompare(b.featureLabel);
    return a.userName.localeCompare(b.userName);
  });

  const tenantTotalCents = tenantPortions.reduce((s, p) => s + Number(p.chargeCents || 0), 0);
  const userTotalCents = userPortions.reduce((s, p) => s + Number(p.chargeCents || 0), 0);

  return {
    daysInPeriod,
    tenantPortions,
    userPortions,
    totals: {
      tenantTotalCents,
      userTotalCents,
      featureTotalCents: tenantTotalCents + userTotalCents
    }
  };
}

export default { computeFeatureBillingForPeriod };
