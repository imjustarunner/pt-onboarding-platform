/**
 * Onboarding credential packet — staff Lifecycle source of truth + employee portal view.
 * Temp passwords are portal/Lifecycle only (never PDF / shared docs).
 */
import pool from '../config/database.js';
import { syncLifecycleItems } from './lifecycleSync.service.js';

export const CREDENTIAL_FIELD_KEYS = [
  'grasshopper_login',
  'grasshopper_extension',
  'grasshopper_pin',
  'therapynotes_login',
  'therapynotes_temp_password',
  'workspace_temp_password',
  'lifecycle_npi_number',
  'portal_identity_confirmed',
  'portal_acked_email',
  'portal_acked_grasshopper',
  'portal_acked_therapynotes',
  'therapynotes_temp_password_revealed',
  'workspace_temp_password_revealed'
];

const STAFF_WRITABLE = new Set([
  'grasshopper_login',
  'grasshopper_extension',
  'grasshopper_pin',
  'therapynotes_login',
  'therapynotes_temp_password',
  'workspace_temp_password',
  'lifecycle_npi_number'
]);

async function ensureFieldDefId(fieldKey) {
  const [rows] = await pool.execute(
    `SELECT id FROM user_info_field_definitions
     WHERE field_key = ? AND agency_id IS NULL
     LIMIT 1`,
    [fieldKey]
  );
  return rows?.[0]?.id || null;
}

export async function getUserInfoMap(userId, keys = CREDENTIAL_FIELD_KEYS) {
  if (!keys.length) return {};
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT uifd.field_key, uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ?
       AND uifd.field_key IN (${placeholders})`,
    [userId, ...keys]
  );
  const map = {};
  for (const r of rows || []) {
    map[r.field_key] = r.value ?? null;
  }
  return map;
}

export async function setUserInfoValue(userId, fieldKey, value) {
  const defId = await ensureFieldDefId(fieldKey);
  if (!defId) return false;
  const v = value == null || String(value).trim() === '' ? null : String(value).trim();
  if (v) {
    await pool.execute(
      `INSERT INTO user_info_values (user_id, field_definition_id, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [userId, defId, v]
    );
  } else {
    await pool.execute(
      `DELETE FROM user_info_values WHERE user_id = ? AND field_definition_id = ?`,
      [userId, defId]
    );
  }
  return true;
}

/**
 * Staff Lifecycle credentials block payload.
 */
export async function getLifecycleCredentials(userId) {
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, preferred_name, email, work_email, personal_email,
            personal_phone, work_phone, work_phone_extension
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = userRows?.[0] || null;
  if (!user) return null;

  const info = await getUserInfoMap(userId);

  // Prefer clinical NPI if present
  let clinicalNpi = null;
  try {
    const [npiRows] = await pool.execute(
      `SELECT uiv.value
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
       WHERE uiv.user_id = ?
         AND uifd.field_key IN ('provider_identity_npi_number', 'npi_number', 'npi_id')
       ORDER BY FIELD(uifd.field_key, 'provider_identity_npi_number', 'npi_number', 'npi_id')
       LIMIT 1`,
      [userId]
    );
    clinicalNpi = npiRows?.[0]?.value || null;
  } catch {
    clinicalNpi = null;
  }

  return {
    workspaceEmail: user.work_email || user.email || null,
    personalEmail: user.personal_email || null,
    personalPhone: user.personal_phone || null,
    workPhone: user.work_phone || null,
    workPhoneExtension: user.work_phone_extension || null,
    grasshopperLogin: info.grasshopper_login || null,
    grasshopperExtension: info.grasshopper_extension || user.work_phone_extension || null,
    grasshopperPin: info.grasshopper_pin || null,
    therapynotesLogin: info.therapynotes_login || null,
    therapynotesTempPassword: info.therapynotes_temp_password || null,
    workspaceTempPassword: info.workspace_temp_password || null,
    npiNumber: info.lifecycle_npi_number || clinicalNpi || null,
    portalIdentityConfirmed: !!info.portal_identity_confirmed,
    portalAckedEmail: !!info.portal_acked_email,
    portalAckedGrasshopper: !!info.portal_acked_grasshopper,
    portalAckedTherapynotes: !!info.portal_acked_therapynotes
  };
}

export async function saveLifecycleCredentials(userId, payload = {}) {
  const mapping = {
    grasshopper_login: payload.grasshopperLogin ?? payload.grasshopper_login,
    grasshopper_extension: payload.grasshopperExtension ?? payload.grasshopper_extension,
    grasshopper_pin: payload.grasshopperPin ?? payload.grasshopper_pin,
    therapynotes_login: payload.therapynotesLogin ?? payload.therapynotes_login,
    therapynotes_temp_password: payload.therapynotesTempPassword ?? payload.therapynotes_temp_password,
    workspace_temp_password: payload.workspaceTempPassword ?? payload.workspace_temp_password,
    lifecycle_npi_number: payload.npiNumber ?? payload.lifecycle_npi_number ?? payload.npi_number
  };

  for (const [key, raw] of Object.entries(mapping)) {
    if (raw === undefined) continue;
    if (!STAFF_WRITABLE.has(key)) continue;
    await setUserInfoValue(userId, key, raw);
  }

  // Keep Grasshopper extension mirrored on users.work_phone_extension when provided
  if (mapping.grasshopper_extension !== undefined) {
    const ext = mapping.grasshopper_extension == null || String(mapping.grasshopper_extension).trim() === ''
      ? null
      : String(mapping.grasshopper_extension).trim();
    try {
      await pool.execute(
        `UPDATE users SET work_phone_extension = ? WHERE id = ? LIMIT 1`,
        [ext, userId]
      );
    } catch {
      /* column may not exist on older DBs */
    }
  }

  // Mirror NPI into clinical field when set
  if (mapping.lifecycle_npi_number !== undefined && mapping.lifecycle_npi_number) {
    const clinicalDef = await ensureFieldDefId('provider_identity_npi_number');
    if (clinicalDef) {
      await pool.execute(
        `INSERT INTO user_info_values (user_id, field_definition_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [userId, clinicalDef, String(mapping.lifecycle_npi_number).trim()]
      );
    }
  }

  try {
    await syncLifecycleItems(userId);
  } catch (err) {
    console.warn('[saveLifecycleCredentials] sync failed:', err?.message);
  }

  return getLifecycleCredentials(userId);
}

/**
 * Employee-facing packet (secrets revealed once).
 */
export async function getCredentialPacketForPortal(userId) {
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, preferred_name, email, work_email, personal_email,
            personal_phone, status
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = userRows?.[0];
  if (!user) return null;

  const info = await getUserInfoMap(userId);
  const tnRevealed = !!info.therapynotes_temp_password_revealed;
  const wsRevealed = !!info.workspace_temp_password_revealed;

  return {
    phase: user.status === 'ONBOARDING' ? 'onboarding' : 'prehire',
    identity: {
      legalFirstName: user.first_name || '',
      legalLastName: user.last_name || '',
      preferredName: user.preferred_name || '',
      personalEmail: user.personal_email || '',
      personalPhone: user.personal_phone || '',
      confirmed: !!info.portal_identity_confirmed
    },
    systems: [
      {
        key: 'email',
        label: 'Company email',
        username: user.work_email || user.email || null,
        hasTempPassword: !!info.workspace_temp_password,
        tempPasswordAvailable: !!info.workspace_temp_password && !wsRevealed,
        tempPasswordConsumed: wsRevealed,
        acknowledged: !!info.portal_acked_email
      },
      ...(user.status === 'ONBOARDING'
        ? [
            {
              key: 'grasshopper',
              label: 'Grasshopper',
              username: info.grasshopper_login || null,
              extension: info.grasshopper_extension || null,
              pinAvailable: !!info.grasshopper_pin,
              pin: info.grasshopper_pin || null,
              hasTempPassword: false,
              acknowledged: !!info.portal_acked_grasshopper
            },
            {
              key: 'therapynotes',
              label: 'TherapyNotes',
              username: info.therapynotes_login || null,
              hasTempPassword: !!info.therapynotes_temp_password,
              tempPasswordAvailable: !!info.therapynotes_temp_password && !tnRevealed,
              tempPasswordConsumed: tnRevealed,
              acknowledged: !!info.portal_acked_therapynotes
            }
          ]
        : [])
    ]
  };
}

export async function confirmPortalIdentity(userId, { legalFirstName, legalLastName, personalPhone } = {}) {
  if (legalFirstName != null) {
    await pool.execute(`UPDATE users SET first_name = ? WHERE id = ?`, [String(legalFirstName).trim(), userId]);
  }
  if (legalLastName != null) {
    await pool.execute(`UPDATE users SET last_name = ? WHERE id = ?`, [String(legalLastName).trim(), userId]);
  }
  if (personalPhone != null) {
    try {
      await pool.execute(`UPDATE users SET personal_phone = ? WHERE id = ?`, [String(personalPhone).trim() || null, userId]);
    } catch {
      /* ignore */
    }
  }
  await setUserInfoValue(userId, 'portal_identity_confirmed', new Date().toISOString());
  try { await syncLifecycleItems(userId); } catch { /* ignore */ }
  return getCredentialPacketForPortal(userId);
}

export async function acknowledgePortalSystem(userId, systemKey) {
  const map = {
    email: 'portal_acked_email',
    grasshopper: 'portal_acked_grasshopper',
    therapynotes: 'portal_acked_therapynotes'
  };
  const field = map[String(systemKey || '').toLowerCase()];
  if (!field) throw Object.assign(new Error('Invalid system key'), { status: 400 });
  await setUserInfoValue(userId, field, new Date().toISOString());
  try { await syncLifecycleItems(userId); } catch { /* ignore */ }
  return getCredentialPacketForPortal(userId);
}

export async function revealPortalTempPassword(userId, systemKey) {
  const key = String(systemKey || '').toLowerCase();
  const info = await getUserInfoMap(userId);
  if (key === 'email' || key === 'workspace') {
    if (info.workspace_temp_password_revealed) {
      return { revealed: false, reason: 'already_revealed', password: null };
    }
    const password = info.workspace_temp_password || null;
    if (!password) return { revealed: false, reason: 'not_set', password: null };
    await setUserInfoValue(userId, 'workspace_temp_password_revealed', new Date().toISOString());
    return { revealed: true, password };
  }
  if (key === 'therapynotes') {
    if (info.therapynotes_temp_password_revealed) {
      return { revealed: false, reason: 'already_revealed', password: null };
    }
    const password = info.therapynotes_temp_password || null;
    if (!password) return { revealed: false, reason: 'not_set', password: null };
    await setUserInfoValue(userId, 'therapynotes_temp_password_revealed', new Date().toISOString());
    return { revealed: true, password };
  }
  throw Object.assign(new Error('Invalid system key for temp password'), { status: 400 });
}

export default {
  getLifecycleCredentials,
  saveLifecycleCredentials,
  getCredentialPacketForPortal,
  confirmPortalIdentity,
  acknowledgePortalSystem,
  revealPortalTempPassword
};
