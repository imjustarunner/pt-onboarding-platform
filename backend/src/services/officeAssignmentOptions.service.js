import pool from '../config/database.js';
import User from '../models/User.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';

const managers = ['super_admin', 'superadmin', 'admin', 'staff', 'support', 'provider_plus', 'clinical_practice_assistant'];
const internalRoles = ['provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin', 'superadmin', 'staff', 'support'];
const fail = (message, status = 403) => Object.assign(new Error(message), { status });

export async function officeAssignmentAgencies(actor, officeLocationId) {
  if (!managers.includes(String(actor?.role || '').toLowerCase())) throw fail('Only schedule managers can assign office time.');
  const offices = await OfficeLocationAgency.listAgenciesForOffice(officeLocationId);
  const memberships = ['super_admin', 'superadmin'].includes(actor.role) ? null : await User.getAgencies(actor.id);
  const allowed = offices.filter(a => !memberships || memberships.some(m => Number(m.id) === Number(a.id)));
  if (!allowed.length) throw fail('You do not have access to an agency at this office.');
  return allowed.map(a => ({ id: Number(a.id), name: a.name }));
}

export async function officeAssignmentOptions(actor, officeLocationId) {
  const agencies = await officeAssignmentAgencies(actor, officeLocationId);
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.has_provider_access,
            u.profile_photo_path, ua.agency_id
       FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id IN (${agencies.map(() => '?').join(',')})
        AND (u.is_active IS NULL OR u.is_active = TRUE)
        AND (u.is_archived IS NULL OR u.is_archived = FALSE)
        AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING','TERMINATED')
        AND (u.role IN (${internalRoles.map(() => '?').join(',')}) OR u.has_provider_access = TRUE)
        AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian','school_support')
      ORDER BY u.last_name, u.first_name, u.id`, [...agencies.map(a => a.id), ...internalRoles]);
  const people = new Map();
  for (const row of rows) {
    if (!people.has(Number(row.id))) {
      const { agency_id, ...person } = row;
      people.set(Number(row.id), { ...person, agencyIds: [] });
    }
    people.get(Number(row.id)).agencyIds.push(Number(row.agency_id));
  }
  return { agencies, people: [...people.values()] };
}

export async function resolveOfficeAssignmentAgency({ actor, officeLocationId, user, agencyId }) {
  const role = String(user?.role || '').toLowerCase();
  if (!user || ['guardian','school_support'].includes(role)
      || (!internalRoles.includes(role) && Number(user.has_provider_access) !== 1)
      || user.is_active === false || user.is_active === 0 || Number(user.is_archived) === 1
      || ['ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING','TERMINATED'].includes(String(user.status || '').toUpperCase())) {
    throw fail('Choose an active staff member or provider for this assignment.', 400);
  }
  const allowed = await officeAssignmentAgencies(actor, officeLocationId);
  const memberships = await User.getAgencies(user.id);
  const matches = allowed.filter(a => memberships.some(m => Number(m.id) === a.id));
  const selected = Number(agencyId || 0);
  if (selected && matches.some(a => a.id === selected)) return selected;
  if (selected) throw fail('The selected person and office must belong to an agency you can manage.');
  if (matches.length === 1) return matches[0].id;
  throw fail(matches.length ? 'Select the agency for this assignment.' : 'This person has no eligible agency at this office.', 400);
}

export async function getOfficeAssignmentOptions(req, res, next) {
  try {
    const id = Number(req.params.locationId);
    if (!Number.isInteger(id) || id <= 0) throw fail('Invalid office location.', 400);
    res.json(await officeAssignmentOptions(req.user, id));
  } catch (error) { next(error); }
}
