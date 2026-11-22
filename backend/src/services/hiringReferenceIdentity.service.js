import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
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
  // Prefer People Operations so From/Reply-To are PO@tenant (requires Workspace
  // "Send mail as" for that address on the impersonated mailbox).
  for (const key of ['people_operations', 'job_applications', 'hiring', 'default_notifications', 'notifications']) {
    const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(aid, key);
    if (!identity) continue;
    // Skip personal_* and blank from_email rows.
    const from = String(identity.from_email || '').trim();
    if (!from) continue;
    if (String(identity.identity_key || '').toLowerCase().startsWith('personal_')) continue;
    // Job applications must never send as the AI mailbox.
    if (/^ai@/i.test(from)) continue;
    return identity;
  }
  // Last resort: first active agency-specific team identity (never personal_* mailboxes)
  const list = await EmailSenderIdentity.list({ agencyId: aid, includePlatformDefaults: false, onlyActive: true });
  const agencyOnly = (list || []).filter((x) => Number(x.agency_id) === aid);
  const isPersonal = (x) => String(x?.identity_key || '').toLowerCase().startsWith('personal_');
  const isSchool = (x) =>
    String(x?.display_name || x?.name || '').toLowerCase().includes('school') ||
    String(x?.identity_key || '').toLowerCase().includes('school');
  const nonSchool = agencyOnly.find((x) => !isPersonal(x) && !isSchool(x) && String(x?.from_email || '').trim());
  return nonSchool || agencyOnly.find((x) => !isPersonal(x) && String(x?.from_email || '').trim()) || null;
}


export async function resolveHiringReferenceReplyTo(agencyId, identity = null) {
  const peopleOps = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'people_operations');
  const agency = await Agency.findById(agencyId);
  const candidates = [peopleOps?.reply_to, peopleOps?.from_email, agency?.people_ops_email,
    agency?.onboarding_team_email, identity?.reply_to];
  const address = candidates.find(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))
    && String(value).toLowerCase() !== 'references@plotlinepo.com');
  if (address) return address;
  const [[company]] = await pool.execute('SELECT is_qa FROM plotline_companies WHERE agency_id = ? LIMIT 1', [agencyId]);
  return Number(company?.is_qa) === 1 ? 'testing@itsco.health' : null;
}
