const text = value => String(value ?? '').trim();
export const normalizeSchoolLocation = value => text(value).normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const ids = value => (Array.isArray(value) ? value : text(value).split(',')).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
const pos = value => {
  const v = text(value);
  if (/^\d{1,2}$/.test(v)) return v.padStart(2, '0');
  return v.match(/^(?:POS\s*)?(\d{2})(?:\s*[-:–—]\s*|\s+|$)/i)?.[1] || null;
};
const result = (schoolService, evidenceStatus, reasonCodes, extra = {}) => ({ schoolService, schoolOrganizationId: null, locationId: null, evidenceStatus, reasonCodes, ...extra });

/** Classification uses the reported service site. A client's default site never substitutes for a report location. */
export function classifySchoolServiceEvidence({ client, placeOfService, location, schoolLocations = [], schoolOrganizations = [] }) {
  const reportedPos = pos(placeOfService);
  const locationKey = normalizeSchoolLocation(location);
  const matchingLocations = locationKey ? schoolLocations.filter(l => [l.name, l.report_name, ...(l.aliases || [])].some(name => normalizeSchoolLocation(name) === locationKey)) : [];
  const matchingSchools = locationKey ? schoolOrganizations.filter(s => [s.name, s.report_name, ...(s.aliases || [])].some(name => normalizeSchoolLocation(name) === locationKey)) : [];
  const locationCandidates = new Map();
  for (const l of matchingLocations) {
    const schoolId = Number(l.school_organization_id || l.schoolOrganizationId) || null;
    const isSchool = !!schoolId || text(l.location_kind || l.locationKind).toLowerCase() === 'school' || pos(l.place_of_service || l.placeOfService) === '03';
    locationCandidates.set(`location:${l.id}`, { id: Number(l.id) || null, schoolId, isSchool });
  }
  for (const s of matchingSchools) {
    if (![...locationCandidates.values()].some(l => l.schoolId === Number(s.id))) locationCandidates.set(`school:${s.id}`, { id: null, schoolId: Number(s.id), isSchool: true });
  }
  const candidates = [...locationCandidates.values()];
  const schoolSites = candidates.filter(l => l.isSchool);
  const nonSchoolSites = candidates.filter(l => !l.isSchool);
  // A report explicitly describing an office/home/telehealth site cannot earn this school-only benefit.
  if (reportedPos && reportedPos !== '03') {
    return schoolSites.length
      ? result(false, 'review', ['reported_pos_location_conflict'])
      : result(false, 'excluded', ['reported_non_school_pos']);
  }
  if (nonSchoolSites.length && schoolSites.length) return result(false, 'review', ['ambiguous_service_location']);
  if (nonSchoolSites.length) return reportedPos === '03'
    ? result(false, 'review', ['reported_pos_location_conflict'])
    : result(false, 'excluded', ['reported_non_school_location'], { locationId: nonSchoolSites.length === 1 ? nonSchoolSites[0].id : null });
  if (schoolSites.length > 1) return result(false, 'review', ['ambiguous_school_location']);
  if (!client?.id) return result(false, 'review', ['client_identity_not_matched']);
  const knownSchools = new Set(schoolOrganizations.map(s => Number(s.id)));
  const clientSchools = new Set([...ids(client.schoolOrganizationIds || client.school_organization_ids), ...(knownSchools.has(Number(client.organization_id || client.organizationId)) ? [Number(client.organization_id || client.organizationId)] : [])].filter(id => knownSchools.has(id)));
  if (!clientSchools.size) return text(client.client_type || client.clientType).toLowerCase() === 'school'
    ? result(false, 'review', ['school_client_affiliation_missing'])
    : result(false, 'excluded', ['client_has_no_school_affiliation']);
  const site = schoolSites[0];
  if (site?.schoolId && !clientSchools.has(site.schoolId)) return result(false, 'review', ['client_school_location_conflict']);
  if (reportedPos === '03' || site) return result(true, 'verified_school', [reportedPos === '03' ? 'reported_school_pos' : 'reported_school_location'], { schoolOrganizationId: site?.schoolId || (clientSchools.size === 1 ? [...clientSchools][0] : null), locationId: site?.id || null });
  return result(false, 'review', ['school_service_location_missing']);
}

export function isPayableSchoolReportRow(row) {
  const status = text(row.note_status ?? row.noteStatus).toUpperCase();
  return status === 'FINALIZED' || (status === 'DRAFT' && Number(row.draft_payable ?? row.draftPayable ?? 1) === 1);
}

/** Receives the existing approved payroll calculation for a row, never guessed elapsed minutes. */
export function schoolBasisFromApprovedLine(line) {
  const hours = Number(line?.hourEquivalent);
  if (!Number.isFinite(hours) || hours < 0) throw new Error('Approved school-service quantity is missing or invalid');
  const type = text(line?.payType).toLowerCase();
  if (type === 'flat' || type === 'skip' || type === 'indirect' || type === 'support_activity') return { basisHours: 0, directServiceHours: 0, clinicalAdministrativeEquivalentHours: 0, automaticIndirectHours: 0 };
  if (!['credit', 'hcode'].includes(type)) throw new Error('School-service compensation mapping needs review');
  const clinicalAdministrativeEquivalentHours = type === 'credit' ? hours * 0.2 : 0;
  const automaticIndirectHours = type === 'hcode' ? Number(line.autoIndirectHours || 0) : 0;
  if (!Number.isFinite(automaticIndirectHours) || automaticIndirectHours < 0) throw new Error('School-service indirect allowance is invalid');
  return { basisHours: hours + clinicalAdministrativeEquivalentHours + automaticIndirectHours, directServiceHours: hours, clinicalAdministrativeEquivalentHours, automaticIndirectHours };
}
