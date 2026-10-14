import {agencyAvailability,agencyIntakeStatus} from '../utils/providerAgencyAvailability.js';
import {providerAvailabilityPreferences} from '../utils/providerAvailabilityReminders.js';

// Called only by explicit publication edits, never rolling room materialization.
// The caller supplies its transaction so an unsuccessful publication cannot open intake.
export async function openWaitlistedPublication(database,{providerId,agencyId,formats}) {
 const selected=[...new Set(formats||[])].filter(f=>['VIRTUAL','IN_PERSON'].includes(f));
 if(!selected.length)return false;
 const [[person]]=await database.execute('SELECT id,sees_clients,provider_accepting_new_clients,in_office_available FROM users WHERE id=? FOR UPDATE',[providerId]);
 if(!person)return false;
 const [[profile]]=await database.execute('SELECT public_details_json FROM provider_public_profiles WHERE user_id=? FOR UPDATE',[providerId]);
 let details=profile?.public_details_json||{};
 if(typeof details==='string')details=JSON.parse(details);
 const policy=agencyAvailability(details,agencyId);
 const preferences=policy||providerAvailabilityPreferences(person,{details});
 if(!preferences.seesClients)return false;
 const statuses=Object.fromEntries(['IN_PERSON','VIRTUAL','SCHOOL'].map(format=>{
  const legacy=details[{IN_PERSON:'officeAvailability',VIRTUAL:'virtualAvailability',SCHOOL:'schoolAvailability'}[format]];
  return [format,policy?agencyIntakeStatus(policy,format):['accepting','waitlist','unavailable'].includes(legacy)?legacy:agencyIntakeStatus({...preferences,seesClients:true},format)];
 }));
 const reopening=selected.filter(f=>statuses[f]==='waitlist');
 if(!reopening.length)return false;
 for(const format of reopening)statuses[format]='accepting';
 const next={school:true,scheduleAgencyId:Number(agencyId),officeIds:null,...preferences,
  ...(reopening.includes('VIRTUAL')?{virtual:true}:{}),...(reopening.includes('IN_PERSON')?{inPerson:true}:{}),
  acceptingNewClients:true,waitlistEnabled:Object.values(statuses).includes('waitlist'),intakeStatusByFormat:statuses};
 await database.execute(`INSERT INTO provider_public_profiles (user_id,public_details_json) VALUES (?,?)
  ON DUPLICATE KEY UPDATE public_details_json=JSON_MERGE_PATCH(COALESCE(public_details_json,JSON_OBJECT()),VALUES(public_details_json)),updated_at=CURRENT_TIMESTAMP`,
 [providerId,JSON.stringify({availabilityByAgency:{[agencyId]:next}})]);
 return true;
}
