/**
 * Federal Background/Fingerprint Check expiration helpers.
 * Completion lives on lifecycle item `background_check_complete`.
 * Expiration applies only for District 11 school assignments: completed_at + 3 years.
 * Non-D11 providers keep completion dates but do not track/display expiration.
 */
import pool from '../config/database.js';
import {
  D11_BACKGROUND_EXPIRATION_YEARS,
  providerHasDistrict11Assignment,
} from '../utils/districtCompliance.js';

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

/**
 * Effective years for displaying/computing expiration.
 * District 11 assignees always use 3 years; others return tenant setting
 * (but sync clears expires_at when not D11-applicable).
 */
export async function getExpirationYearsForUser(userId, preferredAgencyId = null) {
  const d11 = await providerHasDistrict11Assignment(userId);
  if (d11) return D11_BACKGROUND_EXPIRATION_YEARS;
  const agencyId = await resolveAgencyIdForUser(userId, preferredAgencyId);
  if (!agencyId) return FEDERAL_BG_DEFAULT_YEARS;
  return getExpirationYearsForAgency(agencyId);
}

export async function federalBackgroundExpirationApplies(userId) {
  return providerHasDistrict11Assignment(userId);
}

/**
 * Recompute and persist expires_at on the federal background lifecycle row.
 * D11-applicable → expires_at = completed_at + 3 years.
 * Not D11 → clear expires_at (keep completion).
 */
export async function syncFederalBackgroundExpiration(userId, { preferredAgencyId = null } = {}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return null;

  const applies = await providerHasDistrict11Assignment(uid);
  const years = applies
    ? D11_BACKGROUND_EXPIRATION_YEARS
    : await getExpirationYearsForUser(uid, preferredAgencyId);

  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  if (!definitionId) return null;

  const [rows] = await pool.execute(
    `SELECT is_completed, completed_at, expires_at, scheduled_at
     FROM user_lifecycle_checklist_items
     WHERE user_id = ? AND definition_id = ?
     LIMIT 1`,
    [uid, definitionId]
  );
  const row = rows?.[0];
  if (!row) {
    return {
      applies,
      expiresAt: null,
      years: applies ? D11_BACKGROUND_EXPIRATION_YEARS : years,
      definitionId,
      scheduledAt: null,
    };
  }

  if (!applies || !row.is_completed || !row.completed_at) {
    if (row.expires_at != null) {
      await pool.execute(
        `UPDATE user_lifecycle_checklist_items
         SET expires_at = NULL
         WHERE user_id = ? AND definition_id = ?`,
        [uid, definitionId]
      );
    }
    return {
      applies,
      expiresAt: null,
      years: applies ? D11_BACKGROUND_EXPIRATION_YEARS : years,
      definitionId,
      completedAt: toYmd(row.completed_at),
      scheduledAt: toYmd(row.scheduled_at),
    };
  }

  const expiresAt = computeExpiresAt(row.completed_at, D11_BACKGROUND_EXPIRATION_YEARS);
  await pool.execute(
    `UPDATE user_lifecycle_checklist_items
     SET expires_at = ?
     WHERE user_id = ? AND definition_id = ?`,
    [expiresAt, uid, definitionId]
  );
  return {
    applies: true,
    expiresAt,
    years: D11_BACKGROUND_EXPIRATION_YEARS,
    definitionId,
    completedAt: toYmd(row.completed_at),
    scheduledAt: toYmd(row.scheduled_at),
  };
}

/**
 * When tenant years change, persist the agency setting then re-sync each
 * agency member so D11 users stay on 3 years and non-D11 clear expiration.
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

  const [users] = await pool.execute(
    `SELECT DISTINCT ua.user_id
     FROM user_agencies ua
     JOIN user_lifecycle_checklist_items ulci ON ulci.user_id = ua.user_id
     JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
     WHERE ua.agency_id = ?
       AND lcd.item_key = ?
       AND lcd.agency_id IS NULL`,
    [id, FEDERAL_BG_ITEM_KEY]
  );
  for (const row of users || []) {
    await syncFederalBackgroundExpiration(row.user_id, { preferredAgencyId: id }).catch(() => null);
  }

  return { agencyId: id, years: y };
}

/**
 * When scheduled_at <= today, promote it to completed_at (the new BG/fingerprint date),
 * clear scheduled_at, recompute expires_at, and mirror EAV fields.
 */
export async function promoteScheduledFederalBackgroundChecks({ asOf = null } = {}) {
  const todayYmd = toYmd(asOf || new Date());
  if (!todayYmd) return { promoted: 0 };

  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  if (!definitionId) return { promoted: 0 };

  const [rows] = await pool.execute(
    `SELECT user_id, scheduled_at
     FROM user_lifecycle_checklist_items
     WHERE definition_id = ?
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= ?`,
    [definitionId, todayYmd]
  );

  let promoted = 0;
  for (const row of rows || []) {
    const uid = Number(row.user_id);
    const scheduledYmd = toYmd(row.scheduled_at);
    if (!uid || !scheduledYmd) continue;
    try {
      await pool.execute(
        `UPDATE user_lifecycle_checklist_items
         SET is_completed = 1,
             completed_at = ?,
             scheduled_at = NULL,
             completion_method = COALESCE(completion_method, 'scheduled_promote'),
             manually_overridden = 0
         WHERE user_id = ? AND definition_id = ?`,
        [`${scheduledYmd} 00:00:00`, uid, definitionId]
      );
      await syncFederalBackgroundExpiration(uid);
      await mirrorBackgroundCheckInfoFields(uid, {
        completed: true,
        completedAt: scheduledYmd
      });
      // Also mirror fingerprint date when the field exists
      const [fpDefs] = await pool.execute(
        `SELECT id FROM user_info_field_definitions
         WHERE field_key = 'provider_fingerprint_date' AND agency_id IS NULL
         LIMIT 1`
      );
      if (fpDefs?.[0]?.id) {
        await pool.execute(
          `INSERT INTO user_info_values (user_id, field_definition_id, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [uid, fpDefs[0].id, scheduledYmd]
        );
      }
      promoted += 1;
    } catch (err) {
      console.error('[federalBG] promote scheduled failed', uid, err?.message || err);
    }
  }
  return { promoted };
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
