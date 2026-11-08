import pool from '../config/database.js';
import User from '../models/User.model.js';
const fail = (message, status=403) => Object.assign(new Error(message), { status, statusCode: status });
export async function authorizeReferralPacket({ user, agencyId, organizationId, draft = null }, users = User) {
  if (!user?.id) throw fail('Sign in to upload a packet.');
  if (user.role === 'super_admin') return;
  const memberships = await users.getAgencies(user.id);
  const ids = new Set(memberships.filter(row => row.is_active !== 0).map(row => Number(row.id)));
  if (user.role === 'school_staff') {
    if (!ids.has(Number(organizationId)) || (draft && Number(draft.uploaded_by_user_id) !== Number(user.id))) throw fail('This packet is not available to your school account.');
  } else if (!['admin','support','staff','clinical_practice_assistant','provider_plus'].includes(user.role) || !ids.has(Number(agencyId))) throw fail('You do not have packet-processing access for this agency.');
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
