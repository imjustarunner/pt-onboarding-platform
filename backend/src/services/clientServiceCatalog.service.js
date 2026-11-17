import pool from '../config/database.js';
import { defaultsForOrganizationType, publicServiceTypesForBusinessTypes } from './businessTypeCapabilities.service.js';

/** Client services follow the agency's enabled business types, independently of roster links. */
export async function clientServiceKindsForAgency(agencyId, db = pool) {
  const [configured] = await db.execute(
    'SELECT business_type, is_enabled FROM agency_business_types WHERE agency_id = ? ORDER BY sort_order, business_type',
    [agencyId]
  );
  let types;
  if (configured.length) {
    types = configured.filter(row => Number(row.is_enabled) === 1).map(row => row.business_type);
  } else {
    const [[agency]] = await db.execute('SELECT organization_type FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
    types = defaultsForOrganizationType(agency?.organization_type);
  }
  return publicServiceTypesForBusinessTypes(types)
    .map(kind => kind === 'consulting' ? 'consultation' : kind)
    .filter(kind => ['counseling', 'tutoring', 'coaching', 'consultation'].includes(kind));
}
