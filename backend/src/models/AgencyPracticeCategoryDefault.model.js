import pool from '../config/database.js';
import { PRACTICE_CATEGORY_CODES } from './UserAgencyPracticeCategory.model.js';

/** Audience keys for tenant practice-category defaults (mirrors indirect assign groups). */
export const PRACTICE_CATEGORY_AUDIENCE_KEYS = [
  'providers',
  'provider',
  'provider_plus',
  'supervisors',
  'clinical_practice_assistant',
  'all_clinical'
];

export const PRACTICE_CATEGORY_AUDIENCE_LABELS = {
  providers: 'All providers (provider + provider+)',
  provider: 'Providers',
  provider_plus: 'Provider+',
  supervisors: 'Supervisors',
  clinical_practice_assistant: 'Clinical practice assistants',
  all_clinical: 'All clinical staff (providers, CPA, supervisors)'
};

class AgencyPracticeCategoryDefault {
  static normalizeAudience(raw) {
    const t = String(raw || '').trim().toLowerCase();
    return PRACTICE_CATEGORY_AUDIENCE_KEYS.includes(t) ? t : null;
  }

  static normalizeCategory(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (t === 'healthcare') return 'mental_health';
    return PRACTICE_CATEGORY_CODES.includes(t) ? t : null;
  }

  static mapRow(r) {
    if (!r) return null;
    return {
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      category: String(r.category),
      audienceKey: String(r.audience_key),
      isEnabled: Number(r.is_enabled) === 1
    };
  }

  static async listForAgency(agencyId, { includeDisabled = false } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT id, agency_id, category, audience_key, is_enabled
       FROM agency_practice_category_defaults
       WHERE agency_id = ?
         ${includeDisabled ? '' : 'AND is_enabled = 1'}
       ORDER BY category ASC, audience_key ASC`,
      [aid]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  /**
   * Replace all defaults for an agency with the given list.
   * @param {number} agencyId
   * @param {Array<{ category: string, audienceKey: string, isEnabled?: boolean }>} defaults
   */
  static async replaceForAgency(agencyId, defaults = []) {
    const aid = Number(agencyId || 0);
    if (!aid) throw new Error('Invalid agencyId');

    const wanted = [];
    const seen = new Set();
    for (const raw of defaults || []) {
      const category = this.normalizeCategory(raw?.category);
      const audienceKey = this.normalizeAudience(raw?.audienceKey || raw?.audience_key);
      if (!category || !audienceKey) continue;
      const key = `${category}::${audienceKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isEnabled = raw?.isEnabled !== false && Number(raw?.is_enabled) !== 0;
      wanted.push({ category, audienceKey, isEnabled });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE agency_practice_category_defaults
         SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?`,
        [aid]
      );
      for (const row of wanted) {
        await conn.execute(
          `INSERT INTO agency_practice_category_defaults
             (agency_id, category, audience_key, is_enabled)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_enabled = VALUES(is_enabled),
             updated_at = CURRENT_TIMESTAMP`,
          [aid, row.category, row.audienceKey, row.isEnabled ? 1 : 0]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return this.listForAgency(aid, { includeDisabled: true });
  }

  /** Upsert a single default row without clearing others. */
  static async upsertOne(agencyId, { category, audienceKey, isEnabled = true }) {
    const aid = Number(agencyId || 0);
    const cat = this.normalizeCategory(category);
    const aud = this.normalizeAudience(audienceKey);
    if (!aid || !cat || !aud) throw new Error('Invalid agencyId, category, or audienceKey');
    await pool.execute(
      `INSERT INTO agency_practice_category_defaults
         (agency_id, category, audience_key, is_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled = VALUES(is_enabled),
         updated_at = CURRENT_TIMESTAMP`,
      [aid, cat, aud, isEnabled ? 1 : 0]
    );
    return this.listForAgency(aid, { includeDisabled: true });
  }
}

export default AgencyPracticeCategoryDefault;
