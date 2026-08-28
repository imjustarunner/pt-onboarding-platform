import pool from '../config/database.js';
import crypto from 'crypto';

const DEFAULT_STEP_PROGRESS = {
  school_information: 'not_started',
  school_staff: 'not_started',
  preferred_days: 'not_started',
  welcome_materials: 'not_started',
  explore_demo: 'not_started',
  review_submit: 'not_started'
};

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

export default class SchoolOnboardingInvite {
  static defaultStepProgress() {
    return { ...DEFAULT_STEP_PROGRESS };
  }

  static generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  static normalizeRow(row) {
    if (!row) return null;
    return {
      ...row,
      step_progress: {
        ...DEFAULT_STEP_PROGRESS,
        ...parseJson(row.step_progress, {})
      },
      step_payload: parseJson(row.step_payload, {})
    };
  }

  static async create(data) {
    const token = data.token || this.generateToken();
    const stepProgress = JSON.stringify(data.stepProgress || this.defaultStepProgress());
    const stepPayload = JSON.stringify(data.stepPayload || {});
    const [result] = await pool.execute(
      `INSERT INTO school_onboarding_invites
        (token, agency_id, school_organization_id, primary_user_id,
         contact_first_name, contact_last_name, contact_email, school_name,
         invited_by_user_id, expires_at, status, source, qr_link_id, step_progress, step_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        token,
        data.agencyId,
        data.schoolOrganizationId,
        data.primaryUserId,
        data.contactFirstName,
        data.contactLastName,
        data.contactEmail,
        data.schoolName,
        data.invitedByUserId || null,
        data.expiresAt,
        data.status || 'invited',
        data.source || 'invite',
        data.qrLinkId || null,
        stepProgress,
        stepPayload
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT i.*,
              a.name AS agency_name, a.slug AS agency_slug, a.portal_url AS agency_portal_url,
              a.logo_url AS agency_logo_url, a.logo_path AS agency_logo_path,
              a.color_palette AS agency_color_palette, a.theme_settings AS agency_theme_settings,
              a.onboarding_team_email AS agency_onboarding_team_email, a.phone_number AS agency_phone,
              a.phone_extension AS agency_phone_extension,
              s.name AS school_org_name, s.slug AS school_slug, s.portal_url AS school_portal_url,
              s.feature_flags AS school_feature_flags,
              u.first_name AS invited_by_first_name, u.last_name AS invited_by_last_name,
              pu.password_hash AS primary_user_password_hash, pu.status AS primary_user_status,
              pu.username AS primary_user_username
       FROM school_onboarding_invites i
       JOIN agencies a ON a.id = i.agency_id
       JOIN agencies s ON s.id = i.school_organization_id
       LEFT JOIN users u ON u.id = i.invited_by_user_id
       LEFT JOIN users pu ON pu.id = i.primary_user_id
       WHERE i.id = ?
       LIMIT 1`,
      [id]
    );
    return this.normalizeRow(rows[0] || null);
  }

  static async findByToken(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const [rows] = await pool.execute(
      `SELECT i.*,
              a.name AS agency_name, a.slug AS agency_slug, a.portal_url AS agency_portal_url,
              a.logo_url AS agency_logo_url, a.logo_path AS agency_logo_path,
              a.color_palette AS agency_color_palette, a.theme_settings AS agency_theme_settings,
              a.onboarding_team_email AS agency_onboarding_team_email, a.phone_number AS agency_phone,
              a.phone_extension AS agency_phone_extension,
              s.name AS school_org_name, s.slug AS school_slug, s.portal_url AS school_portal_url,
              s.feature_flags AS school_feature_flags,
              u.first_name AS invited_by_first_name, u.last_name AS invited_by_last_name,
              pu.password_hash AS primary_user_password_hash, pu.status AS primary_user_status,
              pu.username AS primary_user_username
       FROM school_onboarding_invites i
       JOIN agencies a ON a.id = i.agency_id
       JOIN agencies s ON s.id = i.school_organization_id
       LEFT JOIN users u ON u.id = i.invited_by_user_id
       LEFT JOIN users pu ON pu.id = i.primary_user_id
       WHERE BINARY i.token = BINARY ?
       LIMIT 1`,
      [t]
    );
    return this.normalizeRow(rows[0] || null);
  }

  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT i.*,
              a.name AS agency_name,
              s.name AS school_org_name, s.slug AS school_slug, s.portal_url AS school_portal_url,
              u.first_name AS invited_by_first_name, u.last_name AS invited_by_last_name
       FROM school_onboarding_invites i
       JOIN agencies a ON a.id = i.agency_id
       JOIN agencies s ON s.id = i.school_organization_id
       LEFT JOIN users u ON u.id = i.invited_by_user_id
       WHERE i.agency_id = ?
       ORDER BY i.created_at DESC`,
      [agencyId]
    );
    return (rows || []).map((r) => this.normalizeRow(r));
  }

  static async update(id, patch = {}) {
    const fields = [];
    const values = [];
    const map = {
      status: 'status',
      stepProgress: 'step_progress',
      stepPayload: 'step_payload',
      expiresAt: 'expires_at',
      passwordSetAt: 'password_set_at',
      submittedAt: 'submitted_at',
      lastViewedAt: 'last_viewed_at',
      inviteEmailSentAt: 'invite_email_sent_at',
      recipientStartedAt: 'recipient_started_at',
      token: 'token',
      schoolName: 'school_name',
      contactFirstName: 'contact_first_name',
      contactLastName: 'contact_last_name'
    };
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] === undefined) continue;
      let val = patch[key];
      if (key === 'stepProgress' || key === 'stepPayload') {
        val = JSON.stringify(val || {});
      }
      fields.push(`${col} = ?`);
      values.push(val);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE school_onboarding_invites SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async touchViewed(id) {
    await pool.execute(
      `UPDATE school_onboarding_invites SET last_viewed_at = NOW() WHERE id = ?`,
      [id]
    );
  }
}
