import {validateAgencyAvailability} from '../utils/providerAgencyAvailability.js';
import {listPublicProviderOffices} from './publicProviderOffices.service.js';

export async function availabilityEditingContext(database,providerId,agencyId,actor) {
 const [memberships]=await database.execute(`SELECT a.id,a.name FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
 WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND LOWER(COALESCE(a.organization_type,'agency')) IN ('agency','clubwebapp','life_coach','consultant')`,[providerId]);
 const self=Number(actor.id)===Number(providerId),superAdmin=actor.role==='super_admin';
 let allowed=memberships;
 if(!self&&!superAdmin){
  const [actorMemberships]=await database.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND COALESCE(is_active,1)=1',[actor.id]);
  allowed=memberships.filter(a=>actorMemberships.some(m=>Number(m.agency_id)===Number(a.id)));
 }
 if(!allowed.some(a=>Number(a.id)===Number(agencyId)))throw Object.assign(new Error('Active agency membership required'),{status:403});
 const offices=(await listPublicProviderOffices(agencyId,[providerId],database)).get(Number(providerId))||[];
 return {agencies:allowed,offices,canApplyToAll:allowed.length===memberships.length,agencyName:memberships.find(a=>Number(a.id)===Number(agencyId))?.name};
}

export async function saveAgencyAvailability(database,{providerId,agencyId,actor,body}) {
 const context=await availabilityEditingContext(database,providerId,agencyId,actor);
 if(body.applyToAll!==undefined&&typeof body.applyToAll!=='boolean')throw Object.assign(new Error('Invalid apply-to-all choice'),{status:400});
 if(body.applyToAll&&!context.canApplyToAll)throw Object.assign(new Error('You may update only your authorized agencies'),{status:403});
 const policy=validateAgencyAvailability(body,agencyId);
 if(!context.agencies.some(a=>Number(a.id)===policy.scheduleAgencyId))throw Object.assign(new Error('Choose a schedule from an authorized agency membership'),{status:403});
 if(policy.officeIds?.some(id=>!context.offices.some(o=>Number(o.id)===id)))throw Object.assign(new Error('Choose offices assigned to this provider in this agency'),{status:400});
 const agencies=body.applyToAll?context.agencies:[{id:agencyId}];
 const map={};
 for(const agency of agencies){
  // Offices must belong to each destination agency, even when the schedule is shared.
  // The current selection stays local; other agencies use their assigned offices.
  map[String(agency.id)]={...policy,officeIds:Number(agency.id)===Number(agencyId)?policy.officeIds:null};
 }
 await database.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[providerId]);
 await database.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json) VALUES (?,?)
 ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
 [providerId,JSON.stringify({availabilityByAgency:map})]);
 await database.execute(`UPDATE provider_availability_reminders SET checked_at=NULL WHERE provider_id=? AND agency_id IN (${agencies.map(()=>'?').join(',')})`,[providerId,...agencies.map(a=>a.id)]);
 return context;
}
