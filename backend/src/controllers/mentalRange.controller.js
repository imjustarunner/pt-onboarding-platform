import { readPublicSnapshot } from '../services/publicReadSnapshot.service.js';
import {restrictPublicInsurances} from '../utils/publicProviderPresentation.js';
import {readPublicProviderSchedule} from '../services/publicProviderSchedule.service.js';
import {listPublicProviderOffices} from '../services/publicProviderOffices.service.js';
import {listProviderAcceptedInsurancesForDisplay} from '../services/providerAcceptedInsurance.service.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import {agencyOfficeAllowed} from '../utils/providerAgencyAvailability.js';
async function enrichProvider(dto,row) {
 const [offices,profile,accepted]=await Promise.all([
  listPublicProviderOffices(dto.agencyId,[dto.id]),Profile.getForProvider({providerUserId:dto.id,agencyId:dto.agencyId}),
  dto.service==='counseling'?listProviderAcceptedInsurancesForDisplay({userId:dto.id,agencyId:dto.agencyId}):[]
 ]);
 const locations=(offices.get(dto.id)||[]).filter(o=>agencyOfficeAllowed(profile?.agencyAvailability,o.id));
 const [schools]=await pool.execute(`SELECT DISTINCT a.id,a.name FROM provider_school_assignments p JOIN agencies a ON a.id=p.school_organization_id
  JOIN organization_affiliations f ON f.organization_id=a.id AND f.agency_id=? AND f.is_active=1
  WHERE p.provider_user_id=? AND p.is_active=1 AND COALESCE(a.is_archived,0)=0
  AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_schools h WHERE h.agency_id=? AND h.school_organization_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_providers h WHERE h.agency_id=? AND h.school_organization_id=a.id AND h.provider_user_id=p.provider_user_id)`,[dto.agencyId,dto.id,dto.agencyId,dto.agencyId]);
 return {...dto,gender:profile?.details?.gender||'',languages:profile?.details?.languages||[],locations,
  schools:dto.school?schools:[],inPerson:profile?.agencyAvailability?dto.inPerson:locations.length>0||Boolean(row.in_office_available),
  insurances:restrictPublicInsurances([...new Set([...dto.insurances,...accepted.map(i=>i.name)])],row)};
}
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { listClinicalFacetsForUsers } from '../services/providerClinicalFacets.service.js';
import { createMentalRangeHandlers } from '../services/mentalRangeHandlers.service.js';
export const { rangePartners, rangeProviders, rangeAvailability, getRangeMembership, saveRangeMembership } = createMentalRangeHandlers({ pool, publicUploadsUrlFromStoredPath, listClinicalFacetsForUsers, readPublicProviderSchedule, enrichProvider, readPublicSnapshot });
