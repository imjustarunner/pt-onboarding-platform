import pool from '../config/database.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// Administrative access alone does not make someone a care provider.
export const PROVIDER_ROLE_SQL = `(LOWER(COALESCE(u.role, '')) IN
  ('provider', 'provider_plus', 'clinician', 'therapist', 'counselor', 'supervisor', 'intern', 'intern_plus', 'clinical_practice_assistant')
  OR COALESCE(u.has_provider_access, 0) = 1)`;

/** Availability overrides are agency-specific care assignments, not application role grants. */
export function agencyAssignableProviderSql() {
  const choice = `JSON_UNQUOTE(JSON_EXTRACT(profile.public_details_json, CONCAT('$.availabilityByAgency."', ua.agency_id, '".seesClients')))`;
  return `(CASE WHEN ${choice} IN ('false','0') THEN FALSE
    WHEN ${choice} IN ('true','1') THEN TRUE
    ELSE COALESCE(u.sees_clients,1)=1 AND (${PROVIDER_ROLE_SQL}
      OR (LOWER(COALESCE(NULLIF(ua.agency_role,''),u.role,'')) IN ('admin','super_admin') AND u.sees_clients=1)
      OR LOWER(COALESCE(NULLIF(ua.agency_role,''),u.role,'')) IN ('provider','provider_plus','clinician','therapist','counselor','supervisor','intern','intern_plus','clinical_practice_assistant','tutor','coach','consultant')
      OR EXISTS(SELECT 1 FROM provider_public_service_enrollments care WHERE care.user_id=u.id AND care.agency_id=ua.agency_id AND care.is_active=1)
      OR EXISTS(SELECT 1 FROM client_service_enrollments care WHERE care.provider_user_id=u.id AND care.agency_id=ua.agency_id AND care.is_active=1)) END)`;
}

export async function clientAgencyIds(clientId, db = pool) {
  const [[client]] = await db.execute('SELECT agency_id FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (!client) throw fail(404, 'Client not found');
  const ids = new Set([Number(client.agency_id)].filter(id => id > 0));
  try {
    const [memberships] = await db.execute(
      'SELECT agency_id FROM client_agency_assignments WHERE client_id = ? AND is_active = TRUE',
      [clientId]
    );
    for (const membership of memberships) if (Number(membership.agency_id) > 0) ids.add(Number(membership.agency_id));
  } catch (error) {
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(error?.message || ''))) throw error;
  }
  return [...ids];
}

export async function assertAssignableProvider({ clientId, providerUserId, agencyId = null }, db = pool) {
  const affiliated = await clientAgencyIds(clientId, db);
  const agencyIds = agencyId == null ? affiliated : affiliated.filter(id => id === Number(agencyId));
  if (!agencyIds.length) throw fail(400, 'Link this client to the agency before assigning a provider.');
  const [[provider]] = await db.execute(
    `SELECT u.id FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     LEFT JOIN provider_public_profiles profile ON profile.user_id = u.id
     WHERE u.id = ? AND ua.agency_id IN (${agencyIds.map(() => '?').join(',')})
       AND COALESCE(u.is_active, 1) = 1 AND COALESCE(ua.is_active, 1) = 1
       AND ${agencyAssignableProviderSql()}
     LIMIT 1`,
    [providerUserId, ...agencyIds]
  );
  if (!provider) throw fail(400, 'Choose an active provider from one of this client’s agencies.');
}

export async function syncPrimaryClientBookingDefaults(clientId, clientData, db = pool) {
  const fields = ['default_office_location_id', 'default_place_of_service', 'default_service_location_id']
    .filter(field => clientData[field] !== undefined);
  if (!fields.length) return;
  try {
    // Read after the client update so changes to the chart agency use its actual agency.
    const [[client]] = await db.execute('SELECT agency_id FROM clients WHERE id = ? LIMIT 1', [clientId]);
    if (!Number(client?.agency_id)) return;
    await db.execute(
      `INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active, ${fields.join(', ')})
       VALUES (?, ?, TRUE, TRUE, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${fields.map(field => `${field} = VALUES(${field})`).join(', ')}`,
      [clientId, client.agency_id, ...fields.map(field => clientData[field] === '' ? null : clientData[field])]
    );
  } catch (error) {
    if (!/Unknown column|doesn't exist|ER_NO_SUCH_TABLE/i.test(String(error?.message || ''))) throw error;
  }
}

export async function bookingDefaultsForChartAgency({ clientId, agencyId, previousClient, explicitDefaults = {} }, db = pool) {
  let membership = null;
  try {
    const [[row]] = await db.execute(
      `SELECT default_office_location_id, default_place_of_service, default_service_location_id
       FROM client_agency_assignments WHERE client_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
      [clientId, agencyId]
    );
    membership = row;
  } catch (error) {
    if (!/Unknown column|doesn't exist|ER_NO_SUCH_TABLE/i.test(String(error?.message || ''))) throw error;
  }
  const sameAgency = Number(previousClient?.agency_id) === Number(agencyId);
  return Object.fromEntries(['default_office_location_id', 'default_place_of_service', 'default_service_location_id']
    .map(field => [field, explicitDefaults[field] !== undefined ? explicitDefaults[field]
      : membership?.[field] ?? (sameAgency ? previousClient?.[field] ?? null : null)]));
}
