import pool from '../config/database.js';
import PayrollIndirectServiceType from './PayrollIndirectServiceType.model.js';

class PayrollUserIndirectServiceAssignment {
  static _normalize(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      agencyId: Number(row.agency_id),
      userId: Number(row.user_id),
      serviceTypeId: Number(row.service_type_id),
      isEnabled: !!(row.is_enabled === 1 || row.is_enabled === true),
      rateOverride: row.rate_override != null ? Number(row.rate_override) : null,
      sortOrder: row.sort_order != null ? Number(row.sort_order) : null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  static async listForUser({ agencyId, userId }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    if (!aid || !uid) return [];
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM payroll_user_indirect_service_assignments
         WHERE agency_id = ? AND user_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [aid, uid]
      );
      return (rows || []).map((r) => this._normalize(r));
    } catch (e) {
      if (String(e?.code || '').includes('ER_NO_SUCH_TABLE')) return [];
      throw e;
    }
  }

  /**
   * Merge agency catalog with per-user enable/disable + rate overrides.
   * No assignment rows → all active agency types (legacy behavior).
   */
  static async listMergedTypesForUser({ agencyId, userId, activeOnly = true }) {
    const types = await PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: false });
    const assignments = await this.listForUser({ agencyId, userId });
    if (!assignments.length) {
      return (activeOnly ? types.filter((t) => t.isActive) : types)
        .map((t) => ({ ...t, rateOverride: null, assignmentId: null }));
    }
    const byTypeId = new Map(assignments.map((a) => [a.serviceTypeId, a]));
    const out = [];
    for (const t of types) {
      const a = byTypeId.get(t.id);
      if (a) {
        if (!a.isEnabled) continue;
        out.push({ ...t, rateOverride: a.rateOverride, assignmentId: a.id, sortOrder: a.sortOrder ?? t.sortOrder });
        continue;
      }
      if (activeOnly && !t.isActive) continue;
      out.push({ ...t, rateOverride: null, assignmentId: null });
    }
    out.sort((x, y) => Number(x.sortOrder || 0) - Number(y.sortOrder || 0) || String(x.label).localeCompare(String(y.label)));
    return out;
  }

  static async upsertForUser({ agencyId, userId, assignments = [] }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    if (!aid || !uid) throw Object.assign(new Error('agencyId and userId required'), { status: 400 });
    const rows = Array.isArray(assignments) ? assignments : [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM payroll_user_indirect_service_assignments WHERE agency_id = ? AND user_id = ?`,
        [aid, uid]
      );
      for (const row of rows) {
        const typeId = Number(row.serviceTypeId || row.service_type_id || 0);
        if (!typeId) continue;
        await conn.execute(
          `INSERT INTO payroll_user_indirect_service_assignments
             (agency_id, user_id, service_type_id, is_enabled, rate_override, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            aid,
            uid,
            typeId,
            row.isEnabled === false || row.is_enabled === false || row.is_enabled === 0 ? 0 : 1,
            row.rateOverride != null && row.rateOverride !== '' ? Number(row.rateOverride) : null,
            row.sortOrder != null ? Number(row.sortOrder) : null
          ]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return this.listForUser({ agencyId: aid, userId: uid });
  }

  static async findRateOverride({ agencyId, userId, serviceTypeId }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    const tid = Number(serviceTypeId);
    if (!aid || !uid || !tid) return null;
    try {
      const [rows] = await pool.execute(
        `SELECT rate_override FROM payroll_user_indirect_service_assignments
         WHERE agency_id = ? AND user_id = ? AND service_type_id = ? AND is_enabled = 1
         LIMIT 1`,
        [aid, uid, tid]
      );
      const val = rows?.[0]?.rate_override;
      return val != null && Number.isFinite(Number(val)) ? Number(val) : null;
    } catch {
      return null;
    }
  }
}

export default PayrollUserIndirectServiceAssignment;
