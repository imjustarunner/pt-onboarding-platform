import pool from '../config/database.js';
import { requiresCaptchaForLink } from '../utils/intakeCaptchaPolicy.js';

const flags = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };

// All arguments are resolved from the stored public application link/company.
// A browser testing flag, request agency ID or company name grants no exemption.
export async function requiresPublicApplicationCaptcha(organization, agency, env = process.env, link = null, db = pool) {
  if (link?.form_type !== 'job_application' || flags(agency?.feature_flags).plotlineOnly !== true) {
    return requiresCaptchaForLink(organization, agency, env, link);
  }
  if (Number(agency?.is_active) !== 1 || Number(agency?.is_archived || 0) !== 0
    || Number(link.organization_id) !== Number(agency.id)) return true;
  const [[company]] = await db.execute('SELECT is_qa FROM plotline_companies WHERE agency_id=? LIMIT 1', [agency.id]);
  // Real standalone Plotline applications always require CAPTCHA. Only the
  // server-maintained QA company registry may turn it off for synthetic tests.
  return Number(company?.is_qa) !== 1;
}

export function isLocalCaptchaDevelopmentRequest(req, nodeEnv) {
  if (nodeEnv === 'production') return false;
  const host = String(req.get('host') || '').toLowerCase().split(':')[0];
  return host === 'localhost' || host === '127.0.0.1';
}
