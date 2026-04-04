import pool from '../config/database.js';
import {
  buildParticipationAgreementHash,
  normalizeParticipationAgreement
} from '../utils/seasonParticipationAgreement.js';

const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const parseJsonMaybe = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

class ChallengeSeasonParticipationAcceptance {
  static async findCurrent({ classId, providerUserId, agreement }) {
    const learningClassId = toInt(classId);
    const userId = toInt(providerUserId);
    if (!learningClassId || !userId || !agreement) return null;
    const agreementHash = buildParticipationAgreementHash(agreement);
    const [rows] = await pool.execute(
      `SELECT *
       FROM challenge_season_participation_acceptances
       WHERE learning_class_id = ?
         AND provider_user_id = ?
         AND agreement_hash = ?
       ORDER BY accepted_at DESC, id DESC
       LIMIT 1`,
      [learningClassId, userId, agreementHash]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      ...row,
      agreement_snapshot_json: parseJsonMaybe(row.agreement_snapshot_json)
    };
  }

  static async accept({
    classId,
    providerUserId,
    agreement,
    signatureName,
    ipAddress = null,
    userAgent = null
  }) {
    const learningClassId = toInt(classId);
    const userId = toInt(providerUserId);
    if (!learningClassId || !userId || !agreement) return null;
    const normalizedAgreement = normalizeParticipationAgreement(agreement);
    const agreementHash = buildParticipationAgreementHash(normalizedAgreement);
    const [result] = await pool.execute(
      `INSERT INTO challenge_season_participation_acceptances
       (learning_class_id, provider_user_id, agreement_hash, agreement_snapshot_json, signature_name, accepted_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         agreement_snapshot_json = VALUES(agreement_snapshot_json),
         signature_name = VALUES(signature_name),
         accepted_at = VALUES(accepted_at),
         ip_address = VALUES(ip_address),
         user_agent = VALUES(user_agent),
         updated_at = CURRENT_TIMESTAMP`,
      [
        learningClassId,
        userId,
        agreementHash,
        JSON.stringify(normalizedAgreement),
        String(signatureName || '').trim(),
        ipAddress || null,
        userAgent || null
      ]
    );
    const accepted = await this.findCurrent({
      classId: learningClassId,
      providerUserId: userId,
      agreement: normalizedAgreement
    });
    return accepted || { id: result?.insertId || null, agreement_hash: agreementHash };
  }

  static async listCurrentStatusForMembers({ classId, providerUserIds = [], agreement }) {
    const learningClassId = toInt(classId);
    if (!learningClassId || !agreement || !Array.isArray(providerUserIds) || !providerUserIds.length) return new Map();
    const ids = providerUserIds
      .map((value) => toInt(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!ids.length) return new Map();
    const agreementHash = buildParticipationAgreementHash(agreement);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT provider_user_id, signature_name, accepted_at
       FROM challenge_season_participation_acceptances
       WHERE learning_class_id = ?
         AND agreement_hash = ?
         AND provider_user_id IN (${placeholders})`,
      [learningClassId, agreementHash, ...ids]
    );
    return new Map((rows || []).map((row) => [
      Number(row.provider_user_id),
      {
        accepted: true,
        signatureName: row.signature_name || null,
        acceptedAt: row.accepted_at || null
      }
    ]));
  }
}

export default ChallengeSeasonParticipationAcceptance;
