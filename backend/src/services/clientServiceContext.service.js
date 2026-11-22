import pool from '../config/database.js';
import { activeChartOrganizationJoin, organizationChartType } from './clientChartOrganizations.js';
import { appointmentServiceKind } from '../utils/guardianCancellationScope.js';

const fail = message => Object.assign(new Error(message), { status: 409, code: 'CLIENT_SERVICE_CONTEXT_MISMATCH' });
const isActive = row => Number(row.is_active) === 1 && (!row.service_status || row.service_status === 'active');

/** Enrollment belongs to a client + agency + service; a chart type is only a legacy fallback. */
export async function readClientServiceContext({ agencyId, clientId, providerId = null }, db = pool) {
  const [[client]] = await db.execute(`SELECT c.id,c.agency_id,c.client_type,o.organization_type FROM clients c
    LEFT JOIN agencies o ON o.id=c.organization_id AND o.is_active=1 AND COALESCE(o.is_archived,0)=0
      AND NOT EXISTS (SELECT 1 FROM client_organization_assignments old WHERE old.client_id=c.id AND old.organization_id=o.id AND old.is_active=0)
    WHERE c.id=? AND
    (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`,
  [clientId, agencyId, agencyId]);
  if (!client) throw Object.assign(new Error('Client not found for this agency.'), { status: 404 });
  const [rows] = await db.execute('SELECT id,label,service_kind,provider_user_id,is_active,service_status FROM client_service_enrollments WHERE client_id=? AND agency_id=?', [clientId, agencyId]);
  const active = rows.filter(row => isActive(row) && (!providerId || !Number(row.provider_user_id) || Number(row.provider_user_id) === Number(providerId)));
  const kinds = {clinical:'counseling',school:'counseling',learning:'tutoring',tutoring:'tutoring'};
  const legacyKind = Number(client.agency_id) === Number(agencyId) ? kinds[client.client_type] || kinds[client.organization_type] : null;
  return { clientId: Number(clientId), agencyId: Number(agencyId), explicit: rows.length > 0,
    serviceEnrollments: active, serviceKinds: rows.length ? [...new Set(active.map(row => row.service_kind))] : (legacyKind ? [legacyKind] : []) };
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
  return services.filter(service => context.serviceKinds.includes(appointmentServiceKind({ businessType: service.businessType }))).map(service=>{
    if(service.businessType!=='tutoring')return service;
    const enrollments=context.serviceEnrollments.filter(row=>row.service_kind==='tutoring'&&(!input.providerId||Number(row.provider_user_id)===Number(input.providerId)));
    const labels=[...new Set(enrollments.map(row=>String(row.label||'').trim()).filter(Boolean))];
    return labels.length?{...service,enrollmentLabel:labels.join(' / ')}:service;
  });
}

export async function clinicalBookingContextIssue({ agencyId, providerId, clientIds = [], businessType }, db = pool) {
  if (businessType && !['mental_health', 'healthcare', 'counseling'].includes(businessType)) return 'Select Counseling to book a clinical service code.';
  try {
    await requireClientServiceKind({ agencyId, clientIds, providerId, serviceKind: 'counseling' }, db);
  } catch (error) {
    if (error.code === 'CLIENT_SERVICE_CONTEXT_MISMATCH') return error.message;
    throw error;
  }
  return '';
}

export async function clinicalCodesForClientContext(codes, input, db = pool) {
  return await clinicalBookingContextIssue(input, db) ? [] : codes;
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
  // Only expose manual roster categories on the already-authorized owning chart.
  // Linked charts can have different selections for the same person.
  const [settings] = await db.execute(`SELECT c.id AS client_id,s.selected_types,o.organization_type
    FROM clients c LEFT JOIN client_chart_type_selections s ON c.id=s.client_id AND c.agency_id=s.agency_id
    ${activeChartOrganizationJoin('c.agency_id')}
    WHERE c.id IN (${ids.map(() => '?').join(',')}) AND c.agency_id IN (${agencyIds.map(() => '?').join(',')})`, [...ids,...agencyIds]);
  const selections = new Map(), organizationTypes = new Map();
  for (const row of settings) {
    const id = Number(row.client_id);
    const saved = typeof row.selected_types === 'string' ? JSON.parse(row.selected_types) : row.selected_types;
    if (saved) selections.set(id, saved.types);
    if (!organizationTypes.has(id)) organizationTypes.set(id, new Set());
    const type = organizationChartType(row.organization_type);
    if (type) organizationTypes.get(id).add(type);
  }
  return clients.map(client => ({
    ...client, roster_selected_types: selections.get(Number(client.id)) ?? null,
    roster_organization_types: organizationTypes.has(Number(client.id)) ? [...organizationTypes.get(Number(client.id))] : null,
    service_contexts: services.filter(row => Number(row.client_id) === Number(client.id))
  }));
}
