/**
 * Quick View credentials + scoped sessions.
 * - Persistent URL token: SHA-256 hash only; raw shown once on create/regen
 * - 6-digit passcode: bcrypt; never reveal existing; reset shows new value once
 * - Session: 10 min inactivity; meeting extend to end+10min
 * - Passcode lockout: 3 failed guesses → locked until passcode reset (login required)
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';

const TOKEN_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MEETING_GRACE_MS = 10 * 60 * 1000;
const MAX_PASSCODE_ATTEMPTS = 3;
/** Far-future lock: cleared only by resetPasscode (not auto-expiry). */
const LOCK_UNTIL_RESET = '2099-12-31 23:59:59';
const BCRYPT_ROUNDS = 10;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function randomSession() {
  return crypto.randomBytes(SESSION_BYTES).toString('hex');
}

function isPasscodeLocked(cred) {
  if (!cred) return false;
  if (Number(cred.failed_passcode_attempts || 0) >= MAX_PASSCODE_ATTEMPTS) return true;
  if (cred.passcode_locked_until && new Date(cred.passcode_locked_until) > new Date()) return true;
  return false;
}

async function notifyQuickViewEvent({
  userId,
  agencyId,
  type,
  title,
  message,
  severity = 'info'
}) {
  try {
    const Notification = (await import('../models/Notification.model.js')).default;
    await Notification.create({
      type,
      severity,
      title,
      message,
      userId,
      agencyId: agencyId || null,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'System'
    });
  } catch (e) {
    console.warn('[quickViewAuth] notification failed:', e?.message || e);
  }
}

async function ensureRow(userId, agencyId = null) {
  await pool.execute(
    `INSERT INTO user_quick_view_credentials (user_id, agency_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE agency_id = COALESCE(VALUES(agency_id), agency_id)`,
    [userId, agencyId]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM user_quick_view_credentials WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

export async function getCredentialStatus(userId) {
  const [rows] = await pool.execute(
    `SELECT token_version, token_issued_at, token_revoked_at, token_raw,
            passcode_version, passcode_set_at, passcode_locked_until,
            failed_passcode_attempts, last_token_used_at, last_passcode_ok_at,
            agency_id
     FROM user_quick_view_credentials WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const row = rows?.[0];
  return {
    hasToken: !!(row?.token_version && row?.token_issued_at && !row?.token_revoked_at),
    hasPasscode: !!(row?.passcode_version && row?.passcode_set_at),
    /** True when a stored raw token can be revealed without regenerating. */
    canRevealToken: !!(row?.token_raw && row?.token_issued_at && !row?.token_revoked_at),
    tokenVersion: Number(row?.token_version || 0),
    passcodeVersion: Number(row?.passcode_version || 0),
    lockedUntil: row?.passcode_locked_until || null,
    isLocked: isPasscodeLocked(row),
    failedAttempts: Number(row?.failed_passcode_attempts || 0),
    maxAttempts: MAX_PASSCODE_ATTEMPTS,
    lastTokenUsedAt: row?.last_token_used_at || null,
    lastPasscodeOkAt: row?.last_passcode_ok_at || null,
    agencyId: row?.agency_id || null
  };
}

/**
 * Return the persistent Quick View URL for the owner after identity confirm.
 * Does not rotate the token. Tokens created before token_raw existed cannot be revealed.
 */
export async function revealToken({ userId }) {
  const [rows] = await pool.execute(
    `SELECT token_raw, token_version, token_revoked_at, token_issued_at
     FROM user_quick_view_credentials WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const row = rows?.[0];
  if (!row?.token_raw || row.token_revoked_at || !row.token_issued_at) {
    return { ok: false, error: 'not_revealable' };
  }
  return {
    ok: true,
    token: row.token_raw,
    tokenVersion: Number(row.token_version || 0)
  };
}

export async function regenerateToken({ userId, agencyId = null, actorUserId = null, ipHash = null, userAgent = null }) {
  const raw = randomToken();
  const hash = sha256(raw);
  await ensureRow(userId, agencyId);
  await pool.execute(
    `UPDATE user_quick_view_credentials
     SET token_hash = ?,
         token_raw = ?,
         token_version = token_version + 1,
         token_issued_at = CURRENT_TIMESTAMP,
         token_revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [hash, raw, userId]
  );
  // Revoke active sessions for this user
  await pool.execute(
    `UPDATE quick_view_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  await logAccessEvent({
    userId,
    agencyId,
    eventType: 'regen_token',
    meta: { actorUserId },
    ipHash,
    userAgent
  });
  const status = await getCredentialStatus(userId);
  return {
    token: raw,
    tokenVersion: status.tokenVersion,
    // Caller builds absolute URL
  };
}

export async function resetPasscode({ userId, agencyId = null, actorUserId = null, ipHash = null, userAgent = null }) {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(digits, BCRYPT_ROUNDS);
  await ensureRow(userId, agencyId);
  await pool.execute(
    `UPDATE user_quick_view_credentials
     SET passcode_hash = ?,
         passcode_version = passcode_version + 1,
         passcode_set_at = CURRENT_TIMESTAMP,
         failed_passcode_attempts = 0,
         passcode_locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [hash, userId]
  );
  await pool.execute(
    `UPDATE quick_view_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  await logAccessEvent({
    userId,
    agencyId,
    eventType: 'reset_passcode',
    meta: { actorUserId },
    ipHash,
    userAgent
  });
  const status = await getCredentialStatus(userId);
  return { passcode: digits, passcodeVersion: status.passcodeVersion };
}

export async function findUserByToken(rawToken) {
  const hash = sha256(rawToken);
  const [rows] = await pool.execute(
    `SELECT * FROM user_quick_view_credentials
     WHERE token_hash = ? AND token_revoked_at IS NULL
     LIMIT 1`,
    [hash]
  );
  return rows?.[0] || null;
}

export async function verifyPasscodeAndStartSession({
  rawToken,
  passcode,
  agencyId = null,
  meetingEventType = null,
  meetingEventId = null,
  meetingEndsAt = null,
  ipHash = null,
  userAgent = null,
  deliveryMode = false
}) {
  let cred = null;
  let delivery = null;
  if (deliveryMode) {
    delivery = await findDeliveryToken(rawToken);
    if (!delivery) {
      return { ok: false, error: 'invalid_token' };
    }
    // Shape like credentials row for passcode checks
    cred = {
      user_id: delivery.user_id,
      agency_id: delivery.agency_id || delivery.cred_agency_id,
      passcode_hash: delivery.passcode_hash,
      passcode_locked_until: delivery.passcode_locked_until,
      failed_passcode_attempts: delivery.failed_passcode_attempts,
      token_version: delivery.token_version || 0
    };
    if (delivery.token_revoked_at) {
      // Persistent token revoked — still allow delivery unlock if passcode set
    }
  } else {
    cred = await findUserByToken(rawToken);
  }
  if (!cred) {
    return { ok: false, error: 'invalid_token' };
  }
  if (isPasscodeLocked(cred)) {
    await logAccessEvent({
      userId: cred.user_id,
      agencyId: agencyId || cred.agency_id,
      eventType: 'passcode_fail',
      meta: { reason: 'locked' },
      ipHash,
      userAgent
    });
    return {
      ok: false,
      error: 'locked',
      lockedUntil: cred.passcode_locked_until || LOCK_UNTIL_RESET,
      requiresReset: true
    };
  }
  if (!cred.passcode_hash) {
    return { ok: false, error: 'passcode_not_set' };
  }

  const pin = String(passcode || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'invalid_passcode_format' };
  }

  const match = await bcrypt.compare(pin, cred.passcode_hash);
  if (!match) {
    const attempts = Number(cred.failed_passcode_attempts || 0) + 1;
    const locked = attempts >= MAX_PASSCODE_ATTEMPTS;
    const lockUntil = locked ? LOCK_UNTIL_RESET : null;
    await pool.execute(
      `UPDATE user_quick_view_credentials
       SET failed_passcode_attempts = ?,
           passcode_locked_until = ?
       WHERE user_id = ?`,
      [attempts, lockUntil, cred.user_id]
    );
    await logAccessEvent({
      userId: cred.user_id,
      agencyId: agencyId || cred.agency_id,
      eventType: 'passcode_fail',
      meta: { attempts, locked },
      ipHash,
      userAgent
    });
    if (locked) {
      await notifyQuickViewEvent({
        userId: cred.user_id,
        agencyId: agencyId || cred.agency_id,
        type: 'quick_view_locked',
        severity: 'warning',
        title: 'Quick View locked',
        message:
          'Quick View was locked after 3 incorrect passcode attempts. Sign in to the portal and reset your 6-digit Quick View passcode under My Dashboard → Settings → Privacy & Quick View.'
      });
    }
    return {
      ok: false,
      error: locked ? 'locked' : 'invalid_passcode',
      attempts,
      remainingAttempts: Math.max(0, MAX_PASSCODE_ATTEMPTS - attempts),
      lockedUntil: lockUntil,
      requiresReset: locked
    };
  }

  await pool.execute(
    `UPDATE user_quick_view_credentials
     SET failed_passcode_attempts = 0,
         passcode_locked_until = NULL,
         last_token_used_at = CURRENT_TIMESTAMP,
         last_passcode_ok_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [cred.user_id]
  );

  const sessionRaw = randomSession();
  const sessionHash = sha256(sessionRaw);
  let expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (meetingEndsAt) {
    const end = new Date(meetingEndsAt);
    const meetingExpiry = new Date(end.getTime() + MEETING_GRACE_MS);
    if (meetingExpiry > expiresAt) expiresAt = meetingExpiry;
  }

  await pool.execute(
    `INSERT INTO quick_view_sessions
      (user_id, agency_id, session_token_hash, credential_token_version,
       meeting_event_type, meeting_event_id, meeting_ends_at, expires_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      cred.user_id,
      agencyId || cred.agency_id || null,
      sessionHash,
      cred.token_version,
      meetingEventType,
      meetingEventId,
      meetingEndsAt || null,
      expiresAt
    ]
  );

  await logAccessEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    eventType: 'session_start',
    resourceType: meetingEventType,
    resourceId: meetingEventId,
    ipHash,
    userAgent
  });
  await logAccessEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    eventType: 'passcode_ok',
    ipHash,
    userAgent
  });

  const uaHint = userAgent ? String(userAgent).slice(0, 80) : 'unknown device';
  await notifyQuickViewEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    type: 'quick_view_login',
    severity: 'info',
    title: 'Quick View login',
    message: `Your Quick View was unlocked (${uaHint}). If this was not you, reset your Quick View passcode in Settings.`
  });

  if (deliveryMode && delivery?.id) {
    await pool.execute(
      `UPDATE quick_view_delivery_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL`,
      [delivery.id]
    ).catch(() => {});
  }

  return {
    ok: true,
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id || null,
    sessionToken: sessionRaw,
    expiresAt,
    deepLinkPath: delivery?.deep_link_path || null
  };
}

/**
 * Unlock with 6-digit passcode only (tenant Quick View home — no URL token bind).
 * Resolves the credential among users in the agency.
 */
export async function verifyPasscodeForTenantAndStartSession({
  passcode,
  agencyId,
  meetingEventType = null,
  meetingEventId = null,
  meetingEndsAt = null,
  ipHash = null,
  userAgent = null
}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { ok: false, error: 'agency_required' };

  const pin = String(passcode || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'invalid_passcode_format' };
  }

  const [rows] = await pool.execute(
    `SELECT c.*
     FROM user_quick_view_credentials c
     WHERE c.passcode_hash IS NOT NULL
       AND (
         c.agency_id = ?
         OR EXISTS (
           SELECT 1 FROM user_agencies ua
           WHERE ua.user_id = c.user_id AND ua.agency_id = ?
         )
       )
     ORDER BY c.last_passcode_ok_at DESC, c.id DESC
     LIMIT 200`,
    [aid, aid]
  );

  if (!rows?.length) {
    return { ok: false, error: 'passcode_not_set' };
  }

  let matchedLocked = null;
  for (const cred of rows) {
    const match = await bcrypt.compare(pin, cred.passcode_hash);
    if (!match) continue;
    if (isPasscodeLocked(cred)) {
      matchedLocked = cred;
      continue;
    }
    // Reuse token unlock success path by calling verify with raw token if available,
    // otherwise start session directly from this credential row.
    return startSessionForCredential(cred, {
      agencyId: aid,
      meetingEventType,
      meetingEventId,
      meetingEndsAt,
      ipHash,
      userAgent
    });
  }

  if (matchedLocked) {
    await logAccessEvent({
      userId: matchedLocked.user_id,
      agencyId: aid,
      eventType: 'passcode_fail',
      meta: { reason: 'locked', mode: 'tenant_pin' },
      ipHash,
      userAgent
    });
    return {
      ok: false,
      error: 'locked',
      lockedUntil: matchedLocked.passcode_locked_until || LOCK_UNTIL_RESET,
      requiresReset: true,
      userId: matchedLocked.user_id,
      agencyId: aid
    };
  }

  await logAccessEvent({
    userId: rows[0].user_id,
    agencyId: aid,
    eventType: 'passcode_fail',
    meta: { reason: 'no_match', mode: 'tenant_pin' },
    ipHash,
    userAgent
  }).catch(() => {});

  return { ok: false, error: 'invalid_passcode', agencyId: aid };
}

async function startSessionForCredential(cred, {
  agencyId = null,
  meetingEventType = null,
  meetingEventId = null,
  meetingEndsAt = null,
  ipHash = null,
  userAgent = null
} = {}) {
  await pool.execute(
    `UPDATE user_quick_view_credentials
     SET failed_passcode_attempts = 0,
         passcode_locked_until = NULL,
         last_token_used_at = CURRENT_TIMESTAMP,
         last_passcode_ok_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [cred.user_id]
  );

  const sessionRaw = randomSession();
  const sessionHash = sha256(sessionRaw);
  let expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (meetingEndsAt) {
    const end = new Date(meetingEndsAt);
    const meetingExpiry = new Date(end.getTime() + MEETING_GRACE_MS);
    if (meetingExpiry > expiresAt) expiresAt = meetingExpiry;
  }

  await pool.execute(
    `INSERT INTO quick_view_sessions
      (user_id, agency_id, session_token_hash, credential_token_version,
       meeting_event_type, meeting_event_id, meeting_ends_at, expires_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      cred.user_id,
      agencyId || cred.agency_id || null,
      sessionHash,
      cred.token_version || 0,
      meetingEventType,
      meetingEventId,
      meetingEndsAt || null,
      expiresAt
    ]
  );

  await logAccessEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    eventType: 'session_start',
    resourceType: meetingEventType,
    resourceId: meetingEventId,
    ipHash,
    userAgent
  });
  await logAccessEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    eventType: 'passcode_ok',
    meta: { mode: 'tenant_pin' },
    ipHash,
    userAgent
  });

  const uaHint = userAgent ? String(userAgent).slice(0, 80) : 'unknown device';
  await notifyQuickViewEvent({
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id,
    type: 'quick_view_login',
    severity: 'info',
    title: 'Quick View login',
    message: `Your Quick View was unlocked (${uaHint}). If this was not you, reset your Quick View passcode in Settings.`
  });

  return {
    ok: true,
    userId: cred.user_id,
    agencyId: agencyId || cred.agency_id || null,
    sessionToken: sessionRaw,
    expiresAt,
    deepLinkPath: null
  };
}

export async function touchSession(rawSessionToken, { meetingEndsAt = null } = {}) {
  const hash = sha256(rawSessionToken);
  const [rows] = await pool.execute(
    `SELECT * FROM quick_view_sessions
     WHERE session_token_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
    [hash]
  );
  const session = rows?.[0];
  if (!session) return null;
  const now = new Date();
  let expiresAt = new Date(session.expires_at);
  if (expiresAt <= now) {
    await logAccessEvent({
      userId: session.user_id,
      agencyId: session.agency_id,
      eventType: 'session_expire'
    });
    return null;
  }

  // Sliding 10-minute window unless meeting grace is longer
  let nextExpiry = new Date(now.getTime() + SESSION_TTL_MS);
  const meetingEnd = meetingEndsAt || session.meeting_ends_at;
  if (meetingEnd) {
    const grace = new Date(new Date(meetingEnd).getTime() + MEETING_GRACE_MS);
    if (grace > nextExpiry) nextExpiry = grace;
  }
  if (expiresAt > nextExpiry) nextExpiry = expiresAt;

  await pool.execute(
    `UPDATE quick_view_sessions
     SET last_activity_at = ?, expires_at = ?
     WHERE id = ?`,
    [now, nextExpiry, session.id]
  );
  return {
    userId: session.user_id,
    agencyId: session.agency_id,
    sessionId: session.id,
    expiresAt: nextExpiry,
    meetingEventType: session.meeting_event_type,
    meetingEventId: session.meeting_event_id
  };
}

export async function revokeSession(rawSessionToken) {
  const hash = sha256(rawSessionToken);
  await pool.execute(
    `UPDATE quick_view_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE session_token_hash = ? AND revoked_at IS NULL`,
    [hash]
  );
}

export async function logAccessEvent({
  userId,
  agencyId = null,
  eventType,
  resourceType = null,
  resourceId = null,
  meta = null,
  ipHash = null,
  userAgent = null
}) {
  try {
    await pool.execute(
      `INSERT INTO quick_view_access_events
        (user_id, agency_id, event_type, resource_type, resource_id, meta_json, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        agencyId,
        eventType,
        resourceType,
        resourceId,
        meta ? JSON.stringify(meta) : null,
        ipHash,
        userAgent ? String(userAgent).slice(0, 512) : null
      ]
    );
  } catch (e) {
    console.warn('[quickViewAuth] log failed:', e?.message || e);
  }
}

export function buildQuickViewUrl({ baseUrl, token, joinType = null, joinId = null }) {
  const base = String(baseUrl || '').replace(/\/$/, '') || 'https://plottwisthq.com';
  // Tenant QV hosts use /t/:token; legacy / platform hosts keep /quick-view/:token
  const isQvHost = /^https?:\/\/qv[.-]/i.test(base);
  const path = isQvHost
    ? `/t/${encodeURIComponent(token)}`
    : `/quick-view/${encodeURIComponent(token)}`;
  const params = new URLSearchParams();
  if (joinType && joinId) {
    params.set('join', joinType);
    params.set('id', String(joinId));
  }
  const q = params.toString();
  return `${base}${path}${q ? `?${q}` : ''}`;
}

/**
 * Ephemeral delivery link for digests/reminders — does NOT revoke the persistent bookmark token.
 * Landing route: /quick-view/d/:deliveryToken (same passcode gate).
 */
export async function issueDeliveryToken({
  userId,
  agencyId = null,
  purpose = 'digest',
  deepLinkPath = null,
  expiresInHours = 168
}) {
  const raw = randomToken();
  const hash = sha256(raw);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInHours) || 168) * 60 * 60 * 1000);
  // Ensure credentials row exists so passcode can be set; do not mint persistent token here.
  await ensureRow(userId, agencyId);
  await pool.execute(
    `INSERT INTO quick_view_delivery_tokens
      (user_id, agency_id, purpose, token_hash, deep_link_path, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, agencyId, String(purpose || 'digest').slice(0, 40), hash, deepLinkPath, expiresAt]
  );
  return { token: raw, expiresAt };
}

export async function findDeliveryToken(rawToken) {
  const hash = sha256(rawToken);
  const [rows] = await pool.execute(
    `SELECT d.*, c.passcode_hash, c.passcode_locked_until, c.failed_passcode_attempts,
            c.token_version, c.token_revoked_at, c.agency_id AS cred_agency_id
     FROM quick_view_delivery_tokens d
     LEFT JOIN user_quick_view_credentials c ON c.user_id = d.user_id
     WHERE d.token_hash = ?
       AND d.consumed_at IS NULL
       AND d.expires_at > NOW()
     LIMIT 1`,
    [hash]
  );
  return rows?.[0] || null;
}

/**
 * Ensure a persistent token exists for bookmarking. Only creates when missing —
 * never regenerates an existing token (that would invalidate Account Info links).
 */
export async function ensurePersistentToken({ userId, agencyId = null }) {
  const status = await getCredentialStatus(userId);
  if (status.hasToken) return { created: false, ...status, token: null };
  const created = await regenerateToken({ userId, agencyId });
  return { created: true, token: created.token, tokenVersion: created.tokenVersion };
}

export function buildDeliveryQuickViewUrl({ baseUrl, deliveryToken, joinType = null, joinId = null }) {
  const base = String(baseUrl || '').replace(/\/$/, '') || 'https://plottwisthq.com';
  const isQvHost = /^https?:\/\/qv[.-]/i.test(base);
  const path = isQvHost
    ? `/d/${encodeURIComponent(deliveryToken)}`
    : `/quick-view/d/${encodeURIComponent(deliveryToken)}`;
  const params = new URLSearchParams();
  if (joinType && joinId) {
    params.set('join', joinType);
    params.set('id', String(joinId));
  }
  const q = params.toString();
  return `${base}${path}${q ? `?${q}` : ''}`;
}

export default {
  getCredentialStatus,
  regenerateToken,
  resetPasscode,
  findUserByToken,
  verifyPasscodeAndStartSession,
  verifyPasscodeForTenantAndStartSession,
  touchSession,
  revokeSession,
  logAccessEvent,
  revealToken,
  buildQuickViewUrl,
  issueDeliveryToken,
  findDeliveryToken,
  ensurePersistentToken,
  buildDeliveryQuickViewUrl
};
