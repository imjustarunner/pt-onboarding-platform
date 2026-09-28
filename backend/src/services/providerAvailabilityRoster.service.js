import pool from '../config/database.js';
import {scopeProviderProfile} from '../utils/providerAgencyAvailability.js';
import {providerAvailabilityPreferences} from '../utils/providerAvailabilityReminders.js';
import {publicUploadsUrlFromStoredPath} from '../utils/uploads.js';
import {providerServiceSettings} from '../utils/providerServiceOfferings.js';
import {listPublicProviderOffices} from './publicProviderOffices.service.js';

// Enrich only IDs already authorized by the provider directory. No calendar fan-out
// is needed to display or edit the roster's recorded preferences.
export async function enrichAvailabilityRoster(rows, agencyId, database=pool) {
 if(!rows.length)return [];
 const ids=rows.map(p=>Number(p.id)),marks=ids.map(()=>'?').join(',');
 const [[people],[types],[enrollments],offices]=await Promise.all([
  database.execute(`SELECT u.id,ua.agency_role,a.organization_type,u.role,u.status,u.has_provider_access,u.title,u.credential,u.profile_photo_path,u.sees_clients,u.provider_accepting_new_clients,u.in_office_available,p.public_details_json,p.accepting_new_clients_override,
   EXISTS(SELECT 1 FROM provider_in_person_slot_availability v WHERE v.provider_id=u.id AND v.agency_id=? AND v.is_active=1 AND v.end_at>UTC_TIMESTAMP()) AS published_in_person,
   (EXISTS(SELECT 1 FROM provider_virtual_slot_availability v WHERE v.provider_id=u.id AND v.agency_id=? AND v.is_active=1 AND v.available_for_intake=1 AND v.end_at>UTC_TIMESTAMP()) OR EXISTS(SELECT 1 FROM provider_virtual_working_hours v WHERE v.provider_id=u.id AND v.agency_id=? AND v.available_for_intake=1)) AS published_virtual,
   EXISTS(SELECT 1 FROM provider_school_assignments s WHERE s.provider_user_id=u.id AND s.is_active=1 AND s.slots_available>0 AND EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=s.school_organization_id AND oa.agency_id=? AND oa.is_active=1)) AS published_school
   FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? JOIN agencies a ON a.id=ua.agency_id LEFT JOIN provider_public_profiles p ON p.user_id=u.id WHERE u.id IN (${marks})`,[agencyId,agencyId,agencyId,agencyId,agencyId,...ids]),
  database.execute('SELECT service_type,display_name FROM agency_public_service_types WHERE agency_id=? AND is_enabled=1 ORDER BY sort_order,service_type',[agencyId]),
  database.execute(`SELECT user_id,service_type,is_active FROM provider_public_service_enrollments WHERE agency_id=? AND user_id IN (${marks})`,[agencyId,...ids]),
  listPublicProviderOffices(agencyId,ids,database)
 ]);
 return rows.map(row=>{
  const user=people.find(p=>Number(p.id)===Number(row.id))||{};
  let details=user.public_details_json||{};if(typeof details==='string'){try{details=JSON.parse(details);}catch{details={};}}
  const profile=scopeProviderProfile({details,acceptingNewClientsOverride:user.accepting_new_clients_override},agencyId);
  const preferences={school:true,officeIds:null,scheduleAgencyId:Number(agencyId),...providerAvailabilityPreferences(user,profile)};
  if(!profile.agencyAvailability&&preferences.seesClients){preferences.inPerson ||= !!user.published_in_person;preferences.virtual ||= !!user.published_virtual;preferences.acceptingNewClients ||= !!(user.published_in_person||user.published_virtual||user.published_school);}
  const services=providerServiceSettings(user,agencyId,types,enrollments.filter(e=>Number(e.user_id)===Number(row.id)));
  return {...row,title:user.title||user.credential||'',profilePhotoUrl:publicUploadsUrlFromStoredPath(user.profile_photo_path),preferences,services,offices:offices.get(Number(row.id))||[]};
 });
}
