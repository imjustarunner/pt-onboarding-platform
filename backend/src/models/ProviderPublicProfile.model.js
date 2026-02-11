import pool from '../config/database.js';

function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

class ProviderPublicProfile {
  static async getForProvider({ providerUserId }) {
    const userId = toInt(providerUserId);
    if (!userId) return null;
    const [rows] = await pool.execute(
      `SELECT user_id, public_blurb, insurances_json, self_pay_rate_cents, self_pay_rate_note, accepting_new_clients_override
       FROM provider_public_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    let insurances = [];
    try {
      const raw = row.insurances_json;
      if (typeof raw === 'string') insurances = JSON.parse(raw || '[]');
      else if (Array.isArray(raw)) insurances = raw;
    } catch {
      insurances = [];
    }
    return {
      userId,
      publicBlurb: row.public_blurb || '',
      insurances: Array.isArray(insurances) ? insurances : [],
      selfPayRateCents: row.self_pay_rate_cents === null ? null : Number(row.self_pay_rate_cents),
      selfPayRateNote: row.self_pay_rate_note || '',
      acceptingNewClientsOverride: row.accepting_new_clients_override === null
        ? null
        : !!row.accepting_new_clients_override
    };
  }

  static async upsertForProvider({
    providerUserId,
    publicBlurb = null,
    insurances = [],
    selfPayRateCents = null,
    selfPayRateNote = null,
    acceptingNewClientsOverride = null
  }) {
    const userId = toInt(providerUserId);
    if (!userId) throw new Error('Invalid providerUserId');
    const cleanInsurances = Array.isArray(insurances)
      ? insurances
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 80)
      : [];
    const normalizedRate = selfPayRateCents === null || selfPayRateCents === undefined || selfPayRateCents === ''
      ? null
      : Math.max(0, Number.parseInt(selfPayRateCents, 10) || 0);
    const normalizedOverride = acceptingNewClientsOverride === null || acceptingNewClientsOverride === undefined
      ? null
      : !!acceptingNewClientsOverride;

    await pool.execute(
      `INSERT INTO provider_public_profiles
        (user_id, public_blurb, insurances_json, self_pay_rate_cents, self_pay_rate_note, accepting_new_clients_override)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         public_blurb = VALUES(public_blurb),
         insurances_json = VALUES(insurances_json),
         self_pay_rate_cents = VALUES(self_pay_rate_cents),
         self_pay_rate_note = VALUES(self_pay_rate_note),
         accepting_new_clients_override = VALUES(accepting_new_clients_override),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        publicBlurb === null || publicBlurb === undefined ? null : String(publicBlurb).trim(),
        JSON.stringify(cleanInsurances),
        normalizedRate,
        selfPayRateNote === null || selfPayRateNote === undefined ? null : String(selfPayRateNote).trim(),
        normalizedOverride
      ]
    );
    return this.getForProvider({ providerUserId: userId });
  }

  static async getAgencySettings({ agencyId }) {
    const aid = toInt(agencyId);
    if (!aid) return null;
    const [rows] = await pool.execute(
      `SELECT agency_id, finder_intro_blurb, default_self_pay_rate_cents, default_self_pay_rate_note
       FROM agency_provider_portal_settings
       WHERE agency_id = ?
       LIMIT 1`,
      [aid]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      agencyId: aid,
      finderIntroBlurb: row.finder_intro_blurb || '',
      defaultSelfPayRateCents: row.default_self_pay_rate_cents === null ? null : Number(row.default_self_pay_rate_cents),
      defaultSelfPayRateNote: row.default_self_pay_rate_note || ''
    };
  }

  static async upsertAgencySettings({
    agencyId,
    finderIntroBlurb = null,
    defaultSelfPayRateCents = null,
    defaultSelfPayRateNote = null,
    updatedByUserId = null
  }) {
    const aid = toInt(agencyId);
    if (!aid) throw new Error('Invalid agencyId');
    const normalizedRate = defaultSelfPayRateCents === null || defaultSelfPayRateCents === undefined || defaultSelfPayRateCents === ''
      ? null
      : Math.max(0, Number.parseInt(defaultSelfPayRateCents, 10) || 0);
    await pool.execute(
      `INSERT INTO agency_provider_portal_settings
        (agency_id, finder_intro_blurb, default_self_pay_rate_cents, default_self_pay_rate_note, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         finder_intro_blurb = VALUES(finder_intro_blurb),
         default_self_pay_rate_cents = VALUES(default_self_pay_rate_cents),
         default_self_pay_rate_note = VALUES(default_self_pay_rate_note),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        aid,
        finderIntroBlurb === null || finderIntroBlurb === undefined ? null : String(finderIntroBlurb).trim(),
        normalizedRate,
        defaultSelfPayRateNote === null || defaultSelfPayRateNote === undefined ? null : String(defaultSelfPayRateNote).trim(),
        toInt(updatedByUserId)
      ]
    );
    return this.getAgencySettings({ agencyId: aid });
  }
}

export default ProviderPublicProfile;
