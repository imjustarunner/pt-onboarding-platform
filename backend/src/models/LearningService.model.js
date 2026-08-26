import pool from '../config/database.js';

class LearningService {
  static async listByAgency({ agencyId, activeOnly = true }) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const where = activeOnly ? 'AND is_active = TRUE' : '';
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_services
       WHERE agency_id = ?
       ${where}
       ORDER BY name ASC, id ASC`,
      [aid]
    );
    return rows || [];
  }

  /** Ensure a CONSULTATION (or named) catalog row exists for the agency; create-on-first-use. */
  static async ensureByType({
    agencyId,
    serviceType = 'CONSULTATION',
    name = null,
    code = null,
    defaultFeeCents = 0,
    createdByUserId = null
  }) {
    const aid = Number(agencyId || 0);
    const type = String(serviceType || 'CONSULTATION').trim().toUpperCase() || 'CONSULTATION';
    if (!aid) return null;
    const services = await this.listByAgency({ agencyId: aid, activeOnly: false });
    const hit = (services || []).find(
      (s) => String(s.service_type || '').toUpperCase() === type
        || String(s.code || '').toUpperCase() === type
    );
    if (hit) return hit;

    const svcName = String(name || (type === 'CONSULTATION' ? 'Consultation' : type)).slice(0, 120);
    const svcCode = String(code || type).slice(0, 64);
    const [result] = await pool.execute(
      `INSERT INTO learning_services
         (agency_id, name, code, service_type, default_fee_cents, currency, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'USD', 1, ?)`,
      [aid, svcName, svcCode, type, Number(defaultFeeCents || 0), createdByUserId || null]
    );
    const [rows] = await pool.execute(`SELECT * FROM learning_services WHERE id = ? LIMIT 1`, [result.insertId]);
    return rows?.[0] || null;
  }
}

export default LearningService;
