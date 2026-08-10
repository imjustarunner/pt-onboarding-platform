import pool from '../config/database.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../content/schoolPacketTemplateDefault.en.js';

class SchoolPacketTemplate {
  static _tableExists = null;

  static async tableExists() {
    if (this._tableExists === true) return true;
    if (this._tableExists === false) return false;
    try {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_packet_templates'"
      );
      const ok = Number(rows?.[0]?.cnt || 0) > 0;
      this._tableExists = ok;
      return ok;
    } catch {
      this._tableExists = false;
      return false;
    }
  }

  static async findByAgencyId(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const exists = await this.tableExists();
    if (!exists) return null;
    const [rows] = await pool.execute(
      `SELECT id, agency_id, version, html_content, updated_by_user_id, created_at, updated_at
       FROM school_packet_templates
       WHERE agency_id = ?
       LIMIT 1`,
      [aid]
    );
    return rows?.[0] || null;
  }

  /**
   * Returns the agency template row, creating it from the default Version 1.15
   * HTML seed when the agency has no row yet.
   */
  static async getOrCreateForAgency(agencyId, { actorUserId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const existing = await this.findByAgencyId(aid);
    if (existing) return existing;

    const exists = await this.tableExists();
    if (!exists) {
      return {
        id: null,
        agency_id: aid,
        version: 1,
        html_content: DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,
        updated_by_user_id: null,
        created_at: null,
        updated_at: null,
        is_default_fallback: true
      };
    }

    await pool.execute(
      `INSERT INTO school_packet_templates
         (agency_id, version, html_content, updated_by_user_id)
       VALUES (?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE agency_id = agency_id`,
      [aid, DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML, actorUserId || null]
    );
    return this.findByAgencyId(aid);
  }

  /**
   * Saves new HTML content and bumps version by 1 (in-place).
   */
  static async upsertContent({ agencyId, htmlContent, actorUserId = null }) {
    const aid = Number(agencyId || 0);
    if (!aid) {
      const err = new Error('Invalid agencyId');
      err.status = 400;
      throw err;
    }
    const exists = await this.tableExists();
    if (!exists) {
      const err = new Error('Database missing school_packet_templates table. Run database/migrations/1172_school_packet_templates.sql.');
      err.status = 409;
      throw err;
    }

    const html = String(htmlContent ?? '');
    if (!html.trim()) {
      const err = new Error('html_content is required');
      err.status = 400;
      throw err;
    }

    const existing = await this.findByAgencyId(aid);
    if (existing) {
      const nextVersion = Number(existing.version || 1) + 1;
      await pool.execute(
        `UPDATE school_packet_templates
         SET html_content = ?,
             version = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?`,
        [html, nextVersion, actorUserId || null, aid]
      );
    } else {
      await pool.execute(
        `INSERT INTO school_packet_templates
           (agency_id, version, html_content, updated_by_user_id)
         VALUES (?, 1, ?, ?)`,
        [aid, html, actorUserId || null]
      );
    }
    return this.findByAgencyId(aid);
  }
}

export default SchoolPacketTemplate;
