import pool from '../config/database.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../content/schoolPacketTemplateDefault.en.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES } from '../content/schoolPacketTemplateDefault.es.js';

function normalizeLocale(locale) {
  const raw = String(locale || 'en').trim().toLowerCase();
  if (raw === 'es' || raw.startsWith('es-') || raw.startsWith('es_')) return 'es';
  return 'en';
}

function defaultHtmlForLocale(locale) {
  return normalizeLocale(locale) === 'es'
    ? DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES
    : DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML;
}

class SchoolPacketTemplate {
  static _tableExists = null;
  static _hasLocaleColumn = null;

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

  static async hasLocaleColumn() {
    if (this._hasLocaleColumn === true) return true;
    if (this._hasLocaleColumn === false) return false;
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.columns
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'school_packet_templates'
           AND COLUMN_NAME = 'locale'`
      );
      const ok = Number(rows?.[0]?.cnt || 0) > 0;
      this._hasLocaleColumn = ok;
      return ok;
    } catch {
      this._hasLocaleColumn = false;
      return false;
    }
  }

  static async findByAgencyId(agencyId, locale = 'en') {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const exists = await this.tableExists();
    if (!exists) return null;
    const loc = normalizeLocale(locale);
    const hasLocale = await this.hasLocaleColumn();
    if (hasLocale) {
      const [rows] = await pool.execute(
        `SELECT id, agency_id, locale, version, html_content, updated_by_user_id, created_at, updated_at
         FROM school_packet_templates
         WHERE agency_id = ? AND locale = ?
         LIMIT 1`,
        [aid, loc]
      );
      return rows?.[0] || null;
    }
    const [rows] = await pool.execute(
      `SELECT id, agency_id, version, html_content, updated_by_user_id, created_at, updated_at
       FROM school_packet_templates
       WHERE agency_id = ?
       LIMIT 1`,
      [aid]
    );
    const row = rows?.[0] || null;
    if (row) row.locale = 'en';
    return row;
  }

  /**
   * Returns the agency template row for a locale, creating it from the default
   * seed when the agency has no row yet for that locale.
   */
  static async getOrCreateForAgency(agencyId, { actorUserId = null, locale = 'en' } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return null;
    const loc = normalizeLocale(locale);
    const existing = await this.findByAgencyId(aid, loc);
    if (existing) return existing;

    const exists = await this.tableExists();
    if (!exists) {
      return {
        id: null,
        agency_id: aid,
        locale: loc,
        version: 1,
        html_content: defaultHtmlForLocale(loc),
        updated_by_user_id: null,
        created_at: null,
        updated_at: null,
        is_default_fallback: true
      };
    }

    const hasLocale = await this.hasLocaleColumn();
    if (hasLocale) {
      await pool.execute(
        `INSERT INTO school_packet_templates
           (agency_id, locale, version, html_content, updated_by_user_id)
         VALUES (?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE agency_id = agency_id`,
        [aid, loc, defaultHtmlForLocale(loc), actorUserId || null]
      );
    } else {
      await pool.execute(
        `INSERT INTO school_packet_templates
           (agency_id, version, html_content, updated_by_user_id)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE agency_id = agency_id`,
        [aid, defaultHtmlForLocale(loc), actorUserId || null]
      );
    }
    return this.findByAgencyId(aid, loc);
  }

  static async versionsTableExists() {
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_packet_template_versions'`
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static async archiveVersion({ agencyId, locale, version, htmlContent, actorUserId = null }) {
    if (!(await this.versionsTableExists())) return;
    const aid = Number(agencyId || 0);
    const ver = Number(version || 0);
    if (!aid || !ver) return;
    const loc = normalizeLocale(locale);
    try {
      await pool.execute(
        `INSERT INTO school_packet_template_versions
           (agency_id, locale, version, html_content, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE html_content = VALUES(html_content)`,
        [aid, loc, ver, String(htmlContent ?? ''), actorUserId || null]
      );
    } catch (e) {
      console.warn('[SchoolPacketTemplate] archiveVersion failed', e?.message || e);
    }
  }

  static async listVersions(agencyId, locale = 'en') {
    const aid = Number(agencyId || 0);
    if (!aid || !(await this.versionsTableExists())) return [];
    const loc = normalizeLocale(locale);
    const [rows] = await pool.execute(
      `SELECT id, agency_id, locale, version, created_by_user_id, created_at,
              CHAR_LENGTH(html_content) AS html_length
       FROM school_packet_template_versions
       WHERE agency_id = ? AND locale = ?
       ORDER BY version DESC`,
      [aid, loc]
    );
    return rows || [];
  }

  static async getVersion(agencyId, locale, version) {
    const aid = Number(agencyId || 0);
    const ver = Number(version || 0);
    if (!aid || !ver || !(await this.versionsTableExists())) return null;
    const loc = normalizeLocale(locale);
    const [rows] = await pool.execute(
      `SELECT id, agency_id, locale, version, html_content, created_by_user_id, created_at
       FROM school_packet_template_versions
       WHERE agency_id = ? AND locale = ? AND version = ?
       LIMIT 1`,
      [aid, loc, ver]
    );
    return rows?.[0] || null;
  }

  /**
   * Saves new HTML content and bumps version by 1 (in-place) for a locale.
   * Archives the new version row for history.
   */
  static async upsertContent({ agencyId, htmlContent, actorUserId = null, locale = 'en' }) {
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

    const loc = normalizeLocale(locale);
    const hasLocale = await this.hasLocaleColumn();
    const existing = await this.findByAgencyId(aid, loc);
    let savedVersion = 1;
    if (existing) {
      const nextVersion = Number(existing.version || 1) + 1;
      savedVersion = nextVersion;
      if (hasLocale) {
        await pool.execute(
          `UPDATE school_packet_templates
           SET html_content = ?,
               version = ?,
               updated_by_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE agency_id = ? AND locale = ?`,
          [html, nextVersion, actorUserId || null, aid, loc]
        );
      } else {
        await pool.execute(
          `UPDATE school_packet_templates
           SET html_content = ?,
               version = ?,
               updated_by_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE agency_id = ?`,
          [html, nextVersion, actorUserId || null, aid]
        );
      }
    } else if (hasLocale) {
      await pool.execute(
        `INSERT INTO school_packet_templates
           (agency_id, locale, version, html_content, updated_by_user_id)
         VALUES (?, ?, 1, ?, ?)`,
        [aid, loc, html, actorUserId || null]
      );
    } else {
      await pool.execute(
        `INSERT INTO school_packet_templates
           (agency_id, version, html_content, updated_by_user_id)
         VALUES (?, 1, ?, ?)`,
        [aid, html, actorUserId || null]
      );
    }
    await this.archiveVersion({
      agencyId: aid,
      locale: loc,
      version: savedVersion,
      htmlContent: html,
      actorUserId
    });
    return this.findByAgencyId(aid, loc);
  }
}

export { normalizeLocale, defaultHtmlForLocale };
export default SchoolPacketTemplate;
