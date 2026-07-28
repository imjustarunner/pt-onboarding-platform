import pool from '../config/database.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import User from '../models/User.model.js';
import { isFullyLicensedCredentialText } from '../utils/credentialNormalization.js';
import {
  LICENSE_FIELD_ALIAS_GROUPS,
  allKeysInLicenseAliasGroup,
  pickBestLicenseGroupEntry,
} from '../utils/licenseFieldAliases.js';

async function fieldDefIdForKey(fieldKey) {
  const key = String(fieldKey || '').trim();
  if (!key) return null;
  const [rows] = await pool.execute(
    'SELECT id FROM user_info_field_definitions WHERE field_key = ? LIMIT 1',
    [key]
  );
  return rows[0]?.id || null;
}

async function firstFieldDefId(keys) {
  for (const k of keys || []) {
    const id = await fieldDefIdForKey(k);
    if (id) return id;
  }
  return null;
}

function leadingLicenseToken(licenseTypeNumber) {
  const s = String(licenseTypeNumber || '').trim();
  if (!s) return '';
  const m = s.match(/^([A-Za-z][A-Za-z.\s-]{0,12})/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : s.split(/[\s,#]/)[0] || '';
}

/**
 * Mirror a license PDF upload into user_info_values.license_upload and optionally
 * sync users.credential from license type/number when credential is blank.
 */
export async function syncLicenseUploadToProfile(userId, filePath, { expirationDate = null } = {}) {
  const uid = Number(userId);
  if (!uid || !filePath) return { ok: false };

  const uploadFieldId = await fieldDefIdForKey('license_upload');
  if (uploadFieldId) {
    await UserInfoValue.bulkUpdate(uid, [{ fieldDefinitionId: uploadFieldId, value: filePath }]);
  }

  if (expirationDate) {
    const expFieldId = await firstFieldDefId([
      'provider_credential_license_expiration_date',
      'license_expires'
    ]);
    if (expFieldId) {
      const iso = expirationDate instanceof Date
        ? expirationDate.toISOString().slice(0, 10)
        : String(expirationDate).slice(0, 10);
      await UserInfoValue.bulkUpdate(uid, [{ fieldDefinitionId: expFieldId, value: iso }]);
    }
  }

  // If credential is empty, derive from license type/number field when fully licensed
  try {
    const user = await User.findById(uid);
    const existingCred = String(user?.credential || '').trim();
    if (!existingCred) {
      const typeFieldId = await firstFieldDefId([
        'provider_credential_license_type_number',
        'license_type_number'
      ]);
      if (typeFieldId) {
        const [rows] = await pool.execute(
          'SELECT value FROM user_info_values WHERE user_id = ? AND field_definition_id = ? LIMIT 1',
          [uid, typeFieldId]
        );
        const licenseTypeNumber = String(rows[0]?.value || '').trim();
        const derived = leadingLicenseToken(licenseTypeNumber) || licenseTypeNumber;
        if (derived && isFullyLicensedCredentialText(derived)) {
          await pool.execute('UPDATE users SET credential = ? WHERE id = ?', [derived, uid]);
        }
      }
    }
  } catch {
    // non-fatal
  }

  await consolidateLicenseFieldAliasesForUser(uid).catch(() => null);
  return { ok: true };
}

function isMeaningfulLicenseValue(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  return Boolean(s) && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
}

/**
 * Merge duplicate license EAV rows (legacy + canonical keys) — most recent meaningful value wins.
 * Writes canonical key and deletes alias rows.
 */
export async function consolidateLicenseFieldAliasesForUser(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return { consolidated: 0 };

  const [rows] = await pool.execute(
    `SELECT uiv.id, uiv.value, uiv.updated_at, uifd.field_key, uifd.field_type
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ?
       AND uifd.field_key IN (
         'provider_credential_license_type_number',
         'license_type_number',
         'license_type_and_number',
         'provider_credential_license_issued_date',
         'license_issued',
         'license_issued_date',
         'provider_credential_license_expiration_date',
         'license_expires',
         'license_expiration_date',
         'license_expires_date'
       )`,
    [uid]
  );

  const valueByKey = new Map();
  const metaByKey = new Map();
  for (const row of rows || []) {
    const k = String(row.field_key || '').trim();
    if (!k) continue;
    const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const fieldType = String(row.field_type || '');
    const meaningful = isMeaningfulLicenseValue(row.value);
    const existing = metaByKey.get(k);
    if (
      !existing ||
      (meaningful && !existing.meaningful) ||
      (meaningful &&
        existing.meaningful &&
        (updatedAtMs > existing.updatedAtMs ||
          (updatedAtMs === existing.updatedAtMs && Number(row.id) > existing.id)))
    ) {
      valueByKey.set(k, row.value);
      metaByKey.set(k, {
        id: Number(row.id),
        updatedAtMs,
        fieldType,
        meaningful,
      });
    }
  }

  let consolidated = 0;
  for (const group of LICENSE_FIELD_ALIAS_GROUPS) {
    const keys = allKeysInLicenseAliasGroup(group);
    const best = pickBestLicenseGroupEntry(keys, {
      valueByKey,
      metaByKey,
      isMeaningful: isMeaningfulLicenseValue,
    });
    if (!best) continue;

    const canonicalDefId = await fieldDefIdForKey(group.canonical);
    if (!canonicalDefId) continue;

    await UserInfoValue.createOrUpdate(uid, canonicalDefId, best.value);
    consolidated += 1;

    for (const alias of group.aliases || []) {
      await pool.execute(
        `DELETE uiv
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
         WHERE uiv.user_id = ? AND uifd.field_key = ?`,
        [uid, alias]
      );
    }
  }

  return { consolidated };
}
