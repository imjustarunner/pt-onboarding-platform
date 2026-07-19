import pool from '../config/database.js';

class StaffServiceAssignment {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: Number(r.id),
      agencyId: Number(r.agency_id),
      tenantServiceId: Number(r.tenant_service_id),
      userId: Number(r.user_id),
      modality: r.modality ? String(r.modality).toUpperCase() : null,
      officeLocationId: r.office_location_id == null ? null : Number(r.office_location_id),
      isActive: Number(r.is_active) === 1,
      firstName: r.first_name != null ? String(r.first_name) : undefined,
      lastName: r.last_name != null ? String(r.last_name) : undefined,
      email: r.email != null ? String(r.email) : undefined
    };
  }

  static async listForService(agencyId, tenantServiceId) {
    const [rows] = await pool.execute(
      `SELECT ssa.*, u.first_name, u.last_name, u.email
       FROM staff_service_assignments ssa
       JOIN users u ON u.id = ssa.user_id
       WHERE ssa.agency_id = ? AND ssa.tenant_service_id = ? AND ssa.is_active = 1
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [Number(agencyId), Number(tenantServiceId)]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async listServiceIdsForUser(agencyId, userId) {
    const [rows] = await pool.execute(
      `SELECT tenant_service_id
       FROM staff_service_assignments
       WHERE agency_id = ? AND user_id = ? AND is_active = 1`,
      [Number(agencyId), Number(userId)]
    );
    return (rows || []).map((r) => Number(r.tenant_service_id)).filter((n) => n > 0);
  }

  static async listUserIdsForService(agencyId, tenantServiceId) {
    const rows = await this.listForService(agencyId, tenantServiceId);
    return rows.map((r) => r.userId);
  }

  static async replaceForService(agencyId, tenantServiceId, userIds = []) {
    const aid = Number(agencyId);
    const sid = Number(tenantServiceId);
    const ids = Array.from(new Set((userIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM staff_service_assignments WHERE agency_id = ? AND tenant_service_id = ?`,
        [aid, sid]
      );
      for (const uid of ids) {
        await conn.execute(
          `INSERT INTO staff_service_assignments (agency_id, tenant_service_id, user_id, is_active)
           VALUES (?, ?, ?, 1)`,
          [aid, sid, uid]
        );
      }
      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
    return this.listForService(aid, sid);
  }
}

export default StaffServiceAssignment;
