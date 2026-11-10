import pool from '../../config/database.js';
import { groupKeyForIdentity } from '../departmentalGroupPolicy.js';

const email = value => String(value || '').trim().toLowerCase();
const SHARED_KEYS = new Set(['support', 'schools', 'schoolreply', 'school_reply', 'school_support',
  'forms', 'school_intake', 'notifications', 'login_recovery', 'technology', 'job_applications']);

// School profiles cannot claim the tenant's shared inbox. Inbound aliases on
// schoolreply deliberately include dedicated school mailboxes: do not exclude those.
export function dedicatedSchoolMailboxes(rows, { agency = {}, identities = [] } = {}) {
  const shared = new Set([agency.support_team_email, agency.onboarding_team_email].map(email).filter(Boolean));
  for (const identity of identities) {
    if (!SHARED_KEYS.has(email(identity.identity_key)) && !groupKeyForIdentity(identity)) continue;
    for (const value of [identity.from_email, identity.reply_to]) if (email(value)) shared.add(email(value));
  }
  return (rows || []).filter(row => email(row.itsco_email).includes('@') && !shared.has(email(row.itsco_email)))
    .map(row => ({ schoolOrganizationId: Number(row.school_organization_id), schoolName: row.school_name || null,
      itscoEmail: email(row.itsco_email) }));
}

export async function listDedicatedSchoolMailboxes(agencyId, db = pool) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [[rows], [identities], [agencies]] = await Promise.all([
    db.execute(`SELECT DISTINCT a.id AS school_organization_id, a.name AS school_name, sp.itsco_email
      FROM school_profiles sp JOIN agencies a ON a.id=sp.school_organization_id
      WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND (
        EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1)
        OR EXISTS (SELECT 1 FROM agency_schools s WHERE s.school_organization_id=a.id AND s.agency_id=? AND s.is_active=1))
      ORDER BY a.name`, [aid, aid]),
    db.execute('SELECT identity_key,from_email,reply_to FROM email_sender_identities WHERE agency_id=?', [aid]),
    db.execute('SELECT support_team_email,onboarding_team_email FROM agencies WHERE id=?', [aid])
  ]);
  return dedicatedSchoolMailboxes(rows, { agency: agencies[0], identities });
}

export function schoolContextForAddresses(mailboxes, addresses) {
  const recipients = new Set((addresses || []).map(email).filter(Boolean));
  const matches = new Map((mailboxes || []).filter(row => recipients.has(row.itscoEmail))
    .map(row => [row.schoolOrganizationId, row]));
  // Multiple schools on a message do not identify one school with certainty.
  if (matches.size !== 1) return null;
  const row = [...matches.values()][0];
  return { schoolOrganizationId: row.schoolOrganizationId, schoolName: row.schoolName, mailboxAddress: row.itscoEmail };
}
