import { serviceLocationForOffice } from './officeBillingDefaults.js';

const active = row => ![false, 0, '0'].includes(row?.is_active ?? row?.isActive);
const primary = row => [true, 1, '1'].includes(row?.is_primary ?? row?.isPrimary);
export function assignmentOfficesForAgency(offices, agencyId) {
  return offices.filter(office => active(office) &&
    (Number(office.agency_id) === Number(agencyId) || (office.agencyIds || []).some(id => Number(id) === Number(agencyId))));
}
export function primaryAssignmentProvider(client, services = [], serviceKind = null) {
  const current = services.filter(service => active(service) && !['discontinued','completed','terminated','canceled'].includes(service.service_status));
  if (serviceKind) {
    const matching = current.filter(row => row.service_kind === serviceKind && Number(row.provider_user_id) > 0);
    return Number((matching.find(primary) || matching[0])?.provider_user_id || 0);
  }
  const counseling = current.filter(service => service.service_kind === 'counseling');
  const service = counseling.find(primary) || counseling[0] || current.find(primary) || current[0];
  return service ? Number(service.provider_user_id || 0) : services.length ? 0 : Number(client?.provider_id || 0);
}
export function providerOfficeDefaults({ assigned, offices, locations = [], agencyId }) {
  const scoped = assignmentOfficesForAgency(offices, agencyId);
  const candidates = assigned.filter(active).sort((a,b) => Number(primary(b)) - Number(primary(a)));
  for (const assignment of candidates) {
    const id = Number(assignment.office_location_id || assignment.officeLocationId || assignment.id);
    const matching = scoped.filter(row => Number(row.physical_office_location_id || row.physicalOfficeLocationId || row.id) === id || Number(row.id) === id);
    const office = matching.find(row => Number(row.agency_id) === Number(agencyId) && (row.physical_office_location_id || row.physicalOfficeLocationId))
      || matching.find(row => Number(row.agency_id) === Number(agencyId)) || matching[0];
    if (!office) continue;
    const pos = String(office.default_place_of_service || office.defaultPlaceOfService || '11');
    const location = serviceLocationForOffice(locations.filter(row => !row.agency_id || Number(row.agency_id) === Number(agencyId)), office.id, pos);
    return { officeId: String(office.id), pos, serviceLocationId: location?.id ? String(location.id) : '' };
  }
  return null;
}
