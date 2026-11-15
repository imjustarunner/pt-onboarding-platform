import pool from '../config/database.js';
import { appointmentServiceKind } from '../utils/guardianCancellationScope.js';

const fail = message => Object.assign(new Error(message), { status: 409, code: 'CLIENT_SERVICE_CONTEXT_MISMATCH' });
const isActive = row => Number(row.is_active) === 1 && (!row.service_status || row.service_status === 'active');

/** Enrollment belongs to a client + agency + service; a chart type is only a legacy fallback. */
export async function readClientServiceContext({ agencyId, clientId, providerId = null }, db = pool) {
  const [[client]] = await db.execute(`SELECT c.id,c.client_type FROM clients c WHERE c.id=? AND
    (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`,
  [clientId, agencyId, agencyId]);
  if (!client) throw Object.assign(new Error('Client not found for this agency.'), { status: 404 });
  const [rows] = await db.execute('SELECT service_kind,provider_user_id,is_active,service_status FROM client_service_enrollments WHERE client_id=? AND agency_id=?', [clientId, agencyId]);
  const active = rows.filter(row => isActive(row) && (!providerId || !Number(row.provider_user_id) || Number(row.provider_user_id) === Number(providerId)));
  const legacyKind = ({ clinical: 'counseling', school: 'counseling', learning: 'tutoring', tutoring: 'tutoring' })[client.client_type];
  return { clientId: Number(clientId), agencyId: Number(agencyId), explicit: rows.length > 0,
    serviceKinds: rows.length ? [...new Set(active.map(row => row.service_kind))] : (legacyKind ? [legacyKind] : []) };
}

export async function requireClientServiceKind({ agencyId, clientIds = [], providerId, serviceKind }, db = pool) {
  for (const clientId of [...new Set(clientIds.map(Number).filter(id => id > 0))]) {
    const context = await readClientServiceContext({ agencyId, clientId, providerId }, db);
    if (!context.serviceKinds.includes(serviceKind)) throw fail('This client is not enrolled in that service with this agency and provider. Review Assignments before booking.');
  }
}

/** Catalog identity, rather than a CPT prefix or the provider's other agency, defines the offering. */
export async function assertAppointmentServiceContext({ agencyId, clientIds, providerId, service, businessType, serviceCode, addonServiceCodes = [] }, db = pool) {
  const kind = appointmentServiceKind({ businessType });
  if (service?.serviceCode && serviceCode && String(service.serviceCode).toUpperCase() !== String(serviceCode).toUpperCase()) {
    throw fail('The service code does not belong to the selected agency service. Choose its configured code.');
  }
  if (kind !== 'counseling' && (addonServiceCodes.length || (serviceCode && (!service?.serviceCode || String(service.serviceCode).toUpperCase() !== String(serviceCode).toUpperCase())))) {
    throw fail('Choose a code configured for this service. Clinical add-on codes are only available for counseling.');
  }
  await requireClientServiceKind({ agencyId, clientIds, providerId, serviceKind: kind }, db);
}

export async function filterBookingServicesForClient(services, input, db = pool) {
  if (!input.clientId) return services;
  const context = await readClientServiceContext(input, db);
  return services.filter(service => context.serviceKinds.includes(appointmentServiceKind({ businessType: service.businessType })));
}

export async function clinicalCodesForClientContext(codes, { agencyId, providerId, clientIds = [], businessType }, db = pool) {
  if (businessType && !['mental_health', 'healthcare', 'counseling'].includes(businessType)) return [];
  for (const clientId of [...new Set(clientIds.map(Number).filter(id => id > 0))]) {
    const context = await readClientServiceContext({ agencyId, clientId, providerId }, db);
    if (!context.serviceKinds.includes('counseling')) return [];
  }
  return codes;
}

/** Add only already-authorized roster rows, with agency/provider scopes preserved. */
export async function attachRosterServiceContexts(clients, { agencyIds, providerId }, db = pool) {
  if (!clients.length || !agencyIds.length) return clients;
  const ids = [...new Set(clients.map(row => Number(row.id)))];
  const [services] = await db.execute(`SELECT e.client_id,e.agency_id,e.service_kind,e.label,e.service_status,e.is_active,
    a.name AS agency_name,o.name AS organization_name,o.organization_type
    FROM client_service_enrollments e JOIN clients c ON c.id=e.client_id JOIN agencies a ON a.id=e.agency_id
    LEFT JOIN agencies o ON o.id=e.organization_id
    WHERE e.client_id IN (${ids.map(() => '?').join(',')}) AND e.agency_id IN (${agencyIds.map(() => '?').join(',')})
    AND (c.agency_id=e.agency_id OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=e.agency_id AND ca.is_active=1))
    ${providerId ? 'AND (e.provider_user_id=? OR e.provider_user_id=0)' : ''}`,
  [...ids, ...agencyIds, ...(providerId ? [providerId] : [])]);
  return clients.map(client => ({ ...client, service_contexts: services.filter(row => Number(row.client_id) === Number(client.id)) }));
}
