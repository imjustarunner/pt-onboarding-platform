import pool from '../config/database.js';
import crypto from 'crypto';

export default class SchoolOnboardingQrLink {
  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static async findActiveByAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM school_onboarding_qr_links
       WHERE agency_id = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`,
      [agencyId]
    );
    return rows[0] || null;
  }

  static async findByToken(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const [rows] = await pool.execute(
      `SELECT q.*,
              a.name AS agency_name, a.slug AS agency_slug, a.portal_url AS agency_portal_url,
              a.logo_url AS agency_logo_url, a.logo_path AS agency_logo_path,
              a.color_palette AS agency_color_palette,
              a.onboarding_team_email AS agency_onboarding_team_email,
              a.phone_number AS agency_phone
       FROM school_onboarding_qr_links q
       JOIN agencies a ON a.id = q.agency_id
       WHERE BINARY q.token = BINARY ?
       LIMIT 1`,
      [t]
    );
    return rows[0] || null;
  }

  static async ensureActive({ agencyId, createdByUserId = null, label = null }) {
    const existing = await this.findActiveByAgency(agencyId);
    if (existing) return existing;
    const token = this.generateToken();
    const [result] = await pool.execute(
      `INSERT INTO school_onboarding_qr_links
        (agency_id, token, label, is_active, created_by_user_id)
       VALUES (?, ?, ?, 1, ?)`,
      [agencyId, token, label || 'School onboarding QR', createdByUserId]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM school_onboarding_qr_links WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return rows[0] || null;
  }

  static async rotate({ agencyId, createdByUserId = null, label = null }) {
    await pool.execute(
      `UPDATE school_onboarding_qr_links
       SET is_active = 0, revoked_at = NOW()
       WHERE agency_id = ? AND is_active = 1`,
      [agencyId]
    );
    return this.ensureActive({ agencyId, createdByUserId, label });
  }

  static async revoke(agencyId) {
    await pool.execute(
      `UPDATE school_onboarding_qr_links
       SET is_active = 0, revoked_at = NOW()
       WHERE agency_id = ? AND is_active = 1`,
      [agencyId]
    );
    return true;
  }
}
