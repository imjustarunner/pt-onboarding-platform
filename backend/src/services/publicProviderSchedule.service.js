import pool from '../config/database.js';
import Availability from './providerAvailability.service.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import {publicAcceptance} from '../utils/publicProviderPresentation.js';

export async function readPublicProviderSchedule(providerId, agencyId, {weeks=4}={}) {
 const [profile, [people], [offices], [schoolRows], [virtualHours], [officeHours]] = await Promise.all([
  Profile.getForProvider({providerUserId:providerId}),
  pool.execute('SELECT provider_accepting_new_clients,in_office_available FROM users WHERE id=?',[providerId]),
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
    AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_schools h WHERE h.agency_id=? AND h.school_organization_id=a.id)`,[providerId,agencyId,agencyId,agencyId,agencyId]),
  pool.execute('SELECT day_of_week,start_time,end_time FROM provider_virtual_working_hours WHERE provider_id=? AND agency_id=?',[providerId,agencyId]),
  pool.execute(`SELECT DISTINCT s.weekday,s.hour,l.name FROM office_standing_assignments s
    JOIN office_locations l ON l.id=s.office_location_id JOIN office_location_agencies a ON a.office_location_id=l.id
    WHERE s.provider_id=? AND s.is_active=1 AND l.is_active=1 AND a.agency_id=?`,[providerId,agencyId])
 ]);
 const details=profile?.details||{},user=people[0]||{},now=Date.now(),all=[];
 let timeZone='America/Denver';
 for(let week=0;week<weeks;week++) {
  const result=await Availability.computeWeekAvailability({agencyId,providerId,weekStartYmd:new Date(now+week*7*86400000).toISOString().slice(0,10),intakeOnly:true,includeGoogleBusy:true,externalCalendarIds:[],slotMinutes:60});
  timeZone=result.timeZone||timeZone;
  for(const [key,format] of [['inPersonSlots','IN_PERSON'],['virtualSlots','VIRTUAL']])
   for(const slot of result[key]||[])if(Date.parse(slot.startAt)>now)all.push({startAt:slot.startAt,endAt:slot.endAt,format,frequency:slot.frequency||'WEEKLY',buildingId:slot.buildingId,buildingName:slot.buildingName});
 }
 const slots=[...new Map(all.map(s=>[`${s.format}:${s.startAt}:${s.endAt}`,s])).values()].sort((a,b)=>a.startAt.localeCompare(b.startAt));
 const schoolOpenings=schoolRows.some(s=>Number(s.slots_available)>0);
 const formats={};
 for(const [key,format,manual,enabled] of [['inPerson','IN_PERSON','officeAvailability',Boolean(user.in_office_available)||offices.length>0||details.inPersonEnabled],['virtual','VIRTUAL','virtualAvailability',details.virtualEnabled||(details.sessionFormats||[]).some(v=>/virtual|telehealth|online/i.test(v))],['school','SCHOOL','schoolAvailability',schoolRows.length>0]]) {
  const next=slots.find(s=>s.format===format);
  const acceptance=publicAcceptance({globalAccepting:user.provider_accepting_new_clients??true,manual:details.waitlistEnabled&&details[manual]!=='unavailable'?'waitlist':details[manual],assigned:Boolean(enabled||next||['accepting','waitlist'].includes(details[manual])),hasOpenings:key==='school'?schoolOpenings:Boolean(next)});
  formats[key]={...acceptance,nextAvailableAt:next?.startAt||null,hasPublishedOpenings:acceptance.hasOpenings};
 }
 const clock=value=>{const [h,m]=String(value).split(':').map(Number);return `${h%12||12}:${String(m||0).padStart(2,'0')} ${h>=12?'PM':'AM'}`;};
 const typical=[...schoolRows.map(r=>`School-based · ${r.day_of_week}${r.start_time&&r.end_time?`, ${clock(r.start_time)}–${clock(r.end_time)}`:''} · ${r.name}`),...virtualHours.map(r=>`Virtual · ${r.day_of_week}, ${clock(r.start_time)}–${clock(r.end_time)}`),
  ...officeHours.map(r=>`In person · ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(r.weekday)]}, ${clock(`${r.hour}:00`)} · ${r.name}`)];
 return {timeZone,checkedAt:new Date().toISOString(),...formats,slots:slots.slice(0,60),nextAvailableAt:slots[0]?.startAt||null,
  hasPublishedOpenings:slots.length>0||schoolOpenings,
  waitlistEnabled:details.waitlistEnabled===true||['officeAvailability','virtualAvailability','schoolAvailability'].some(k=>details[k]==='waitlist'),
  waitlistFormats:[['IN_PERSON','officeAvailability'],['VIRTUAL','virtualAvailability'],['SCHOOL','schoolAvailability']].filter(([,key])=>details.waitlistEnabled===true||details[key]==='waitlist').map(([format])=>format),
  typicalAvailability:[...new Set([...(details.typicalAvailability||[]),...typical])].slice(0,30),
  locations:offices.map(o=>({id:o.id,name:o.name,address:[o.street_address,o.city,o.state,o.postal_code].filter(Boolean).join(', ')})),
  schools:[...new Map(schoolRows.map(s=>[s.id,{id:s.id,name:s.name,city:s.city,state:s.state,hasOpenings:schoolRows.some(row=>row.id===s.id&&Number(row.slots_available)>0)}])).values()]};
}
