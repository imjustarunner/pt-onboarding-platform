import pool from '../config/database.js';
import { decryptGuardianIntake, encryptGuardianIntake } from '../services/guardianIntakeEncryption.service.js';

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function normalizeProfile(profile = {}) {
  const firstName = String(profile?.firstName || '').trim() || null;
  const lastName = String(profile?.lastName || '').trim() || null;
  const fullName = String(profile?.fullName || `${firstName || ''} ${lastName || ''}` || '').trim() || null;
  const email = String(profile?.email || '').trim().toLowerCase() || null;
  const phone = String(profile?.phone || '').trim() || null;
  const relationship = String(profile?.relationship || '').trim() || null;
  const dateOfBirth = normalizeDateOnly(profile?.dateOfBirth || profile?.dob || null);
  const primaryLanguage = String(profile?.primaryLanguage || profile?.primary_language || '').trim() || null;
  return {
    firstName,
    lastName,
    fullName,
    email,
    phone,
    relationship,
    dateOfBirth,
    primaryLanguage
  };
}

class ClientGuardianIntakeProfile {
  static async upsertForClient({ clientId, profile, source = 'public_intake' }) {
    const cid = Number(clientId || 0);
    if (!cid) return null;
    const normalized = normalizeProfile(profile);
    const hasAny = Object.values(normalized).some((value) => String(value || '').trim());
    if (!hasAny) return null;

    const payload = JSON.stringify(normalized);
    const enc = encryptGuardianIntake(payload);
    await pool.execute(
      `INSERT INTO client_guardian_intake_profiles
        (client_id, profile_encrypted, encryption_iv_b64, encryption_auth_tag_b64, encryption_key_id, source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         profile_encrypted = VALUES(profile_encrypted),
         encryption_iv_b64 = VALUES(encryption_iv_b64),
         encryption_auth_tag_b64 = VALUES(encryption_auth_tag_b64),
         encryption_key_id = VALUES(encryption_key_id),
         source = VALUES(source),
         updated_at = CURRENT_TIMESTAMP`,
      [cid, enc.ciphertextB64, enc.ivB64, enc.authTagB64, enc.keyId, String(source || 'public_intake').slice(0, 50)]
    );
    if (normalized.dateOfBirth) {
      try {
        await pool.execute(`UPDATE clients SET date_of_birth = ? WHERE id = ?`, [normalized.dateOfBirth, cid]);
      } catch {
        // Older DBs without date_of_birth — ignore
      }
    }
    return this.findByClientId(cid);
  }

  static async mergeEmailForClient({ clientId, email, source = 'roi_email_sent' }) {
    const cid = Number(clientId || 0);
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!cid || !emailNorm || !emailNorm.includes('@')) return null;
    const existing = await this.findByClientId(cid);
    const merged = existing
      ? { ...existing, email: emailNorm }
      : { email: emailNorm, firstName: null, lastName: null, fullName: null, phone: null, relationship: null, dateOfBirth: null };
    return this.upsertForClient({ clientId: cid, profile: merged, source });
  }

  static async findByClientId(clientId) {
    const cid = Number(clientId || 0);
    if (!cid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM client_guardian_intake_profiles
       WHERE client_id = ?
       LIMIT 1`,
      [cid]
    );
    const row = rows?.[0];
    if (!row) return null;

    let profileJson = null;
    try {
      if (row.encryption_iv_b64 && row.encryption_auth_tag_b64) {
        profileJson = decryptGuardianIntake({
          ciphertextB64: row.profile_encrypted,
          ivB64: row.encryption_iv_b64,
          authTagB64: row.encryption_auth_tag_b64
        });
      } else {
        profileJson = row.profile_encrypted || null;
      }
    } catch {
      profileJson = null;
    }

    let parsed = null;
    try {
      parsed = profileJson ? JSON.parse(String(profileJson)) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      ...normalizeProfile(parsed),
      source: row.source || null,
      updated_at: row.updated_at || null
    };
  }
}

export default ClientGuardianIntakeProfile;

