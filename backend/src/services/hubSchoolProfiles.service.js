import pool from '../config/database.js';

// Resolve school memberships within the conversation's tenant, not the tenant's
// display name. Callers have already authorized access to these people/messages.
export async function enrichHubSchoolStaff(people) {
  const staff = people.filter(p => p?.kinds?.includes('school_staff') && p.userId && p.agencyId);
  if (!staff.length) return people;
  const users = [...new Set(staff.map(p => Number(p.userId)))];
  const agencies = [...new Set(staff.map(p => Number(p.agencyId)))];
  const placeholders = values => values.map(() => '?').join(',');
  let rows;
  try {
    [rows] = await pool.execute(`SELECT DISTINCT ua.user_id, a.id AS school_id, a.name AS school_name,
      oa.agency_id AS tenant_id
    FROM user_agencies ua
    JOIN agencies a ON a.id = ua.agency_id
    LEFT JOIN organization_affiliations oa ON oa.organization_id = a.id AND oa.is_active = 1
    WHERE ua.user_id IN (${placeholders(users)})
      AND (ua.is_active = 1 OR ua.is_active IS NULL)
      AND LOWER(a.organization_type) IN ('school', 'district')
      AND (a.id IN (${placeholders(agencies)}) OR oa.agency_id IN (${placeholders(agencies)}))
    ORDER BY a.name`, [...users, ...agencies, ...agencies]);
  } catch (error) {
    // Optional profile details must never prevent opening the message itself.
    console.warn('[messagesHub] school profile lookup unavailable:', error?.code || 'lookup_failed');
    return people;
  }
  return people.map(person => {
    if (!person?.kinds?.includes('school_staff')) return person;
    const schoolNames = [...new Set(rows.filter(row => Number(row.user_id) === Number(person.userId)
      && (Number(row.school_id) === Number(person.agencyId) || Number(row.tenant_id) === Number(person.agencyId)))
      .map(row => row.school_name).filter(Boolean))];
    return { ...person, schoolNames, relationshipMeta: ['School staff', ...schoolNames].join(' · ') };
  });
}
