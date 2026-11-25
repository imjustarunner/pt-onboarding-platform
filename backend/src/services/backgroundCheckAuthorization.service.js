/**
 * Encrypted background-check authorization capture (SSN / DL at rest).
 */
import pool from '../config/database.js';
import {
  encryptGuardianIntake,
  decryptGuardianIntake,
  isGuardianIntakeEncryptionConfigured
} from './guardianIntakeEncryption.service.js';

const last4 = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const mask = (value) => {
  const four = last4(value);
  return four ? `***${four}` : '—';
};

export function isBackgroundCheckEncryptionConfigured() {
  return isGuardianIntakeEncryptionConfigured();
}

export function prepareBackgroundCheckAuthorization({ payload, signerName }) {
  if (!isGuardianIntakeEncryptionConfigured()) {
    const err = new Error('Background check encryption is not configured');
    err.status = 503;
    throw err;
  }
  if (!/^data:image\/(png|jpeg);base64,/.test(String(payload?.signatureData || ''))) {
    throw Object.assign(new Error('A captured signature is required for authorization.'), { status: 400 });
  }
  const ssn = String(payload?.ssn || '').replace(/\D/g, '');
  const dl = String(payload?.driversLicense || payload?.dlNumber || '').trim();
  const address = payload?.homeAddress;
  const homeAddress = address && typeof address === 'object' && !Array.isArray(address) ? {
    street: String(address.street || '').trim().slice(0, 255),
    line2: String(address.line2 || '').trim().slice(0, 255),
    city: String(address.city || '').trim().slice(0, 100),
    state: String(address.state || '').trim().toUpperCase().slice(0, 2),
    postalCode: String(address.postalCode || '').trim().slice(0, 15)
  } : null;
  if (homeAddress && (!homeAddress.street || !homeAddress.city || !/^[A-Z]{2}$/.test(homeAddress.state) || !/^\d{5}(?:-\d{4})?$/.test(homeAddress.postalCode))) {
    throw Object.assign(new Error('Enter the street, city, two-letter state, and ZIP code for your current address.'), { status: 400 });
  }
  const toStore = {
    legalName: String(payload?.legalName || signerName || '').trim().slice(0, 255),
    dateOfBirth: String(payload?.dateOfBirth || '').trim(),
    ssn,
    driversLicense: dl,
    currentAddress: homeAddress
      ? [homeAddress.street, homeAddress.line2, homeAddress.city, `${homeAddress.state} ${homeAddress.postalCode}`].filter(Boolean).join(', ')
      : String(payload?.currentAddress || '').trim(),
    ...(homeAddress ? { homeAddress } : {}),
    previousAddresses: String(payload?.previousAddresses || '').trim(),
    aliases: String(payload?.aliases || '').trim(),
    otherNames: String(payload?.otherNames || '').trim(),
    signatureData: String(payload?.signatureData || '').trim()
  };
  const enc = encryptGuardianIntake(JSON.stringify(toStore));
  const ssnLast4 = last4(ssn);
  const dlLast4 = last4(dl);
  const signedBy = toStore.legalName;
  return {
    encrypted: enc, homeAddress, profile: { full_legal_name: toStore.legalName, date_of_birth: toStore.dateOfBirth, mailing_address: toStore.currentAddress },
    summary: { signed: true, ssnLast4, dlLast4, ssnMasked: mask(ssn), dlMasked: mask(dl), signerName: signedBy }
  };
}

export async function saveBackgroundCheckAuthorization({ userId, agencyId, prepared }, db = pool) {
  const { encrypted: enc, summary } = prepared;
  await db.execute(
    `INSERT INTO hiring_background_check_authorizations (
      user_id, agency_id, ciphertext_b64, iv_b64, auth_tag_b64, key_id,
      ssn_last4, dl_last4, signed_at, signer_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       ciphertext_b64 = VALUES(ciphertext_b64),
       iv_b64 = VALUES(iv_b64),
       auth_tag_b64 = VALUES(auth_tag_b64),
       key_id = VALUES(key_id),
       ssn_last4 = VALUES(ssn_last4),
       dl_last4 = VALUES(dl_last4),
       signed_at = NOW(),
       signer_name = VALUES(signer_name)`,
    [
      userId,
      agencyId,
      enc.ciphertextB64,
      enc.ivB64,
      enc.authTagB64,
      enc.keyId,
      summary.ssnLast4,
      summary.dlLast4,
      summary.signerName || null
    ]
  );
  return summary;
}

export async function getBackgroundCheckAuthorizationSummary(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT ssn_last4, dl_last4, signed_at, signer_name
     FROM hiring_background_check_authorizations
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [userId, agencyId]
  );
  const row = rows[0];
  if (!row) return { signed: false };
  return {
    signed: true,
    ssnMasked: row.ssn_last4 ? `***${row.ssn_last4}` : '—',
    dlMasked: row.dl_last4 ? `***${row.dl_last4}` : '—',
    signedAt: row.signed_at,
    signerName: row.signer_name || null
  };
}

export async function decryptBackgroundCheckAuthorization(userId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT ciphertext_b64, iv_b64, auth_tag_b64
     FROM hiring_background_check_authorizations
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [userId, agencyId]
  );
  const row = rows[0];
  if (!row) return null;
  const json = decryptGuardianIntake({
    ciphertextB64: row.ciphertext_b64,
    ivB64: row.iv_b64,
    authTagB64: row.auth_tag_b64
  });
  return JSON.parse(json);
}

function formatSsn(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length !== 9) return d || null;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export async function listBackgroundCheckAccessLog(userId, agencyId, { limit = 25 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  try {
    const [rows] = await pool.execute(
      `SELECT l.viewer_user_id, l.viewed_at, l.ip_address,
              u.first_name, u.last_name, u.email
       FROM hiring_background_check_access_log l
       LEFT JOIN users u ON u.id = l.viewer_user_id
       WHERE l.user_id = ? AND l.agency_id = ?
       ORDER BY l.viewed_at DESC, l.id DESC
       LIMIT ${lim}`,
      [userId, agencyId]
    );
    return (rows || []).map((r) => ({
      viewerUserId: r.viewer_user_id,
      viewedAt: r.viewed_at,
      viewerName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.viewer_user_id}`,
      ipAddress: r.ip_address || null
    }));
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

/**
 * Decrypt SSN/DL for an authorized staff viewer. Full values are never written to logs.
 */
export async function revealBackgroundCheckAuthorization({
  userId,
  agencyId,
  viewerUserId,
  ipAddress = null
}) {
  const payload = await decryptBackgroundCheckAuthorization(userId, agencyId);
  if (!payload) return null;
  try {
    await pool.execute(
      `INSERT INTO hiring_background_check_access_log (user_id, agency_id, viewer_user_id, ip_address)
       VALUES (?, ?, ?, ?)`,
      [userId, agencyId, viewerUserId, ipAddress ? String(ipAddress).slice(0, 64) : null]
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  try {
    const AdminAuditLog = (await import('../models/AdminAuditLog.model.js')).default;
    await AdminAuditLog.logAction({
      actionType: 'background_check_ssn_viewed',
      actorUserId: viewerUserId,
      targetUserId: userId,
      agencyId,
      metadata: { last4: last4(payload.ssn), field: 'ssn_dl' }
    });
  } catch {
    /* enum may not include this action yet — dedicated access log is the source of truth */
  }
  return {
    legalName: payload.legalName || null,
    dateOfBirth: payload.dateOfBirth || null,
    currentAddress: payload.currentAddress || null,
    previousAddresses: payload.previousAddresses || null,
    aliases: payload.aliases || payload.otherNames || null,
    ssn: formatSsn(payload.ssn),
    driversLicense: payload.driversLicense || null,
    ssnMasked: mask(payload.ssn),
    dlMasked: mask(payload.driversLicense)
  };
}
