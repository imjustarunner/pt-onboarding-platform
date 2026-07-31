import pool from '../../config/database.js';
import {
  FEDERAL_BG_ITEM_KEY,
  FEDERAL_BG_SOON_DAYS,
  expirationStatus,
  federalBackgroundExpirationApplies,
  syncFederalBackgroundExpiration
} from '../federalBackgroundCheck.service.js';

const LICENSE_EXPIRE_KEYS = [
  'provider_credential_license_expiration_date',
  'license_expires',
  'license_expiration_date',
  'license_expires_date'
];

const LICENSE_TYPE_KEYS = [
  'provider_credential_license_type_number',
  'license_type_number'
];

const LICENSE_ISSUED_KEYS = [
  'provider_credential_license_issued_date',
  'license_issued'
];

function toYmd(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysUntil(ymd) {
  const target = toYmd(ymd);
  if (!target) return null;
  const today = new Date();
  const todayYmd = toYmd(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${target}T00:00:00Z`) - new Date(`${todayYmd}T00:00:00Z`)) / msPerDay);
}

function licenseStatusFromExpires(expiresYmd) {
  const days = daysUntil(expiresYmd);
  if (days == null) return { status: 'unknown', label: 'Unknown', days: null };
  if (days < 0) return { status: 'expired', label: 'Expired', days };
  if (days <= 90) return { status: 'soon', label: 'Expiring soon', days };
  return { status: 'active', label: 'Active', days };
}

async function readUserInfoFields(userId, fieldKeys = []) {
  const uid = Number(userId);
  if (!uid || !fieldKeys.length) return {};
  const placeholders = fieldKeys.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT uifd.field_key, uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ?
       AND uifd.field_key IN (${placeholders})
     ORDER BY uiv.updated_at DESC, uiv.id DESC`,
    [uid, ...fieldKeys]
  );
  const out = {};
  for (const row of rows || []) {
    const key = String(row.field_key || '').trim();
    if (!key || out[key] != null) continue;
    out[key] = row.value ?? null;
  }
  return out;
}

function firstFieldValue(fields, keys) {
  for (const key of keys) {
    const val = fields?.[key];
    if (val != null && String(val).trim() !== '') return String(val).trim();
  }
  return null;
}

async function readFederalBackgroundStatus(userId, { agencyId = null } = {}) {
  const uid = Number(userId);
  if (!uid) return null;

  await syncFederalBackgroundExpiration(uid, { preferredAgencyId: agencyId }).catch(() => null);

  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL
     LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  if (!definitionId) {
    return {
      itemKey: FEDERAL_BG_ITEM_KEY,
      completed: false,
      completedAt: null,
      expiresAt: null,
      status: null,
      trackingApplies: await federalBackgroundExpirationApplies(uid)
    };
  }

  const [rows] = await pool.execute(
    `SELECT is_completed, completed_at, expires_at, scheduled_at
     FROM user_lifecycle_checklist_items
     WHERE user_id = ? AND definition_id = ?
     LIMIT 1`,
    [uid, definitionId]
  );
  const row = rows?.[0];
  const expiresAt = toYmd(row?.expires_at);
  const trackingApplies = await federalBackgroundExpirationApplies(uid);
  const status = expiresAt ? expirationStatus(expiresAt, { soonDays: FEDERAL_BG_SOON_DAYS }) : null;

  return {
    itemKey: FEDERAL_BG_ITEM_KEY,
    label: 'Federal background / fingerprint check',
    completed: !!row?.is_completed,
    completedAt: toYmd(row?.completed_at),
    scheduledAt: toYmd(row?.scheduled_at),
    expiresAt,
    trackingApplies,
    status: status?.status || (row?.is_completed ? 'ok' : 'missing'),
    statusLabel: status?.label || (row?.is_completed ? 'Complete' : 'Not completed'),
    daysUntilExpiration: status?.days ?? null
  };
}

export async function getMyComplianceStatus({ userId, agencyId = null } = {}) {
  const uid = Number(userId);
  if (!uid) throw new Error('userId is required');

  const fields = await readUserInfoFields(uid, [
    ...LICENSE_EXPIRE_KEYS,
    ...LICENSE_TYPE_KEYS,
    ...LICENSE_ISSUED_KEYS,
    'provider_credential'
  ]);

  const licenseExpires = firstFieldValue(fields, LICENSE_EXPIRE_KEYS);
  const licenseIssued = firstFieldValue(fields, LICENSE_ISSUED_KEYS);
  const licenseTypeNumber = firstFieldValue(fields, LICENSE_TYPE_KEYS);
  const credential = firstFieldValue(fields, ['provider_credential']);
  const licenseStatus = licenseStatusFromExpires(licenseExpires);

  const federalBackgroundCheck = await readFederalBackgroundStatus(uid, { agencyId });

  return {
    license: {
      credential: credential || null,
      typeAndNumber: licenseTypeNumber || null,
      issuedDate: licenseIssued,
      expirationDate: licenseExpires,
      status: licenseStatus.status,
      statusLabel: licenseStatus.label,
      daysUntilExpiration: licenseStatus.days,
      isUpToDate: licenseStatus.status === 'active' || licenseStatus.status === 'soon'
    },
    federalBackgroundCheck,
    profileHint: 'Open My Account → Credentials or the Lifecycle tab on your profile for full detail.'
  };
}

async function listAgencyProviderIds(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT u.id
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
       AND LOWER(COALESCE(u.role,'')) IN ('provider','provider_plus','clinical_practice_assistant','admin','super_admin')`,
    [aid]
  );
  return (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
}

export async function queryAgencyCompliance({
  agencyId,
  filter = 'all',
  limit = 25
} = {}) {
  const aid = Number(agencyId);
  if (!aid) throw new Error('agencyId is required');

  const max = Math.min(Math.max(1, Number(limit) || 25), 50);
  const mode = String(filter || 'all').trim().toLowerCase();

  const userIds = await listAgencyProviderIds(aid);
  if (!userIds.length) {
    return { filter: mode, totalMatched: 0, results: [], summary: { expiredLicenses: 0, expiringLicenses: 0, backgroundExpired: 0, backgroundDue: 0 } };
  }

  const placeholders = userIds.map(() => '?').join(',');
  const fieldPlaceholders = [...LICENSE_EXPIRE_KEYS, ...LICENSE_TYPE_KEYS].map(() => '?').join(',');

  const [users] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.credential
     FROM users u
     WHERE u.id IN (${placeholders})`,
    userIds
  );

  const [vals] = await pool.execute(
    `SELECT uiv.user_id, uifd.field_key, uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id IN (${placeholders})
       AND uifd.field_key IN (${fieldPlaceholders})
     ORDER BY uiv.user_id ASC, uiv.updated_at DESC, uiv.id DESC`,
    [...userIds, ...LICENSE_EXPIRE_KEYS, ...LICENSE_TYPE_KEYS]
  );

  const fieldsByUser = new Map();
  for (const row of vals || []) {
    const uid = Number(row.user_id);
    if (!fieldsByUser.has(uid)) fieldsByUser.set(uid, {});
    const bucket = fieldsByUser.get(uid);
    const key = String(row.field_key || '').trim();
    if (!key || bucket[key] != null) continue;
    bucket[key] = row.value ?? null;
  }

  const [defs] = await pool.execute(
    `SELECT id FROM lifecycle_checklist_definitions
     WHERE item_key = ? AND agency_id IS NULL LIMIT 1`,
    [FEDERAL_BG_ITEM_KEY]
  );
  const definitionId = defs?.[0]?.id;
  const bgByUser = new Map();
  if (definitionId) {
    const [bgRows] = await pool.execute(
      `SELECT user_id, is_completed, completed_at, expires_at
       FROM user_lifecycle_checklist_items
       WHERE definition_id = ? AND user_id IN (${placeholders})`,
      [definitionId, ...userIds]
    );
    for (const row of bgRows || []) {
      bgByUser.set(Number(row.user_id), row);
    }
  }

  const results = [];
  let expiredLicenses = 0;
  let expiringLicenses = 0;
  let backgroundExpired = 0;
  let backgroundDue = 0;

  for (const user of users || []) {
    const uid = Number(user.id);
    const fields = fieldsByUser.get(uid) || {};
    const licenseExpires = firstFieldValue(fields, LICENSE_EXPIRE_KEYS);
    const licenseTypeNumber = firstFieldValue(fields, LICENSE_TYPE_KEYS);
    const licenseStatus = licenseStatusFromExpires(licenseExpires);

    if (licenseStatus.status === 'expired') expiredLicenses += 1;
    if (licenseStatus.status === 'soon') expiringLicenses += 1;

    const bgRow = bgByUser.get(uid);
    const bgExpires = toYmd(bgRow?.expires_at);
    const bgStatus = bgExpires ? expirationStatus(bgExpires, { soonDays: FEDERAL_BG_SOON_DAYS }) : null;
    const bgComplete = !!bgRow?.is_completed;

    if (bgStatus?.status === 'expired') backgroundExpired += 1;
    if (!bgComplete || bgStatus?.status === 'soon' || bgStatus?.status === 'expired') backgroundDue += 1;

    const entry = {
      userId: uid,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
      role: user.role,
      credential: user.credential || null,
      licenseTypeNumber: licenseTypeNumber || null,
      licenseExpirationDate: licenseExpires,
      licenseStatus: licenseStatus.status,
      licenseStatusLabel: licenseStatus.label,
      licenseDaysUntilExpiration: licenseStatus.days,
      backgroundCheckCompleted: bgComplete,
      backgroundCheckExpiresAt: bgExpires,
      backgroundCheckStatus: bgStatus?.status || (bgComplete ? 'ok' : 'missing'),
      backgroundCheckStatusLabel: bgStatus?.label || (bgComplete ? 'Complete' : 'Not completed'),
      profilePath: `/admin/users/${uid}`
    };

    let include = false;
    switch (mode) {
      case 'expired_licenses':
        include = licenseStatus.status === 'expired';
        break;
      case 'expiring_licenses':
        include = licenseStatus.status === 'soon';
        break;
      case 'background_expired':
        include = bgStatus?.status === 'expired';
        break;
      case 'background_due':
        include = !bgComplete || bgStatus?.status === 'soon' || bgStatus?.status === 'expired';
        break;
      case 'all':
      default:
        include =
          licenseStatus.status === 'expired' ||
          licenseStatus.status === 'soon' ||
          !bgComplete ||
          bgStatus?.status === 'soon' ||
          bgStatus?.status === 'expired';
        break;
    }

    if (include) results.push(entry);
  }

  results.sort((a, b) => {
    const rank = (row) => {
      if (row.licenseStatus === 'expired' || row.backgroundCheckStatus === 'expired') return 0;
      if (row.licenseStatus === 'soon' || row.backgroundCheckStatus === 'soon') return 1;
      if (!row.backgroundCheckCompleted) return 2;
      return 3;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(a.name).localeCompare(String(b.name));
  });

  return {
    filter: mode,
    totalMatched: results.length,
    results: results.slice(0, max),
    summary: {
      expiredLicenses,
      expiringLicenses,
      backgroundExpired,
      backgroundDue
    },
    adminHint: 'Open Agency Credentialing or a user profile Lifecycle tab for full detail.'
  };
}

export function parseAgencyComplianceFilterFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  if (!s) return null;
  if (!/\b(license|licenses|credential|background|fingerprint|bgc)\b/.test(s)) return null;
  if (!/\b(who|anyone|anybody|which|list|show|find|expir|due|overdue|up to date|uptodate)\b/.test(s)) {
    return null;
  }
  if (/\b(background|fingerprint|bgc)\b/.test(s) && /\b(expir|overdue|due|renew)\b/.test(s)) {
    return 'background_due';
  }
  if (/\b(background|fingerprint|bgc)\b/.test(s) && /\b(expired|past due)\b/.test(s)) {
    return 'background_expired';
  }
  if (/\b(license|licenses|credential)\b/.test(s) && /\b(expir|overdue|due soon|expiring)\b/.test(s)) {
    return 'expiring_licenses';
  }
  if (/\b(license|licenses|credential)\b/.test(s) && /\b(expired|past due)\b/.test(s)) {
    return 'expired_licenses';
  }
  if (/\b(background|fingerprint|bgc)\b/.test(s) && /\b(who|anyone|which|due)\b/.test(s)) {
    return 'background_due';
  }
  return 'all';
}

export function looksLikeMyComplianceQuestion(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  if (!s) return false;
  if (!/\b(my|mine|i|me)\b/.test(s) && !/\b(am i|is my)\b/.test(s)) return false;
  return (
    (/\b(license|credential|certification)\b/.test(s) &&
      /\b(expir|up to date|uptodate|current|valid|when)\b/.test(s)) ||
    (/\b(background|fingerprint|bgc)\b/.test(s) &&
      /\b(expir|due|up to date|uptodate|current|valid|when|complete)\b/.test(s))
  );
}
