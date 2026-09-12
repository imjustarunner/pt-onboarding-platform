import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../services/familyBillingEncryption.service.js';

export const INSURANCE_FIELDS = ['insurer_name', 'member_id', 'group_number', 'subscriber_name', 'is_medicaid', 'card_front_url', 'card_back_url'];
export const PRIVATE_INSURANCE_COLUMNS = ['primary', 'secondary'].flatMap(p => INSURANCE_FIELDS.map(f => `${p}_${f}`)).concat('notes');
const context = row => `insurance:${row.agency_id}:${row.guardian_user_id}`;
export function decodeInsuranceProfile(row) {
  if (!row) return null;
  const result = { ...row, ...(decryptFamilyBilling(row.private_payload, context(row)) || {}) };
  delete result.private_payload;
  return result;
}
export function insurancePayload({ primary = {}, secondary = null, primaryCardFrontUrl, primaryCardBackUrl, secondaryCardFrontUrl, secondaryCardBackUrl, ...extra }) {
  const value = { ...extra, primary, secondary };
  for (const [prefix, data] of [['primary', primary], ['secondary', secondary || {}]]) {
    Object.assign(value, { [`${prefix}_insurer_name`]: data.insurerName || null, [`${prefix}_member_id`]: data.memberId || null, [`${prefix}_group_number`]: data.groupNumber || null, [`${prefix}_subscriber_name`]: data.subscriberName || null, [`${prefix}_is_medicaid`]: data.isMedicaid ? 1 : 0 });
  }
  Object.assign(value, { primary_card_front_url: primaryCardFrontUrl || null, primary_card_back_url: primaryCardBackUrl || null, secondary_card_front_url: secondaryCardFrontUrl || null, secondary_card_back_url: secondaryCardBackUrl || null });
  return value;
}
export default class GuardianInsuranceProfile {
  static async upsert(input, connection = null) {
    if (!connection) {
      const db = await pool.getConnection();
      try { await db.beginTransaction(); const id = await this.upsert(input, db); await db.commit(); return id; }
      catch (e) { await db.rollback(); throw e; } finally { db.release(); }
    }
    const db = connection;
    const { guardianUserId, clientId = null, agencyId, intakeSubmissionId = null, profileId = null, createNew = false, ...data } = input;
    if (!guardianUserId || !agencyId) throw new Error('Insurance owner and agency are required');
    // An unassigned record is never silently converted into a different child's policy.
    const [existing] = createNew ? [[]] : await db.execute(`SELECT * FROM guardian_insurance_profiles WHERE guardian_user_id = ? AND agency_id = ? AND ${profileId ? 'id = ?' : 'client_id <=> ?'} ORDER BY id DESC LIMIT 1 FOR UPDATE`, [guardianUserId, agencyId, profileId || clientId]);
    if (profileId && !existing.length) throw new Error('Insurance profile not found');
    const previous = decodeInsuranceProfile(existing[0]);
    const payload = insurancePayload(data);
    for (const key of ['primary_card_front_url', 'primary_card_back_url', 'secondary_card_front_url', 'secondary_card_back_url']) if (!payload[key] && previous?.[key] && previous.primary?.memberId === payload.primary?.memberId && previous.primary?.insurerName === payload.primary?.insurerName && previous.secondary?.memberId === payload.secondary?.memberId) payload[key] = previous[key];
    const encrypted = encryptFamilyBilling(payload, `insurance:${agencyId}:${guardianUserId}`);
    if (existing[0]) {
      await db.execute(`UPDATE guardian_insurance_profiles SET private_payload = ?, client_id = ?, intake_submission_id = COALESCE(?, intake_submission_id), ${PRIVATE_INSURANCE_COLUMNS.map(c => `${c} = ${c.endsWith('_is_medicaid') ? '0' : 'NULL'}`).join(', ')} WHERE id = ? AND agency_id = ? AND guardian_user_id = ?`, [encrypted, clientId, intakeSubmissionId, existing[0].id, agencyId, guardianUserId]);
      return existing[0].id;
    }
    const [result] = await db.execute('INSERT INTO guardian_insurance_profiles (guardian_user_id, client_id, agency_id, intake_submission_id, private_payload) VALUES (?, ?, ?, ?, ?)', [guardianUserId, clientId, agencyId, intakeSubmissionId, encrypted]);
    return result.insertId;
  }
  static async findByGuardian(guardianUserId, agencyId) {
    const [rows] = await pool.execute('SELECT * FROM guardian_insurance_profiles WHERE guardian_user_id = ? AND agency_id = ? ORDER BY collected_at DESC', [guardianUserId, agencyId]);
    return rows.map(decodeInsuranceProfile);
  }
  static async updateCardUrls(guardianUserId, agencyId, urls = {}) {
    // Callers must identify the policy; "latest for guardian" can overwrite a sibling.
    if (!urls.profileId) throw new Error('Insurance profileId is required');
    const [rows] = await pool.execute('SELECT * FROM guardian_insurance_profiles WHERE id = ? AND guardian_user_id = ? AND agency_id = ?', [urls.profileId, guardianUserId, agencyId]);
    if (!rows[0]) throw new Error('Insurance profile not found');
    const value = decodeInsuranceProfile(rows[0]);
    for (const [from, to] of Object.entries({ primaryCardFrontUrl: 'primary_card_front_url', primaryCardBackUrl: 'primary_card_back_url', secondaryCardFrontUrl: 'secondary_card_front_url', secondaryCardBackUrl: 'secondary_card_back_url' })) if (urls[from] !== undefined) value[to] = urls[from];
    await pool.execute('UPDATE guardian_insurance_profiles SET private_payload = ? WHERE id = ?', [encryptFamilyBilling(value, context(rows[0])), rows[0].id]);
  }
}
