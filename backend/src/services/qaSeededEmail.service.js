import pool from '../config/database.js';
import { isQaEmailAgency, QA_EMAIL_INBOX } from '../utils/qaEmailPolicy.js';

// Never infer a QA identity from its email domain alone or from a caller's
// agencyId. Recheck active membership and the dedicated sandbox on every use.
export async function seededQaEmailAccount(user, { agencyId = null } = {}) {
  if (Number(user?.is_demo) !== 1 || !Number(user?.user_id || user?.id)) return false;
  if (agencyId != null && !isQaEmailAgency(agencyId)) return false;
  const [[account]] = await pool.execute(`SELECT u.id FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
    JOIN agencies a ON a.id=ua.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    JOIN agencies root ON root.id=450 AND root.slug='auricwell-qa-demo' AND root.is_active=1
      AND JSON_EXTRACT(root.feature_flags,'$.qaSandbox.syntheticOnly')=true
    WHERE u.id=? AND u.is_demo=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND ua.agency_id IN (450,451,452) AND (? IS NULL OR ua.agency_id=?) LIMIT 1`,
    [user.user_id || user.id, agencyId, agencyId]);
  return !!account;
}

// Only a sent, exact private reminder authorizes the controlled inbox to act
// for its seeded owner. Callers must still verify token/thread, DMARC, current
// preferences, ownership and private thread permissions.
export async function personalReminderSenderMatches(user, fromEmail, agencyId) {
  const normalize = value => String(value || '').trim().toLowerCase();
  if (normalize(fromEmail) === normalize(user?.personal_email) && normalize(fromEmail)) return true;
  return normalize(fromEmail) === QA_EMAIL_INBOX && /^[^@\s]+@example\.com$/i.test(user?.personal_email || '')
    && await seededQaEmailAccount(user, { agencyId });
}
