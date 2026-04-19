/**
 * Feature entitlement service.
 *
 * Source of truth for tenant- and user-level feature enablement.
 * - Every transition writes an immutable row to *_feature_entitlement_events.
 * - The current-state denorm tables are upserted in the same transaction.
 * - Reads consult the denorm; lazy-seeds an "enabled" event when legacy state
 *   indicates a feature was already on but no event has been recorded yet.
 *
 * Billing reads the event log directly (see featureBilling.service.js).
 */

import pool from '../config/database.js';

function normalizeFeatureKey(raw) {
  const key = String(raw || '').trim();
  if (!key) {
    const err = new Error('featureKey is required');
    err.status = 400;
    throw err;
  }
  if (!/^[A-Za-z0-9_]+$/.test(key)) {
    const err = new Error(`Invalid featureKey: ${key}`);
    err.status = 400;
    throw err;
  }
  return key;
}

function actorMeta(actor) {
  const userId = Number(actor?.id || actor?.userId || 0) || null;
  const role = actor?.role ? String(actor.role) : null;
  return { actorUserId: userId, actorRole: role };
}

async function insertTenantEvent(conn, { agencyId, featureKey, eventType, actor, effectiveAt = null, notes = null }) {
  const { actorUserId, actorRole } = actorMeta(actor);
  const [res] = await conn.execute(
    `INSERT INTO agency_feature_entitlement_events
       (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
    [agencyId, featureKey, eventType, actorUserId, actorRole, effectiveAt, notes]
  );
  return res.insertId;
}

async function insertUserEvent(conn, { agencyId, userId, featureKey, eventType, actor, effectiveAt = null, notes = null }) {
  const { actorUserId, actorRole } = actorMeta(actor);
  const [res] = await conn.execute(
    `INSERT INTO user_feature_entitlement_events
       (agency_id, user_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
    [agencyId, userId, featureKey, eventType, actorUserId, actorRole, effectiveAt, notes]
  );
  return res.insertId;
}

async function upsertTenantCurrent(conn, { agencyId, featureKey, enabled, lastEventId }) {
  await conn.execute(
    `INSERT INTO agency_feature_entitlements_current (agency_id, feature_key, enabled, last_event_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       last_event_id = VALUES(last_event_id),
       updated_at = CURRENT_TIMESTAMP`,
    [agencyId, featureKey, enabled ? 1 : 0, lastEventId]
  );
}

async function upsertUserCurrent(conn, { userId, featureKey, agencyId, enabled, lastEventId }) {
  await conn.execute(
    `INSERT INTO user_feature_entitlements_current (user_id, feature_key, agency_id, enabled, last_event_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       agency_id = VALUES(agency_id),
       last_event_id = VALUES(last_event_id),
       updated_at = CURRENT_TIMESTAMP`,
    [userId, featureKey, agencyId, enabled ? 1 : 0, lastEventId]
  );
}

async function setTenantState(agencyId, featureKey, enabled, { actor = null, effectiveAt = null, notes = null } = {}) {
  const id = Number(agencyId);
  if (!id || Number.isNaN(id)) throw new Error('agencyId is required');
  const key = normalizeFeatureKey(featureKey);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const eventId = await insertTenantEvent(conn, {
      agencyId: id,
      featureKey: key,
      eventType: enabled ? 'enabled' : 'disabled',
      actor,
      effectiveAt,
      notes
    });
    await upsertTenantCurrent(conn, {
      agencyId: id,
      featureKey: key,
      enabled,
      lastEventId: eventId
    });
    await conn.commit();
    return { eventId, agencyId: id, featureKey: key, enabled: !!enabled };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function setUserState(agencyId, userId, featureKey, enabled, { actor = null, effectiveAt = null, notes = null } = {}) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  if (!aid || !uid) throw new Error('agencyId and userId are required');
  const key = normalizeFeatureKey(featureKey);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const eventId = await insertUserEvent(conn, {
      agencyId: aid,
      userId: uid,
      featureKey: key,
      eventType: enabled ? 'enabled' : 'disabled',
      actor,
      effectiveAt,
      notes
    });
    await upsertUserCurrent(conn, {
      userId: uid,
      featureKey: key,
      agencyId: aid,
      enabled,
      lastEventId: eventId
    });
    await conn.commit();
    return { eventId, userId: uid, agencyId: aid, featureKey: key, enabled: !!enabled };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

export async function enableTenantFeature(agencyId, featureKey, opts = {}) {
  return setTenantState(agencyId, featureKey, true, opts);
}

export async function disableTenantFeature(agencyId, featureKey, opts = {}) {
  return setTenantState(agencyId, featureKey, false, opts);
}

export async function enableUserFeature(agencyId, userId, featureKey, opts = {}) {
  return setUserState(agencyId, userId, featureKey, true, opts);
}

export async function disableUserFeature(agencyId, userId, featureKey, opts = {}) {
  return setUserState(agencyId, userId, featureKey, false, opts);
}

/**
 * Idempotent version of setTenantState that only writes an event when the
 * desired state differs from the current denorm value. Use this to mirror
 * legacy JSON/column updates without flooding the event log.
 */
export async function syncTenantState(agencyId, featureKey, enabled, opts = {}) {
  const id = Number(agencyId);
  if (!id) return null;
  const key = normalizeFeatureKey(featureKey);
  const [rows] = await pool.execute(
    'SELECT enabled FROM agency_feature_entitlements_current WHERE agency_id = ? AND feature_key = ? LIMIT 1',
    [id, key]
  );
  const currentEnabled = rows.length > 0 ? rows[0].enabled === 1 : null;
  const desired = !!enabled;
  if (currentEnabled === desired) return null;
  return setTenantState(id, key, desired, opts);
}

export async function syncUserState(agencyId, userId, featureKey, enabled, opts = {}) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  if (!aid || !uid) return null;
  const key = normalizeFeatureKey(featureKey);
  const [rows] = await pool.execute(
    'SELECT enabled FROM user_feature_entitlements_current WHERE user_id = ? AND feature_key = ? LIMIT 1',
    [uid, key]
  );
  const currentEnabled = rows.length > 0 ? rows[0].enabled === 1 : null;
  const desired = !!enabled;
  if (currentEnabled === desired) return null;
  return setUserState(aid, uid, key, desired, opts);
}

export async function getTenantFeatureCurrent(agencyId, featureKey) {
  const key = normalizeFeatureKey(featureKey);
  const [rows] = await pool.execute(
    `SELECT c.enabled, c.last_event_id, c.updated_at,
            e.actor_user_id AS last_actor_user_id, e.actor_role AS last_actor_role,
            e.effective_at AS last_effective_at, e.event_type AS last_event_type
       FROM agency_feature_entitlements_current c
       LEFT JOIN agency_feature_entitlement_events e ON e.id = c.last_event_id
      WHERE c.agency_id = ? AND c.feature_key = ?
      LIMIT 1`,
    [agencyId, key]
  );
  if (rows.length === 0) return { enabled: false, present: false };
  const row = rows[0];
  return {
    present: true,
    enabled: row.enabled === 1,
    lastEventId: row.last_event_id,
    lastActorUserId: row.last_actor_user_id,
    lastActorRole: row.last_actor_role,
    lastEffectiveAt: row.last_effective_at,
    lastEventType: row.last_event_type,
    updatedAt: row.updated_at
  };
}

export async function listTenantFeatures(agencyId) {
  const [rows] = await pool.execute(
    `SELECT feature_key, enabled, last_event_id, updated_at
       FROM agency_feature_entitlements_current
      WHERE agency_id = ?`,
    [agencyId]
  );
  return rows.map((r) => ({
    featureKey: r.feature_key,
    enabled: r.enabled === 1,
    lastEventId: r.last_event_id,
    updatedAt: r.updated_at
  }));
}

export async function listEntitledUsers(agencyId, featureKey) {
  const key = normalizeFeatureKey(featureKey);
  const [rows] = await pool.execute(
    `SELECT c.user_id, c.enabled, c.last_event_id, c.updated_at,
            u.first_name, u.last_name, u.email
       FROM user_feature_entitlements_current c
       INNER JOIN users u ON u.id = c.user_id
      WHERE c.agency_id = ? AND c.feature_key = ? AND c.enabled = 1
      ORDER BY u.last_name, u.first_name`,
    [agencyId, key]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    enabled: r.enabled === 1,
    lastEventId: r.last_event_id,
    updatedAt: r.updated_at,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email
  }));
}

/**
 * Tenant-scoped roster of users who are *eligible* to be entitled to a per-user
 * feature for an agency. Returns only users affiliated with the agency through
 * `user_agencies`, excluding non-staff roles (client_guardian, school_staff) and
 * archived/inactive accounts. The returned shape mirrors `listEntitledUsers` so
 * the caller can merge entitlement state by `id`.
 */
export async function listEligibleTenantUsers(agencyId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ?
        AND COALESCE(LOWER(u.role), '') NOT IN ('client_guardian', 'school_staff')
        AND COALESCE(u.status, 'active') NOT IN ('archived', 'terminated')
      GROUP BY u.id
      ORDER BY u.last_name, u.first_name`,
    [agencyId]
  );
  return rows.map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    role: r.role,
    status: r.status
  }));
}

export async function getUserFeatureCurrent(userId, featureKey) {
  const key = normalizeFeatureKey(featureKey);
  const [rows] = await pool.execute(
    `SELECT enabled, agency_id, last_event_id, updated_at
       FROM user_feature_entitlements_current
      WHERE user_id = ? AND feature_key = ?
      LIMIT 1`,
    [userId, key]
  );
  if (rows.length === 0) return { enabled: false, present: false };
  const row = rows[0];
  return {
    present: true,
    enabled: row.enabled === 1,
    agencyId: row.agency_id,
    lastEventId: row.last_event_id,
    updatedAt: row.updated_at
  };
}

/** Returns all current per-feature entitlement rows for a user, keyed by featureKey. */
export async function listUserFeatures(userId, { agencyId = null } = {}) {
  const params = [userId];
  let where = 'user_id = ?';
  if (agencyId) { where += ' AND agency_id = ?'; params.push(agencyId); }
  const [rows] = await pool.execute(
    `SELECT feature_key, enabled, agency_id, last_event_id, updated_at
       FROM user_feature_entitlements_current
      WHERE ${where}`,
    params
  );
  const out = {};
  for (const r of rows) {
    out[r.feature_key] = {
      enabled: r.enabled === 1,
      agencyId: r.agency_id,
      lastEventId: r.last_event_id,
      updatedAt: r.updated_at
    };
  }
  return out;
}

export async function listTenantEvents(agencyId, { featureKey = null, limit = 100, offset = 0 } = {}) {
  const params = [agencyId];
  let where = 'agency_id = ?';
  if (featureKey) {
    where += ' AND feature_key = ?';
    params.push(normalizeFeatureKey(featureKey));
  }
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const [rows] = await pool.execute(
    `SELECT e.id, e.agency_id, e.feature_key, e.event_type, e.actor_user_id, e.actor_role,
            e.effective_at, e.notes, e.created_at,
            u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.email AS actor_email
       FROM agency_feature_entitlement_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE ${where}
      ORDER BY e.effective_at DESC, e.id DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

export async function listUserEvents({ agencyId = null, featureKey = null, userId = null, actorUserId = null, limit = 100, offset = 0 } = {}) {
  const params = [];
  const wheres = [];
  if (agencyId) {
    wheres.push('e.agency_id = ?');
    params.push(agencyId);
  }
  if (featureKey) {
    wheres.push('e.feature_key = ?');
    params.push(normalizeFeatureKey(featureKey));
  }
  if (userId) {
    wheres.push('e.user_id = ?');
    params.push(userId);
  }
  if (actorUserId) {
    wheres.push('e.actor_user_id = ?');
    params.push(actorUserId);
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const [rows] = await pool.execute(
    `SELECT e.id, e.agency_id, e.user_id, e.feature_key, e.event_type, e.actor_user_id, e.actor_role,
            e.effective_at, e.notes, e.created_at,
            tu.first_name AS target_first_name, tu.last_name AS target_last_name, tu.email AS target_email,
            au.first_name AS actor_first_name, au.last_name AS actor_last_name, au.email AS actor_email
       FROM user_feature_entitlement_events e
       LEFT JOIN users tu ON tu.id = e.user_id
       LEFT JOIN users au ON au.id = e.actor_user_id
       ${where}
      ORDER BY e.effective_at DESC, e.id DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

/**
 * Lazy-seed: if a tenant or user has a legacy "on" state but no event row,
 * insert a system "enabled" event at NOW() so day counters can start tracking.
 * Safe to call repeatedly; no-op if state already present.
 */
export async function lazySeedTenantIfMissing(agencyId, featureKey, legacyEnabled) {
  if (!legacyEnabled) return null;
  const cur = await getTenantFeatureCurrent(agencyId, featureKey);
  if (cur.present) return null;
  return setTenantState(agencyId, featureKey, true, {
    actor: null,
    notes: 'Lazy-seeded from legacy tenant state'
  });
}

export async function lazySeedUserIfMissing(agencyId, userId, featureKey, legacyEnabled) {
  if (!legacyEnabled) return null;
  const cur = await getUserFeatureCurrent(userId, featureKey);
  if (cur.present) return null;
  return setUserState(agencyId, userId, featureKey, true, {
    actor: null,
    notes: 'Lazy-seeded from legacy user state'
  });
}

export default {
  enableTenantFeature,
  disableTenantFeature,
  enableUserFeature,
  disableUserFeature,
  syncTenantState,
  syncUserState,
  getTenantFeatureCurrent,
  listTenantFeatures,
  listEntitledUsers,
  getUserFeatureCurrent,
  listTenantEvents,
  listUserEvents,
  lazySeedTenantIfMissing,
  lazySeedUserIfMissing
};
