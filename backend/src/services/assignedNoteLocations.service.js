import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import {listUserOfficeIds,listUserSchoolIds} from './officeBillingSites.service.js';
import {buildNoteAidLocationChoices} from './noteAidLocations.service.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

// Call only after the request's clinical agency access has been authorized.
export async function assignedNoteLocations(userId,agencyId) {
 const [locations,offices,officeIds,schoolIds]=await Promise.all([
  AgencyServiceLocation.listByAgency(agencyId),OfficeLocation.findBillingByAgency(agencyId),
  listUserOfficeIds(userId),listUserSchoolIds(userId)
 ]);
 const choices=buildNoteAidLocationChoices({locations,offices,officeIds,schoolIds});
 const assigned=new Set(schoolIds.map(Number));
 if(assigned.size) {
  const schools=await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
  for(const school of schools)if(assigned.has(Number(school.id)) && String(school.organization_type).toLowerCase()==='school' && !choices.some(choice=>Number(choice.schoolOrganizationId)===Number(school.id))) {
   // Offer the actual assigned school without creating/enabling a billing site.
   choices.push({value:`school:${school.id}`,name:school.name,label:school.name,placeOfService:'03',schoolOrganizationId:Number(school.id),serviceLocationId:null,billingOfficeLocationId:null,aliases:[school.name]});
  }
 }
 return choices;
}
