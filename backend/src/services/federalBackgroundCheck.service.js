/**
 * Federal Background/Fingerprint Check expiration helpers.
 * Completion lives on lifecycle item `background_check_complete`.
 * Expiration = completed_at + agencies.federal_background_check_expiration_years (3 or 5).
 */
import pool from '../config/database.js';

export const FEDERAL_BG_ITEM_KEY = 'background_check_complete';
export const FEDERAL_BG_DEFAULT_YEARS = 5;
export const FEDERAL_BG_ALLOWED_YEARS = new Set([3, 5]);
/** Match Agency Credentialing license UI: flag within 90 days. */
export const FEDERAL_BG_SOON_DAYS = 90;

function toYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toYmd(parsed);
}

export function normalizeExpirationYears(years) {
  const n = parseInt(years, 10);
  if (FEDERAL_BG_ALLOWED_YEARS.has(n)) return n;
  return FEDERAL_BG_DEFAULT_YEARS;
}

export function computeExpiresAt(completedAt, years = FEDERAL_BG_DEFAULT_YEARS) {
  const ymd = toYmd(completedAt);
  if (!ymd) return null;
  const y = normalizeExpirationYears(years);
  const [yy, mm, dd] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  dt.setUTCFullYear(dt.getUTCFullYear() + y);
  return toYmd(dt);
}

export function expirationStatus(expiresAt, { soonDays = FEDERAL_BG_SOON_DAYS } = {}) {
  const ymd = toYmd(expiresAt);
  if (!ymd) return null;
  const today = new Date();
  const todayYmd = toYmd(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((new Date(`${ymd}T00:00:00Z`) - new Date(`${todayYmd}T00:00:00Z`)) / msPerDay);
  if (days < 0) return { status: 'expired', label: 'Expired', days };
  if (days <= soonDays) return { status: 'soon', label: 'Expiring Soon', days };
  return { status: 'ok', label: 'Active', days };
}

export async function resolveAgencyIdForUser(userId, preferredAgencyId = null) {
  const preferred = parseInt(preferredAgencyId, 10);
  if (Number.isInteger(preferred) && preferred > 0) {
    const [ok] = await pool.execute(
      `SELECT agency_id FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [userId, preferred]
    );
    if (ok?.[0]?.agency_id) return preferred;
  }

  const [rows] = await pool.execute(
    `SELECT ua.agency_id
     FROM user_agencies ua
     JOIN agencies a ON a.id = ua.agency_id
     WHERE ua.user_id = ?
     ORDER BY (a.is_active = 1) DESC, ua.agency_id ASC
     LIMIT 1`,
    [userId]
  );
  return rows?.[0]?.agency_id ? Number(rows[0].agency_id) : null;
}

export async function getExpirationYearsForAgency(agencyId) {
  const id = parseInt(agencyId, 10);
  if (!Number.isInteger(id) || id <= 0) return FEDERAL_BG_DEFAULT_YEARS;
  try {
    const [rows] = await pool.execute(
      `SELECT federal_background_check_expiration_years AS years
       FROM agencies WHERE id = ? LIMIT 1`,
      [id]
    );
    return normalizeExpirationYears(rows?.[0]?.years);
  } catch {
    return FEDERAL_BG_DEFAULT_YEARS;
  }
}

export async function getExpirationYearsForUser(userId, preferredAgencyId = null) {
  const agencyId = await resolveAgencyIdForUser(userId, preferredAgencyId);
  if (!agencyId) return FEDERAL_BG_DEFAULT_YEARS;
  return getExpirationYearsForAgency(agencyId);
}

/**
 * Recompute and persist expires_at on the federal background lifecycle row.
 */
export async function syncFederalBackgroundExpiration(userId, { preferredAgencyId = null } = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return null;

  const years = await getExpirationYearsForUser(uid, preferredAgencyId);
  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  if (!definitionId) return null;

  const [rows] = await pool.execute(
    `SELECT is_completed, completed_at, expires_at
     FROM user_lifecycle_checklist_items
     WHERE user_id = ? AND definition_id = ?
     LIMIT 1`,
    [uid, definitionId]
  );
  const row = rows?.[0];
  if (!row || !row.is_completed || !row.completed_at) {
    if (row) {
      await pool.execute(
        `UPDATE user_lifecycle_checklist_items
         SET expires_at = NULL
         WHERE user_id = ? AND definition_id = ?`,
        [uid, definitionId]
      );
    }
    return { expiresAt: null, years, definitionId };
  }

  const expiresAt = computeExpiresAt(row.completed_at, years);
  await pool.execute(
    `UPDATE user_lifecycle_checklist_items
     SET expires_at = ?
     WHERE user_id = ? AND definition_id = ?`,
    [expiresAt, uid, definitionId]
  );
  return { expiresAt, years, definitionId, completedAt: toYmd(row.completed_at) };
}

/**
 * When tenant years change, recompute expires_at for every federal bg check row
 * for users in that agency.
 */
export async function setExpirationYearsForAgency(agencyId, years) {
  const id = parseInt(agencyId, 10);
  const y = normalizeExpirationYears(years);
  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error('Invalid agency id'), { status: 400 });
  }
  if (!FEDERAL_BG_ALLOWED_YEARS.has(parseInt(years, 10))) {
    throw Object.assign(new Error('Expiration years must be 3 or 5'), { status: 400 });
  }

  await pool.execute(
    `UPDATE agencies
     SET federal_background_check_expiration_years = ?
     WHERE id = ?`,
    [y, id]
  );

  await pool.execute(
    `UPDATE user_lifecycle_checklist_items ulci
     JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
     JOIN user_agencies ua ON ua.user_id = ulci.user_id
     SET ulci.expires_at = CASE
       WHEN ulci.is_completed = 1 AND ulci.completed_at IS NOT NULL
         THEN DATE_ADD(DATE(ulci.completed_at), INTERVAL ? YEAR)
       ELSE NULL
     END
     WHERE lcd.item_key = ?
       AND lcd.agency_id IS NULL
       AND ua.agency_id = ?`,
    [y, FEDERAL_BG_ITEM_KEY, id]
  );

  return { agencyId: id, years: y };
}

/**
 * Mirror completion date into provider_background_check_date / status EAV for consistency.
 */
export async function mirrorBackgroundCheckInfoFields(userId, { completed, completedAt } = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;

  const fieldWrites = [];
  if (completed) {
    const ymd = toYmd(completedAt) || toYmd(new Date());
    if (ymd) fieldWrites.push(['provider_background_check_date', ymd]);
    fieldWrites.push(['provider_background_check_status', 'complete']);
  }

  for (const [fieldKey, value] of fieldWrites) {
    const [defRows] = await pool.execute(
      `SELECT id FROM user_info_field_definitions
       WHERE field_key = ? AND agency_id IS NULL
       LIMIT 1`,
      [fieldKey]
    );
    const defId = defRows?.[0]?.id;
    if (!defId) continue;
    await pool.execute(
      `INSERT INTO user_info_values (user_id, field_definition_id, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [uid, defId, value]
    );
  }
}
