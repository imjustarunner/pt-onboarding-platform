import pool from '../config/database.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import Client from '../models/Client.model.js';

// Read attribution only from the invitation's own tenant/dependent and an
// authenticated guardian or its recorded, completed enrollment request.
export async function requestingGuardianContext({ inviteId, agencyId, clientId }) {
  if (!inviteId || !agencyId || !clientId) return null;
  const [[origin]] = await pool.execute(`SELECT i.requesting_submission_id,
      u.first_name,u.last_name, u.email, u.role, cg.access_enabled, c.initials AS client_initials,
      l.language_code AS enrollment_locale,
      (SELECT GROUP_CONCAT(child.initials ORDER BY child.id SEPARATOR ", ") FROM co_guardian_invite_clients all_children
       JOIN clients child ON child.id=all_children.client_id AND child.agency_id=i.agency_id WHERE all_children.invite_id=i.id) AS all_child_initials
    FROM co_guardian_invites i
    JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id AND ic.client_id=?
    JOIN clients c ON c.id=ic.client_id AND c.agency_id=i.agency_id
    LEFT JOIN intake_links l ON l.public_key=i.public_key
    LEFT JOIN users u ON u.id=i.invited_by_user_id
    LEFT JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=u.id
    WHERE i.id=? AND i.agency_id=? LIMIT 1`, [clientId, inviteId, agencyId]);
  if (!origin) return null;
  const [linkedChildren] = await pool.execute('SELECT client_id FROM co_guardian_invite_clients WHERE invite_id=? ORDER BY client_id', [inviteId]);
  const clientNames = [];
  for (const row of linkedChildren || []) {
    if (!Number(row.client_id)) continue;
    const child = await Client.findById(Number(row.client_id));
    if (Number(child?.agency_id) !== Number(agencyId)) continue;
    const name = String(child.full_name || child.initials || '').trim();
    if (name) clientNames.push(name);
  }
  const clientInitials = String(origin.all_child_initials || origin.client_initials || '').trim() || null;
  if (['client_guardian', 'guardian', 'client'].includes(origin.role) && Number(origin.access_enabled) === 1) {
    const name = [origin.first_name, origin.last_name].filter(Boolean).join(' ').trim();
    if (name) return { name, email: origin.email || null, clientInitials, clientNames, locale: origin.enrollment_locale === 'es' ? 'es' : 'en' };
  }
  if (!origin.requesting_submission_id) return null;
  const submission = await IntakeSubmission.findById(origin.requesting_submission_id);
  if (!submission || Number(submission.client_id) !== Number(clientId) || submission.status !== 'submitted'
      || !submission.submitted_at || submission.co_guardian_invite_id) return null;
  const data = typeof submission.intake_data === 'string' ? JSON.parse(submission.intake_data) : submission.intake_data;
  const guardian = data?.guardian;
  if (!guardian || !['yes', 'shared'].includes(guardian.other_guardian_has_legal_rights)) return null;
  const name = [guardian.firstName || guardian.first_name, guardian.lastName || guardian.last_name].filter(Boolean).join(' ').trim();
  return name ? { name, email: String(guardian.email || '').trim() || null, clientInitials, clientNames, locale: origin.enrollment_locale === 'es' ? 'es' : 'en' } : null;
}

export async function requestingGuardianName(scope) {
  return (await requestingGuardianContext(scope))?.name || null;
}
