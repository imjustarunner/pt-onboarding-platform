import pool from '../config/database.js';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export class LearningBillingGateService {
  static isLearningOrganizationType(value) {
    return String(value || '').trim().toLowerCase() === 'learning';
  }

  static async isLearningBillingEnabledForAgency({ agencyId }) {
    const aid = Number(agencyId || 0);
    if (!aid) return { enabled: false, reason: 'invalid_agency' };
    const [rows] = await pool.execute(
      `SELECT id, organization_type, feature_flags
       FROM agencies
       WHERE id = ?
       LIMIT 1`,
      [aid]
    );
    const row = rows?.[0] || null;
    if (!row) return { enabled: false, reason: 'agency_not_found' };
    if (!this.isLearningOrganizationType(row.organization_type)) {
      return { enabled: false, reason: 'not_learning_org' };
    }
    const flags = parseFlags(row.feature_flags);
    const enabled = flags.learningProgramBillingEnabled === true;
    return {
      enabled,
      reason: enabled ? null : 'feature_disabled',
      agency: row
    };
  }
}

export default LearningBillingGateService;
