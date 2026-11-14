import pool from '../config/database.js';
import User from '../models/User.model.js';
const fail = (message, status=403) => Object.assign(new Error(message), { status, statusCode: status });
export async function authorizeReferralPacket({ user, agencyId, organizationId, draft = null }, users = User) {
  if (!user?.id) throw fail('Sign in to upload a packet.');
  if (user.role === 'super_admin') return;
  const memberships = await users.getAgencies(user.id);
  const active = memberships.filter(row => ![0, false, '0'].includes(row.membership_is_active ?? row.is_active));
  const ids = new Set(active.map(row => Number(row.id)));
  // A school affiliation can carry the school role even when the user's global
  // role is staff/provider. Keep that access limited to this school and uploader.
  const schoolMember = active.find(row => Number(row.id) === Number(organizationId));
  const schoolRole = String(schoolMember?.agency_role || user.role).toLowerCase();
  const processingRoles = ['admin','support','staff','clinical_practice_assistant','provider_plus'];
  const agencyProcessor = processingRoles.includes(user.role) && ids.has(Number(agencyId));
  const ownSchoolAccess = schoolMember && (schoolRole === 'school_staff' || [...processingRoles,'provider'].includes(user.role));
  if (user.role === 'school_staff' || (ownSchoolAccess && !agencyProcessor)) {
    if (!ids.has(Number(organizationId)) || (draft && Number(draft.uploaded_by_user_id) !== Number(user.id))) throw fail('This packet is not available to your school account.');
  } else if (!agencyProcessor) throw fail('You do not have packet-processing access for this agency.');
}
export async function referralPacketMatch({ agencyId, organizationId, firstName, lastName, initials, existingClientId, reviewedMatchIds }, db = pool) {
  const name = [firstName,lastName].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  const [rows] = await db.execute(`SELECT id, full_name, initials, identifier_code, date_of_birth FROM clients
    WHERE agency_id=? AND organization_id=? AND (LOWER(TRIM(full_name))=LOWER(?) OR initials=? OR id=?)
    ORDER BY id LIMIT 50`, [agencyId, organizationId, name || '__no_name__', initials || '__no_initials__', Number(existingClientId)||0]);
  if (existingClientId) {
    const selected = rows.find(row => Number(row.id) === Number(existingClientId));
    if (!selected) throw fail('Choose a client in this school and agency.', 400);
    return { existingClientId: Number(selected.id), matches: rows };
  }
  const reviewed = new Set(Array.isArray(reviewedMatchIds) ? reviewedMatchIds.map(Number) : []);
  if (rows.length && rows.some(row => !reviewed.has(Number(row.id)))) return { requiresReview: true, matches: rows };
  return { existingClientId: null, matches: rows };
}
