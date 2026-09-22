import {appointmentTimePredicate} from '../utils/publicAppointmentTimeSearch.js';
import {agencyFormatAllowed,agencyOfficeAllowed,scopeProviderRow} from '../utils/providerAgencyAvailability.js';
import pool from '../config/database.js';
import {readPublicWeekAvailability} from './publicAvailabilitySnapshot.service.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import {publicAcceptance} from '../utils/publicProviderPresentation.js';

export async function readPublicProviderSchedule(providerId, agencyId, {weeks=4,officeId=null,timePreferences={}}={}) {
 const matchesTime=appointmentTimePredicate(timePreferences);
 const [profile, [people], [offices], [schoolRows]] = await Promise.all([
  Profile.getForProvider({providerUserId:providerId,agencyId}),
  pool.execute('SELECT sees_clients,provider_accepting_new_clients,in_office_available FROM users WHERE id=?',[providerId]),
  pool.execute(`SELECT DISTINCT l.id,l.name,l.street_address,l.city,l.state,l.postal_code,l.timezone
    FROM office_locations l JOIN office_location_agencies a ON a.office_location_id=l.id
    JOIN office_standing_assignments s ON s.office_location_id=l.id AND s.provider_id=? AND s.is_active=1
    WHERE a.agency_id=? AND l.is_active=1`,[providerId,agencyId]),
  pool.execute(`SELECT DISTINCT a.id,a.name,a.city,a.state,p.slots_available,p.day_of_week,p.start_time,p.end_time
    FROM provider_school_assignments p JOIN agencies a ON a.id=p.school_organization_id
    WHERE p.provider_user_id=? AND p.is_active=1 AND COALESCE(a.is_archived,0)=0
    AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.agency_id=? AND f.organization_id=a.id AND f.is_active=1)
      OR EXISTS(SELECT 1 FROM agency_schools f WHERE f.agency_id=? AND f.school_organization_id=a.id AND f.is_active=1))
    AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_providers h WHERE h.agency_id=? AND h.school_organization_id=a.id AND h.provider_user_id=p.provider_user_id)
    AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_schools h WHERE h.agency_id=? AND h.school_organization_id=a.id)`,[providerId,agencyId,agencyId,agencyId,agencyId])
 ]);
 const details=profile?.details||{},user=scopeProviderRow(people[0]||{},agencyId,profile?.details),now=Date.now(),all=[];
 let timeZone='America/Denver', checkedAt=null;
 for(let week=0;week<weeks;week++) {
  const result=await readPublicWeekAvailability({agencyId,providerId,weekStartYmd:new Date(now+week*7*86400000).toISOString().slice(0,10),intakeOnly:true,includeGoogleBusy:true,externalCalendarIds:[],slotMinutes:60});
  timeZone=result.timeZone||timeZone;
  if(result.checkedAt&&(!checkedAt||result.checkedAt<checkedAt))checkedAt=result.checkedAt;
  for(const [key,format] of [['inPersonSlots','IN_PERSON'],['virtualSlots','VIRTUAL']])
   for(const slot of result[key]||[])if(Date.parse(slot.startAt)>now)all.push({startAt:slot.startAt,endAt:slot.endAt,format,frequency:slot.frequency||'WEEKLY',buildingId:slot.buildingId,buildingName:slot.buildingName});
 }
 const slots=[...new Map(all.map(s=>[`${s.format}:${s.startAt}:${s.endAt}:${s.buildingId||''}`,s])).values()].filter(s=>matchesTime(s)&&(!officeId||(s.format==='IN_PERSON'&&Number(s.buildingId)===Number(officeId)))&&agencyFormatAllowed(profile?.agencyAvailability,s.format)&&agencyOfficeAllowed(s.format==='IN_PERSON'?profile?.agencyAvailability:null,s.buildingId)).sort((a,b)=>a.startAt.localeCompare(b.startAt));
 const policy=profile?.agencyAvailability;
 const schools=[...new Map((policy?.school===false?[]:schoolRows).map(s=>{
  const hasOpenings=agencyFormatAllowed(policy,'SCHOOL')&&schoolRows.some(row=>Number(row.id)===Number(s.id)&&Number(row.slots_available)>0);
  return [s.id,{id:s.id,name:s.name,city:s.city,state:s.state,hasOpenings,status:hasOpenings?'accepting':agencyFormatAllowed(policy,'SCHOOL',{intake:false})&&(details.waitlistEnabled===true||details.schoolAvailability==='waitlist')?'waitlist':'unavailable'}];
 })).values()];
 const schoolOpenings=schools.some(s=>s.hasOpenings);
 const formats={};
 for(const [key,format,manual,enabled] of [['inPerson','IN_PERSON','officeAvailability',Boolean(user.in_office_available)||offices.length>0||details.inPersonEnabled],['virtual','VIRTUAL','virtualAvailability',details.virtualEnabled||(details.sessionFormats||[]).some(v=>/virtual|telehealth|online/i.test(v))],['school','SCHOOL','schoolAvailability',schoolRows.length>0]]) {
  const next=slots.find(s=>s.format===format);
  const acceptance=publicAcceptance({globalAccepting:user.provider_accepting_new_clients??true,manual:!policy&&details.waitlistEnabled&&details[manual]!=='unavailable'?'waitlist':details[manual],assigned:Boolean(enabled||next||['accepting','waitlist'].includes(details[manual])),hasOpenings:key==='school'?schoolOpenings:Boolean(next)});
  if(policy&&!agencyFormatAllowed(policy,format)){acceptance.status=policy.seesClients&&policy.waitlistEnabled&&agencyFormatAllowed({...policy,acceptingNewClients:true},format)?'waitlist':'unavailable';acceptance.hasOpenings=false;}
  if(key==='school')acceptance.status=schoolOpenings?'accepting':schools.some(s=>s.status==='waitlist')?'waitlist':'unavailable';
  formats[key]={...acceptance,nextAvailableAt:next?.startAt||null,hasPublishedOpenings:acceptance.hasOpenings};
 }
 return {timeZone,checkedAt:checkedAt||new Date().toISOString(),...formats,slots:['IN_PERSON','VIRTUAL'].flatMap(format=>slots.filter(s=>s.format===format).slice(0,60)).sort((a,b)=>a.startAt.localeCompare(b.startAt)),nextAvailableAt:slots[0]?.startAt||null,
  hasPublishedOpenings:slots.length>0||schoolOpenings,
  waitlistEnabled:details.waitlistEnabled===true||['officeAvailability','virtualAvailability','schoolAvailability'].some(k=>details[k]==='waitlist'),
  waitlistFormats:[['IN_PERSON','officeAvailability'],['VIRTUAL','virtualAvailability'],['SCHOOL','schoolAvailability']].filter(([format,key])=>agencyFormatAllowed(policy,format,{intake:false})&&(details.waitlistEnabled===true||details[key]==='waitlist')).map(([format])=>format),
  typicalAvailability:Array.isArray(details.typicalAvailability)?[...new Set(details.typicalAvailability)].slice(0,30):[],
  locations:offices.filter(o=>agencyOfficeAllowed(policy,o.id)).map(o=>({id:o.id,name:o.name,address:[o.street_address,o.city,o.state,o.postal_code].filter(Boolean).join(', ')})),
  schools};
}
