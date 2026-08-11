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
   * A type becomes "restricted" the moment ANY user is given an explicit, enabled
   * assignment row for it. Once restricted, only explicitly-assigned users see the
   * type — everyone else loses default visibility. Types with zero assignment rows
   * for anyone remain open to all (legacy default).
   */
  static async listRestrictedTypeIds({ agencyId }) {
    const aid = Number(agencyId);
    if (!aid) return new Set();
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT service_type_id FROM payroll_user_indirect_service_assignments
         WHERE agency_id = ? AND is_enabled = 1`,
        [aid]
      );
      return new Set((rows || []).map((r) => Number(r.service_type_id)));
    } catch (e) {
      if (String(e?.code || '').includes('ER_NO_SUCH_TABLE')) return new Set();
      throw e;
    }
  }

  /**
   * Merge agency catalog with per-user enable/disable + rate overrides.
   * No assignment rows anywhere for a type → open to all active agency types (legacy behavior).
   * Once a type has at least one explicit enabled assignment (for any user), it becomes
   * restricted — only explicitly-assigned users see it (checked when activeOnly=true,
   * i.e. the provider-facing view). Admin edit views (activeOnly=false) always see the
   * full catalog so they can still assign restricted types to new people.
   */
  static async listMergedTypesForUser({ agencyId, userId, activeOnly = true }) {
    const types = await PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: false });
    const assignments = await this.listForUser({ agencyId, userId });
    const byTypeId = new Map(assignments.map((a) => [a.serviceTypeId, a]));
    const restrictedTypeIds = activeOnly ? await this.listRestrictedTypeIds({ agencyId }) : new Set();

    const out = [];
    for (const t of types) {
      const a = byTypeId.get(t.id);
      if (a) {
        if (!a.isEnabled) continue;
        out.push({ ...t, rateOverride: a.rateOverride, assignmentId: a.id, sortOrder: a.sortOrder ?? t.sortOrder, isRestricted: restrictedTypeIds.has(t.id) });
        continue;
      }
      if (activeOnly && !t.isActive) continue;
      if (activeOnly && restrictedTypeIds.has(t.id)) continue;
      out.push({ ...t, rateOverride: null, assignmentId: null, isRestricted: restrictedTypeIds.has(t.id) });
    }
    out.sort((x, y) => Number(x.sortOrder || 0) - Number(y.sortOrder || 0) || String(x.label).localeCompare(String(y.label)));
    return out;
  }

  /** Add/update a single (agency, user, type) assignment row without touching the user's other types. */
  static async upsertSingle({ agencyId, userId, serviceTypeId, isEnabled = true, rateOverride = null }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    const tid = Number(serviceTypeId);
    if (!aid || !uid || !tid) throw Object.assign(new Error('agencyId, userId, and serviceTypeId are required'), { status: 400 });
    await pool.execute(
      `INSERT INTO payroll_user_indirect_service_assignments
         (agency_id, user_id, service_type_id, is_enabled, rate_override)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled    = VALUES(is_enabled),
         rate_override = VALUES(rate_override),
         updated_at    = CURRENT_TIMESTAMP`,
      [aid, uid, tid, isEnabled ? 1 : 0, rateOverride != null && rateOverride !== '' ? Number(rateOverride) : null]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_user_indirect_service_assignments
       WHERE agency_id = ? AND user_id = ? AND service_type_id = ? LIMIT 1`,
      [aid, uid, tid]
    );
    return this._normalize(rows?.[0]);
  }

  /** Remove a single (agency, user, type) assignment row without touching the user's other types. */
  static async removeSingle({ agencyId, userId, serviceTypeId }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    const tid = Number(serviceTypeId);
    if (!aid || !uid || !tid) return false;
    await pool.execute(
      `DELETE FROM payroll_user_indirect_service_assignments
       WHERE agency_id = ? AND user_id = ? AND service_type_id = ? LIMIT 1`,
      [aid, uid, tid]
    );
    return true;
  }

  /** Bulk-assign many users to one type in a single transaction (used by "Add all …" group buttons). */
  static async bulkUpsert({ agencyId, userIds, serviceTypeId, isEnabled = true }) {
    const aid = Number(agencyId);
    const tid = Number(serviceTypeId);
    const ids = (Array.isArray(userIds) ? userIds : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!aid || !tid || !ids.length) return [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const uid of ids) {
        await conn.execute(
          `INSERT INTO payroll_user_indirect_service_assignments
             (agency_id, user_id, service_type_id, is_enabled)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_enabled = VALUES(is_enabled),
             updated_at = CURRENT_TIMESTAMP`,
          [aid, uid, tid, isEnabled ? 1 : 0]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return ids;
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

  static async hasEnabledAssignmentsForTypes({ agencyId, userId, serviceTypeIds }) {
    const aid = Number(agencyId);
    const uid = Number(userId);
    if (!aid || !uid) return false;
    const enabledIds = new Set(
      (await this.listForUser({ agencyId: aid, userId: uid }))
        .filter((a) => a.isEnabled)
        .map((a) => a.serviceTypeId)
    );
    const requested = (Array.isArray(serviceTypeIds) ? serviceTypeIds : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!requested.length) return false;
    return requested.every((id) => enabledIds.has(id));
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
