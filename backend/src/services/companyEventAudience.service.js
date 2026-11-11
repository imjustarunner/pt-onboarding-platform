import pool from '../config/database.js';
import { EVENT_STAFF_ROLES_SQL, readEventOperations } from '../utils/companyEventOperations.js';

const ids = values => [...new Set((Array.isArray(values) ? values : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
const invalid = message => Object.assign(new Error(message), { status: 400, statusCode: 400 });
const forbidden = message => Object.assign(new Error(message), { status: 403, statusCode: 403 });

// Exclude obvious imported prose, while retaining long and international personal names.
// This affects invitations only; it never deletes or changes a person's record.
export function hasPersonDisplayName(user) {
  const name = String(user.name || [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean).join(' ')).trim();
  if (!name) return !!String(user.email || '').trim();
  const words = name.split(/\s+/u);
  return name.length <= 120 && words.length <= 12 && !(words.length > 6 && /[.!?](?:\s|$)/u.test(name));
}

export function companyEventAgencyIds(event = {}) {
  const operations = event.operations_json !== undefined ? readEventOperations(event) : event;
  return ids([event.agency_id || event.agencyId, ...(operations.invitedAgencyIds || [])]);
}

export async function listCompanyEventStaff(agencyIds, db = pool) {
  const selected = ids(agencyIds);
  if (!selected.length) return [];
  const [rows] = await db.execute(`SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_active, u.is_archived, u.status, u.terminated_at,
      u.phone_number, u.personal_phone, u.work_phone, u.work_email, u.personal_email, u.sso_password_override, u.login_is_group_email,
      ua.agency_id, ua.agency_role, ua.is_active AS membership_active,
      a.name AS agency_name, p.notification_categories
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id JOIN agencies a ON a.id = ua.agency_id
    LEFT JOIN user_preferences p ON p.user_id = u.id
    WHERE ua.agency_id IN (${selected.map(() => '?').join(',')}) AND COALESCE(ua.is_active, 1) = 1
      AND COALESCE(a.is_active, 1) = 1 AND COALESCE(a.is_archived, 0) = 0
      AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
      AND COALESCE(u.is_assistant_account, 0) = 0 AND COALESCE(u.is_demo, 0) = 0 AND COALESCE(u.created_via_dev_fill, 0) = 0
      AND UPPER(COALESCE(u.status, '')) NOT IN ('INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING', 'PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN')
      AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
      AND (ua.agency_role IS NULL OR LOWER(ua.agency_role) IN (${EVENT_STAFF_ROLES_SQL}))
    ORDER BY u.first_name, u.last_name, u.id`, selected);
  const merged = new Map();
  for (const row of rows) {
    if (!hasPersonDisplayName(row)) continue;
    const id = Number(row.id);
    const current = merged.get(id) || { ...row, id, name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email,
      firstName: row.first_name || '', lastName: row.last_name || '', agencyIds: [], agencyNames: [] };
    if (!current.agencyIds.includes(Number(row.agency_id))) {
      current.agencyIds.push(Number(row.agency_id)); current.agencyNames.push(row.agency_name);
    }
    merged.set(id, current);
  }
  return [...merged.values()].map(user => ({ ...user, agencyId: selected.find(id => user.agencyIds.includes(id)) }));
}

export async function listEventManagedAgencies(actor, db = pool) {
  if (!actor?.id || !['super_admin', 'admin', 'staff', 'support'].includes(String(actor.role || '').toLowerCase())) return [];
  const superAdmin = String(actor.role).toLowerCase() === 'super_admin';
  const [rows] = await db.execute(`SELECT DISTINCT a.id, a.name, a.logo_url FROM agencies a
    ${superAdmin ? '' : "JOIN user_agencies ua ON ua.agency_id = a.id AND ua.user_id = ? AND COALESCE(ua.is_active, 1) = 1 AND (ua.agency_role IS NULL OR LOWER(ua.agency_role) IN ('super_admin','admin','staff','support'))"}
    WHERE COALESCE(a.is_active, 1) = 1 AND COALESCE(a.is_archived, 0) = 0
      AND COALESCE(a.organization_type, 'agency') IN ('agency', 'company') ORDER BY a.name`, superAdmin ? [] : [actor.id]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, logoUrl: row.logo_url || null }));
}

export async function assertEventAgencyScope({ actor, agencyId, invitedAgencyIds, db = pool }) {
  const extras = ids(invitedAgencyIds).filter(id => id !== Number(agencyId));
  if (!extras.length) return [Number(agencyId)];
  const permitted = new Set((await listEventManagedAgencies(actor, db)).map(agency => agency.id));
  if (extras.some(id => !permitted.has(id))) throw forbidden('You can invite another agency only when you have event management access to it.');
  return ids([agencyId, ...extras]);
}

export async function resolveCompanyEventAudienceUserIds({ event, audience = null, db = pool }) {
  const members = await listCompanyEventStaff(companyEventAgencyIds(event), db);
  if (!audience) {
    const [rows] = await db.execute('SELECT audience_type, target_id FROM company_event_audiences WHERE company_event_id = ?', [Number(event.id)]);
    audience = { userIds: [], groupIds: [], roleKeys: [] };
    const roles = { 1: 'provider', 2: 'supervisor', 3: 'admin', 4: 'support', 5: 'staff', 6: 'school_staff', 7: 'clinical_practice_assistant', 8: 'intern' };
    for (const row of rows) {
      if (row.audience_type === 'user') audience.userIds.push(Number(row.target_id));
      if (row.audience_type === 'group') audience.groupIds.push(Number(row.target_id));
      if (row.audience_type === 'role' && roles[row.target_id]) audience.roleKeys.push(roles[row.target_id]);
    }
  }
  const chosenUsers = new Set(ids(audience.userIds)), groupIds = ids(audience.groupIds), roleKeys = audience.roleKeys || [];
  if (!chosenUsers.size && !groupIds.length && !roleKeys.length) return members.map(user => user.id);
  if (groupIds.length) {
    const scope = companyEventAgencyIds(event);
    const [rows] = await db.execute(`SELECT DISTINCT p.provider_user_id FROM skills_group_providers p JOIN skills_groups g ON g.id = p.skills_group_id
      WHERE g.id IN (${groupIds.map(() => '?').join(',')}) AND g.agency_id IN (${scope.map(() => '?').join(',')})
      AND COALESCE(g.is_active, 1) = 1 AND (g.end_date IS NULL OR g.end_date >= CURRENT_DATE())`, [...groupIds, ...scope]);
    for (const row of rows) chosenUsers.add(Number(row.provider_user_id));
  }
  return members.filter(user => chosenUsers.has(user.id) || roleKeys.includes(String(user.role).toLowerCase())).map(user => user.id);
}

export async function isCompanyEventInvitee({ event, userId, db = pool }) {
  return (await resolveCompanyEventAudienceUserIds({ event, db })).includes(Number(userId));
}

export async function listCompanyEventInvitees({ event, db = pool }) {
  const invited = new Set(await resolveCompanyEventAudienceUserIds({ event, db }));
  return (await listCompanyEventStaff(companyEventAgencyIds(event), db)).filter(user => invited.has(user.id));
}

export async function validateCompanyEventAudience({ event, audience, mandatoryUserIds = [], db = pool }) {
  const members = await listCompanyEventStaff(companyEventAgencyIds(event), db);
  const eligible = new Set(members.map(user => user.id));
  if (ids(audience?.userIds).some(id => !eligible.has(id))) throw invalid('Choose active people from the invited agencies. Refresh the people list to see current staff.');
  const groupIds = ids(audience?.groupIds);
  if (groupIds.length) {
    const scope = companyEventAgencyIds(event);
    const [groups] = await db.execute(`SELECT id FROM skills_groups WHERE id IN (${groupIds.map(() => '?').join(',')})
      AND agency_id IN (${scope.map(() => '?').join(',')}) AND COALESCE(is_active, 1) = 1 AND (end_date IS NULL OR end_date >= CURRENT_DATE())`, [...groupIds, ...scope]);
    if (groups.length !== groupIds.length) throw invalid('Choose active groups from the invited agencies. Completed and inactive groups cannot be invited.');
  }
  if (mandatoryUserIds.length) {
    const invited = new Set(await resolveCompanyEventAudienceUserIds({ event, audience, db }));
    if (mandatoryUserIds.some(id => !invited.has(Number(id)))) throw invalid('Mandatory attendees must also be included in this event’s audience.');
  }
}
