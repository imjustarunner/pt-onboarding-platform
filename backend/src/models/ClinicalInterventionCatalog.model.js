import pool from '../config/database.js';
import { CLINICAL_INTERVENTION_SEED } from '../config/clinicalInterventionSeed.js';

function normalizeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

class ClinicalInterventionCatalog {
  static async listMerged({ agencyId, userId } = {}) {
    const aId = Number(agencyId || 0);
    const uId = Number(userId || 0);
    const agency = [];
    const user = [];
    if (aId) {
      try {
        const [rows] = await pool.execute(
          `SELECT id, agency_id, user_id, name, is_active
           FROM clinical_intervention_catalog
           WHERE agency_id = ? AND is_active = 1
             AND (user_id = 0 OR user_id = ?)
           ORDER BY user_id ASC, name ASC`,
          [aId, uId || 0]
        );
        for (const r of rows || []) {
          const item = { id: r.id, name: r.name, userId: Number(r.user_id || 0) };
          if (item.userId === 0) agency.push(item);
          else user.push(item);
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    const all = [...new Set([
      ...CLINICAL_INTERVENTION_SEED,
      ...agency.map((r) => r.name),
      ...user.map((r) => r.name)
    ].map(normalizeName).filter(Boolean))];
    all.sort((a, b) => a.localeCompare(b));
    return { seed: CLINICAL_INTERVENTION_SEED, agency, user, all };
  }

  static async add({ agencyId, userId = 0, name, createdByUserId = null } = {}) {
    const aId = Number(agencyId || 0);
    const uId = Number(userId || 0);
    const label = normalizeName(name);
    if (!aId || !label) return null;
    await pool.execute(
      `INSERT INTO clinical_intervention_catalog (agency_id, user_id, name, created_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [aId, uId, label, createdByUserId || null]
    );
    return this.listMerged({ agencyId: aId, userId: uId });
  }

  static async addMany({ agencyId, userId = 0, names = [], createdByUserId = null } = {}) {
    const list = [...new Set((names || []).map(normalizeName).filter(Boolean))];
    for (const name of list) {
      await this.add({ agencyId, userId, name, createdByUserId });
    }
    return this.listMerged({ agencyId, userId });
  }
}

export default ClinicalInterventionCatalog;
