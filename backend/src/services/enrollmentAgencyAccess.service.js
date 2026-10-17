import User from '../models/User.model.js';

// Editing another agency's consent packet requires platform-wide authority.
export async function assertEnrollmentAgencyMembership(user, agencyId) {
  if (String(user?.role || '').toLowerCase() === 'super_admin') return;
  const memberships = user?.id ? await User.getAgencies(user.id) : [];
  if (!memberships.some(agency => Number(agency.id) === Number(agencyId))) {
    throw Object.assign(new Error('You do not have access to this agency’s enrollment settings.'), { status: 403 });
  }
}
