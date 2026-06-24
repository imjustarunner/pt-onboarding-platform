import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

/**
 * Resolve sender identity for hiring reference invite/reminder emails.
 * Order: agencies.hiring_reference_sender_identity_id → identity_key hiring_references → default_notifications → first active agency identity.
 */
export async function resolveHiringReferenceSenderIdentity(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return null;

  let configuredId = null;
  try {
    const [rows] = await pool.execute(
      `SELECT hiring_reference_sender_identity_id AS id
       FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    configuredId = Number(rows?.[0]?.id || 0) || null;
  } catch {
    configuredId = null;
  }

  if (configuredId) {
    const idRow = await EmailSenderIdentity.findById(configuredId);
    if (idRow && Number(idRow.agency_id) === aid && idRow.is_active !== false && idRow.is_active !== 0) {
      return idRow;
    }
  }

  const byKey = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, 'hiring_references');
  if (byKey) return byKey;

  let def = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, 'default_notifications');
  if (def) return def;
  def = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, 'notifications');
  if (def) return def;

  const list = await EmailSenderIdentity.list({ agencyId: aid, includePlatformDefaults: false, onlyActive: true });
  const agencyOnly = (list || []).filter((x) => Number(x.agency_id) === aid);
  return agencyOnly[0] || null;
}

/**
 * Applicant confirmation / hiring transactional mail: identity_key job_applications, then default_notifications, then first agency identity.
 */
export async function resolveJobApplicationSenderIdentity(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return null;
  // Prefer a dedicated People Operations or job_applications identity
  for (const key of ['people_operations', 'job_applications', 'hiring', 'default_notifications', 'notifications']) {
    const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, key);
    if (identity) return identity;
  }
  // Last resort: first active agency-specific identity that is NOT a school/intake identity
  const list = await EmailSenderIdentity.list({ agencyId: aid, includePlatformDefaults: false, onlyActive: true });
  const agencyOnly = (list || []).filter((x) => Number(x.agency_id) === aid);
  const nonSchool = agencyOnly.find(
    (x) => !String(x.display_name || x.name || '').toLowerCase().includes('school') &&
            !String(x.identity_key || '').toLowerCase().includes('school')
  );
  return nonSchool || agencyOnly[0] || null;
}
