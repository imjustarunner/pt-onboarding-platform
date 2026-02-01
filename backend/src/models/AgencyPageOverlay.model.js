import pool from '../config/database.js';

class AgencyPageOverlay {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_page_overlays'"
      );
      const ok = Number(rows?.[0]?.cnt || 0) > 0;
      this._tableExists = ok;
      return ok;
    } catch {
      this._tableExists = false;
      return false;
    }
  }

  static async getForRoute(agencyId, routeName) {
    const exists = await this.tableExists();
    if (!exists) return { tutorial: null, helper: null, missingTable: true };

    const [rows] = await pool.execute(
      `SELECT overlay_type, enabled, version, config
       FROM agency_page_overlays
       WHERE agency_id = ? AND route_name = ?`,
      [agencyId, routeName]
    );

    const out = { tutorial: null, helper: null, missingTable: false };
    for (const r of rows || []) {
      const type = r.overlay_type;
      const payload = {
        enabled: r.enabled === 1 || r.enabled === true,
        version: Number(r.version || 1),
        config: r.config
      };
      if (type === 'tutorial') out.tutorial = payload;
      if (type === 'helper') out.helper = payload;
    }
    return out;
  }

  static async getOverlay(agencyId, routeName, overlayType) {
    const exists = await this.tableExists();
    if (!exists) return null;

    const [rows] = await pool.execute(
      `SELECT id, agency_id, route_name, overlay_type, enabled, version, config
       FROM agency_page_overlays
       WHERE agency_id = ? AND route_name = ? AND overlay_type = ?
       LIMIT 1`,
      [agencyId, routeName, overlayType]
    );
    return rows?.[0] || null;
  }

  static async upsert({ agencyId, routeName, overlayType, enabled = true, version = 1, config, actorUserId = null }) {
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing agency_page_overlays table. Run database/migrations/317_create_agency_page_overlays.sql.');
      err.status = 409;
      throw err;
    }

    const enabledVal = enabled ? 1 : 0;
    const versionVal = Number(version || 1);
    const jsonConfig = typeof config === 'string' ? config : JSON.stringify(config ?? {});

    await pool.execute(
      `INSERT INTO agency_page_overlays
        (agency_id, route_name, overlay_type, enabled, version, config, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         version = VALUES(version),
         config = VALUES(config),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, routeName, overlayType, enabledVal, versionVal, jsonConfig, actorUserId, actorUserId]
    );

    return await this.getOverlay(agencyId, routeName, overlayType);
  }

  static async remove({ agencyId, routeName, overlayType }) {
    const exists = await this.tableExists();
    if (!exists) return { deleted: false, missingTable: true };
    const [res] = await pool.execute(
      `DELETE FROM agency_page_overlays
       WHERE agency_id = ? AND route_name = ? AND overlay_type = ?`,
      [agencyId, routeName, overlayType]
    );
    return { deleted: Number(res?.affectedRows || 0) > 0, missingTable: false };
  }
}

export default AgencyPageOverlay;

