import pool from '../config/database.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import User from '../models/User.model.js';
import { isFullyLicensedCredentialText } from '../utils/credentialNormalization.js';

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

  return { ok: true };
}
