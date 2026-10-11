import pool from '../config/database.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { officeTodayUtcBounds, utcToZonedMysqlWall, parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { lobbyHour, lobbySlot } from '../utils/officeLobbyWindow.js';
import { isDirectoryProvider } from '../utils/providerDirectoryEligibility.js';
import { officeBookingAgencyId } from '../utils/officeBookingAgency.js';
import { listClinicalFacetsForUsers, listClinicalFacetsForUser } from './providerClinicalFacets.service.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { getPublicCounselingHourlyRate } from './publicCounselingRate.service.js';
import { publicLanguages, uniquePublicFacets, restrictPublicInsurances } from '../utils/publicProviderPresentation.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function lobbyLocation(id){const location=await OfficeLocation.findById(Number(id));if(!location?.is_active)throw fail(404,'Office not found');return location;}
export async function officeAgencies(location){const [rows]=await pool.execute(`SELECT a.id,a.name,COALESCE(NULLIF(a.slug,''),a.portal_url) slug,COALESCE(NULLIF(a.logo_path,''),NULLIF(a.logo_url,''),i.file_path) logo
 FROM agencies a LEFT JOIN icons i ON i.id=a.icon_id WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND a.organization_type='agency' AND (a.id=? OR EXISTS(SELECT 1 FROM office_location_agencies x WHERE x.office_location_id=? AND x.agency_id=a.id)) ORDER BY a.name`,[location.agency_id,location.id]);return rows;}
export async function officePeople(location){
 const agencies=await officeAgencies(location);if(!agencies.length)return {agencies,people:[]};
 const ids=agencies.map(a=>a.id);
 const [rows]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.credential,u.title,u.profile_photo_path,u.role,u.has_provider_access,u.sees_clients,u.service_focus,u.languages_spoken,p.public_blurb,ua.agency_id,
 EXISTS(SELECT 1 FROM office_events e WHERE e.office_location_id=? AND e.booked_provider_id=u.id AND e.status<>'CANCELLED' AND (e.status='BOOKED' OR e.slot_state='ASSIGNED_BOOKED')) office_booked
 FROM users u LEFT JOIN provider_public_profiles p ON p.user_id=u.id JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1
 WHERE ua.agency_id IN (${ids.map(()=>'?').join(',')}) AND u.is_active=1 AND u.status='ACTIVE_EMPLOYEE' AND u.terminated_at IS NULL AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
 ORDER BY (ua.agency_id=?) DESC,u.last_name,u.first_name,ua.agency_id`,[location.id,...ids,location.agency_id]);
 const people=rows.filter(p=>isDirectoryProvider(p,{assigned:!!p.office_booked})).map(p=>{
 const agency=agencies.find(a=>Number(a.id)===Number(p.agency_id));return {id:p.id,firstName:p.first_name,lastName:p.last_name,credential:p.credential,title:p.title,profilePhotoPath:p.profile_photo_path,agencyId:agency.id,agencyName:agency.name,agencySlug:agency.slug,agencyLogoPath:agency.logo,officeBooked:!!p.office_booked,serviceType:/tutor/i.test(p.service_focus||'')&&!/counsel|therap/i.test(p.service_focus||'')?'tutoring':'counseling',searchText:[p.service_focus,p.languages_spoken,p.public_blurb].filter(Boolean).join(' ')};});
 // Use the same reviewed clinical fields as the public provider website.
 const facetsByAgency=new Map(await Promise.all(agencies.map(async agency=>[Number(agency.id),await listClinicalFacetsForUsers(people.filter(p=>Number(p.agencyId)===Number(agency.id)).map(p=>p.id),{agencyId:agency.id})])));
 for(const person of people){const facets=facetsByAgency.get(Number(person.agencyId))?.get(Number(person.id));person.searchText+=' '+['specialties','modalities','ageGroups','populations','interventions'].flatMap(key=>facets?.[key]||[]).join(' ');}
 return {agencies,people};
}
export async function officeToday(location,{view='current',nextHour=false}={}){
 const timezone=location.timezone||'America/Denver',bounds=officeTodayUtcBounds(timezone),now=Date.now();
 const {people}=await officePeople(location);
 const [events]=await pool.execute(`SELECT e.id event_id,e.start_at,e.end_at,e.assigned_provider_id,e.booked_provider_id,e.client_id,e.clinical_session_id,e.status,e.slot_state,r.name room_name,r.room_number,
 e.session_context_json,sa.booking_agency_id,c.agency_id client_agency_id,
 (SELECT ap.agency_id FROM appointments ap WHERE ap.office_event_id=e.id ORDER BY ap.id LIMIT 1) appointment_agency_id
 FROM office_events e JOIN office_rooms r ON r.id=e.room_id AND r.is_active=1
 LEFT JOIN office_standing_assignments sa ON sa.id=e.standing_assignment_id LEFT JOIN clients c ON c.id=e.client_id
 WHERE e.office_location_id=? AND e.status<>'CANCELLED' AND COALESCE(e.slot_state,'')<>'COMPANY_HOLD' AND e.start_at<? AND e.end_at>? AND (e.booked_provider_id IS NOT NULL OR e.assigned_provider_id IS NOT NULL) ORDER BY e.start_at`,[location.id,bounds.endExclusive,bounds.startAt]);
 const [arrivals]=await pool.execute(`SELECT ci.provider_id,COALESCE(ci.slot_start_at,e.start_at) slot_start_at FROM office_event_checkins ci JOIN office_events e ON e.id=ci.event_id WHERE ci.office_location_id=? AND COALESCE(ci.slot_start_at,e.start_at)>=? AND COALESCE(ci.slot_start_at,e.start_at)<?`,[location.id,bounds.startAt,bounds.endExclusive]);
 const checkedSlots=new Set(arrivals.map(a=>`${a.provider_id}:${parseUtcDate(a.slot_start_at).toISOString()}`));
 // A provider can work for several agencies in one building. Resolve each
 // booking once, by its own agency, rather than keeping only the building owner.
 const eventPeople=new Map(events.map(e=>{const id=Number((e.status==='BOOKED'||e.slot_state==='ASSIGNED_BOOKED')?(e.booked_provider_id||e.assigned_provider_id):e.assigned_provider_id),agencyId=officeBookingAgencyId(e);return [e,people.find(p=>Number(p.id)===id&&(!agencyId||Number(p.agencyId)===agencyId))];}));
 const providers=[];
 for(const person of people){
 const own=events.filter(e=>eventPeople.get(e)===person);if(!own.length)continue;
 const priority=e=>e.client_id||e.clinical_session_id?2:(e.status==='BOOKED'||e.slot_state==='ASSIGNED_BOOKED')?1:0;
 const slots=[...own].sort((a,b)=>priority(b)-priority(a)).map(e=>lobbySlot(e,{now,nextHour,timezone})).filter(Boolean);
 if(view!=='today'&&!slots.length)continue;
 const slot=slots[0];if(slot)slot.checkedIn=checkedSlots.has(`${person.id}:${slot.appointmentStartAt}`);providers.push({...person,currentSlot:slot||null,checkinClosesAt:slot?.checkinClosesAt,bookings:own.map(e=>({eventId:e.event_id,startAt:utcToZonedMysqlWall(e.start_at,timezone),endAt:utcToZonedMysqlWall(e.end_at,timezone),booked:e.status==='BOOKED'||e.slot_state==='ASSIGNED_BOOKED'})),status:slot?'active_now':'upcoming'});}
 return {locationId:location.id,locationName:location.name,timezone,providers,windowStartAt:utcToZonedMysqlWall(new Date(lobbyHour(now,nextHour)),timezone),windowClosesAt:new Date(lobbyHour(now)+31*60000).toISOString(),serverNow:new Date(now).toISOString()};
}
export async function lobbyProviderProfile(location,providerId,agencyId){
 const {people}=await officePeople(location);const provider=people.find(p=>Number(p.id)===Number(providerId)&&Number(p.agencyId)===Number(agencyId));
 if(!provider)throw fail(404,'Provider not found at this office’s organizations');
 const args={providerUserId:provider.id,agencyId:provider.agencyId};
 const [profile,facets,insurances,rate,settings]=await Promise.all([
  ProviderPublicProfile.getForProvider(args),listClinicalFacetsForUser(provider.id,{agencyId:provider.agencyId}),
  listProviderAcceptedInsurancesForDisplay({userId:provider.id,agencyId:provider.agencyId}),
  getPublicCounselingHourlyRate({...args,serviceType:'counseling'}),ProviderPublicProfile.getAgencySettings({agencyId:provider.agencyId})
 ]);
 const details=Object.fromEntries(Object.entries(profile?.details||{}).filter(([key])=>!['availabilityByAgency','serviceOfferingsByAgency'].includes(key)));
 return {provider,profile:{publicBlurb:profile?.publicBlurb||'',details:{...details,languages:publicLanguages(profile),specialties:uniquePublicFacets(facets.specialties),modalities:facets.modalities||[],ageGroups:uniquePublicFacets(facets.ageGroups)},insurances:restrictPublicInsurances(insurances,provider).map(i=>i.name),selfPayRateCents:rate??profile?.selfPayRateCents??settings?.defaultSelfPayRateCents??null,selfPayRateNote:rate!=null?'Per hour · cash / self-pay':profile?.selfPayRateNote||settings?.defaultSelfPayRateNote||null}};
}
