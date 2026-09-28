import { uniquePublicFacets, restrictPublicInsurances, publicLanguages } from '../../utils/publicProviderPresentation.js';
import {offersProviderService} from '../../utils/providerServiceOfferings.js';
import { addDaysYmd } from '../../utils/scheduleRecurrence.js';
import { detectAgeBucketFromText } from '../../utils/ageMatch.util.js';

const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const localDate=(date,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const localTime=(date,tz)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(date);
const fail=message=>Object.assign(new Error(message),{status:400});
const parseJson=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
export function isAvailabilitySearch(query, history=[]) {
  const q=String(query||'');
  if (/\b(school|chat|online now)\b/i.test(q)) return false;
  if (/^who(?: is|'s)? (?:free|available)(?: today| now| right now)?[?.!]*$/i.test(q.trim())) return false;
  if (/\b(availability|openings?|available|free)\b/i.test(q) && /\b(who|provider|clinician|therapist|find|show|anyone)\b/i.test(q)) return true;
  if (/\b(match|preferences?|satisfies|suits?)\b/i.test(q) && /\bclient\b/i.test(q)) return true;
  if(/^\d{1,2}$/.test(q.trim())&&history.some(t=>t.role==='user'&&/kids|children|availability/i.test(t.text||'')))return true;
  return history.some(t=>t.role==='user' && /\b(availability|openings?|available)\b/i.test(t.text||'')) && /\b(adhd|anxiety|depression|trauma|autism|kids|child|children|teen|age|year.old|virtual|person|instead|those|them|weekly|biweekly|monthly|weeks|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(q);
}
function timeValue(hour,minute,meridiem) {
  let h=Number(hour),m=Number(minute||0);
  if(m>59||h>23||meridiem&& (h<1||h>12)) throw fail('Please use a valid time, such as 2 PM or 14:00.');
  if(meridiem)h=h%12+(meridiem.toLowerCase()==='pm'?12:0);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
// Deterministic, tenant-local constraints. Follow-ups patch the prior query instead of losing its time filter.
export function parseAvailabilitySearch({query,previousQueries=[],timeZone='America/Denver',now=new Date()}) {
  const today=localDate(now,timeZone);
  let filters={dateFrom:today,dateTo:addDaysYmd(today,13),timeFrom:null,timeTo:null,exactTime:null,modality:'ALL',ageBucket:null,children:false,frequency:null,purpose:null,clientId:null};
  let questions=[];
  for(const q of [...previousQueries.slice(-20),query].map(String)) {
    if(/\b(start over|new search|reset)\b/i.test(q)) {filters={dateFrom:today,dateTo:addDaysYmd(today,13),modality:'ALL'};questions=[];}
    const dates=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
    if(dates.length){filters.dateFrom=dates[0];filters.dateTo=dates[1]||dates[0];}
    else if(/\btomorrow\b/i.test(q))filters.dateFrom=filters.dateTo=addDaysYmd(today,1);
    else if(/\btoday\b/i.test(q))filters.dateFrom=filters.dateTo=today;
    else {
      const day=weekdays.findIndex(d=>new RegExp(`\\b(?:${d}|${d.slice(0,3)})(?:s)?\\b`,'i').test(q));
      if(day>=0){let offset=(day-new Date(today+'T12:00:00Z').getUTCDay()+7)%7;if(/\bnext\b/i.test(q)&&offset===0)offset=7;filters.dateFrom=filters.dateTo=addDaysYmd(today,offset);}
      else if(/\bnext week\b/i.test(q)){const n=(8-new Date(today+'T12:00:00Z').getUTCDay())%7||7;filters.dateFrom=addDaysYmd(today,n);filters.dateTo=addDaysYmd(filters.dateFrom,6);}
    }
    const range=q.match(/\b(?:between\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:–|—|-|to|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    const exact=q.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if(range){filters.timeFrom=timeValue(range[1],range[2],range[3]||range[6]);filters.timeTo=timeValue(range[4],range[5],range[6]);filters.exactTime=null;}
    else if(exact){const value=timeValue(exact[1],exact[2],exact[3]);if(/\bafter\b/i.test(q)){filters.timeFrom=value;filters.timeTo=null;filters.exactTime=null;}else if(/\bbefore\b/i.test(q)){filters.timeTo=value;filters.timeFrom=null;filters.exactTime=null;}else{filters.exactTime=value;filters.timeFrom=null;filters.timeTo=null;}}
    else if(/\b(?:at|from|between)\s+\d{1,2}:\d{2}\b/i.test(q)){const times=[...q.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(m=>timeValue(m[1],m[2]));if(times.length>1){filters.timeFrom=times[0];filters.timeTo=times[1];filters.exactTime=null;}else{filters.exactTime=times[0];filters.timeFrom=null;filters.timeTo=null;}}
    else if(/\bmorning\b/i.test(q)){filters.timeFrom='06:00';filters.timeTo='12:00';filters.exactTime=null;}
    else if(/\bafternoon\b/i.test(q)){filters.timeFrom='12:00';filters.timeTo='17:00';filters.exactTime=null;}
    else if(/\bevening\b/i.test(q)){filters.timeFrom='17:00';filters.timeTo='23:59';filters.exactTime=null;}
    else if(/\b(?:at|between|from)\s+\d{1,2}(?!\d|-)/i.test(q)&&!dates.length) questions.push('Please specify AM or PM for the time.');
    if(/\b(any time|all times)\b/i.test(q)){filters.timeFrom=null;filters.timeTo=null;filters.exactTime=null;}
    if(/\b(virtual|telehealth|online appointments?)\b/i.test(q))filters.modality='VIRTUAL';
    if(/\bin[ -]person\b/i.test(q))filters.modality='IN_PERSON';
    if(/\b(either|both) (format|modality)|\bany format\b/i.test(q))filters.modality='ALL';
    const numeric=(/^\d{1,2}$/.test(q.trim())?[q,q.trim()]:null)||q.match(/\b(?:age(?:d)?\s*(\d{1,2})|(\d{1,2})[ -](?:year|yr)[ -]old)\b/i);
    if(numeric){filters.ageBucket=detectAgeBucketFromText(`age ${numeric[1]||numeric[2]}`);filters.children=false;}
    else if(/\b(kids|children|child)\b/i.test(q)){filters.children=true;filters.ageBucket=null;}
    else if(/\b(teen|preteen|toddler|adult|senior)s?\b/i.test(q)){filters.ageBucket=detectAgeBucketFromText(q);filters.children=false;}
    if(/\b(biweekly|every (?:two|2) weeks)\b/i.test(q))filters.frequency='BIWEEKLY';
    else if(/\b(monthly|every (?:four|4) weeks)\b/i.test(q))filters.frequency='EVERY_4_WEEKS';
    else if(/\bweekly\b/i.test(q))filters.frequency='WEEKLY';
    const specialty=q.match(/\b(ADHD|anxiety|depression|trauma|autism)\b/i);if(specialty)filters.specialty=specialty[1];
    if(/\bintake\b/i.test(q))filters.purpose='INTAKE';
    if(/\bmeeting\b/i.test(q))filters.purpose='MEETING';
    if(/\b(ongoing|regularly recurring)\b/i.test(q))filters.purpose='ONGOING';
    const client=q.match(/\bclient\s*(?:#|id\s*)?(\d+)\b/i);if(client)filters.clientId=Number(client[1]);
    if(/\bclient\b/i.test(q)&&/\b(match|preferences?)\b/i.test(q)&&!client&&!filters.clientId) questions.push('Choose a submitted client in Openings & preferences, or include their client ID (for example, “match client #123”).');
  }
  for(const d of [filters.dateFrom,filters.dateTo])if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw fail('Use valid calendar dates.');
  if(filters.dateTo<filters.dateFrom||Date.parse(filters.dateTo)-Date.parse(filters.dateFrom)>41*86400000)throw fail('Search a date range of up to six weeks.');
  if(filters.timeFrom&&filters.timeTo&&filters.timeTo<=filters.timeFrom)questions.push('The end time must be after the start time. Please include AM and PM.');
  return {filters,questions:[...new Set(questions)],timeZone};
}
// Convert quarter-hour free segments into complete one-hour appointment choices.
// A gap, format, room, purpose, or recurrence boundary must not be bridged.
export function appointmentWindows(rows) {
 const groups=new Map();for(const row of rows){const key=[row.buildingId,row.roomId,row.frequency,row.purpose].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const result=[];
 for(const values of groups.values()){
  const sorted=[...new Map(values.map(r=>[r.startAt,r])).values()].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  for(let i=0;i<sorted.length;i++){const start=Date.parse(sorted[i].startAt),wanted=start+3600000;let finish=Date.parse(sorted[i].endAt);for(let j=i+1;j<sorted.length&&finish<wanted&&Date.parse(sorted[j].startAt)<=finish;j++)finish=Math.max(finish,Date.parse(sorted[j].endAt));if(finish>=wanted)result.push({...sorted[i],endAt:new Date(wanted).toISOString()});}
 }
 return result;
}
export function slotMatchesSearch(slot,filters,timeZone) {
  const start=new Date(slot.startAt),end=new Date(slot.endAt),day=localDate(start,timeZone),time=localTime(start,timeZone);
  if(day<filters.dateFrom||day>filters.dateTo)return false;
  if(filters.exactTime&&time!==filters.exactTime)return false;
  if(filters.timeFrom&&time<filters.timeFrom||filters.timeTo&&localTime(end,timeZone)>filters.timeTo)return false;
  if(filters.days?.length&&!filters.days.includes(weekdays[new Date(day+'T12:00:00Z').getUTCDay()].toLowerCase()))return false;
  if(filters.frequency&&slot.frequency!==filters.frequency)return false;
  if(filters.purpose&&(slot.purpose|| (slot.frequency==='ONCE'?'INTAKE':'ONGOING'))!==filters.purpose)return false;
  if(filters.location&&slot.format==='IN_PERSON'&&!String(slot.buildingName||'').toLowerCase().includes(filters.location.toLowerCase()))return false;
  return true;
}
export function ageEvidence(facets,filters) {
  const ages=uniquePublicFacets(facets.filter(f=>['age_specialty','provider_marketing_age_specialty'].includes(f.field_key)).map(f=>String(f.value_option||'')));
  if(!filters.ageBucket&&!filters.children)return {matches:true,ages};
  return {matches:ages.some(a=>filters.children?/toddler|child|preteen|teen|0.?5|6.?10|11.?13|14.?18/i.test(a):a.toLowerCase()===filters.ageBucket.toLowerCase()),ages};
}
function applyPreferences(filters,prefs,client,now) {
  const unverified=[];
  const days=prefs.preferredDays||prefs.preferred_days;
  if(Array.isArray(days)&&days.length)filters.days=days.map(d=>weekdays.find(w=>w.toLowerCase().startsWith(String(d).toLowerCase().slice(0,3)))?.toLowerCase()).filter(Boolean);
  const modality=String(prefs.preferredModality||prefs.preferred_modality||'').toLowerCase();
  if(modality==='virtual')filters.modality='VIRTUAL';if(['in_person','in person'].includes(modality))filters.modality='IN_PERSON';
  const period=String(prefs.preferredTimeOfDay||prefs.preferred_time_of_day||'').toLowerCase();
  if(!filters.exactTime&&!filters.timeFrom&&!filters.timeTo){if(period.includes('morning')){filters.timeFrom='06:00';filters.timeTo='12:00';}else if(period.includes('afternoon')){filters.timeFrom='12:00';filters.timeTo='17:00';}else if(period.includes('evening')){filters.timeFrom='17:00';filters.timeTo='23:59';}else if(period&&!/flexible|any/i.test(period))unverified.push('Time preference: '+period);}
  if(prefs.preferredLocation&&!/flexible|any|either/i.test(String(prefs.preferredLocation)))filters.location=String(prefs.preferredLocation);
  filters.serviceType=prefs.serviceType||null;
  filters.insurance=prefs.insuranceOrPayment||prefs.insurance_or_payment||null;
  filters.language=prefs.preferredLanguage||prefs.preferred_language||null;
  const dob=String(client.date_of_birth||prefs.birthdate||'').slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(dob)){const today=localDate(now,'UTC');const age=Number(today.slice(0,4))-Number(dob.slice(0,4))-(today.slice(5)<dob.slice(5)?1:0);if(age>=0&&age<120){filters.ageBucket=detectAgeBucketFromText('age '+age);filters.children=false;}}
  else unverified.push('Client age is not recorded.');
  for(const [label,value] of [['Presenting concern',prefs.presentingConcern||prefs.presenting_concern||prefs.concerns],['Provider preferences',prefs.preferred_office_provider_ids],['Client goal',prefs.accomplishGoal],['Requested provider',prefs.preferredProviderUserId?String(prefs.preferredProviderUserId):null]])if(value?.length)unverified.push(`${label}: ${Array.isArray(value)?value.join(', '):String(value)}`);
  return unverified;
}
export async function findProviderAvailability({agencyId,actor,query,previousQueries=[],now=new Date()}, deps={}) {
  const db=deps.db||(await import('../../config/database.js')).default;
  const timeZone=deps.timeZone||await (await import('../providerAvailability.service.js')).default.resolveAgencyTimeZone({agencyId});
  const parsed=parseAvailabilitySearch({query,previousQueries,timeZone,now});
  if(parsed.questions.length)return {...parsed,providers:[],needsClarification:true};
  const {filters}=parsed;let clientPreferences=null,unverified=[];
  if(filters.clientId){
    const access=await (deps.clientAccess||(await import('../clientRecordAccess.service.js')).resolveClientRecordAccess)({userId:actor.id,role:actor.role,clientId:filters.clientId});
    if(!access.ok)throw Object.assign(new Error(access.message),{status:access.status});
    const client=access.client;
    if(client.client_type==='school') return {...parsed,providers:[],needsClarification:true,questions:['This client uses school-based services. Review the providers assigned to their school; this search checks office and virtual appointment openings.']};
    if(Number(client.agency_id)!==Number(agencyId))throw Object.assign(new Error('Select the client’s agency before matching.'),{status:403});
    clientPreferences=parseJson(client.intake_preferences_json);
    unverified=applyPreferences(filters,clientPreferences,client,now);
  }
  const compute=deps.compute||((options)=>(import('../providerAvailability.service.js').then(m=>m.default.computeWeekAvailability(options))));
  const [providers]=await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.credential,u.title,u.languages_spoken,p.insurances_json,p.public_details_json FROM users u JOIN user_agencies ua ON ua.user_id=u.id LEFT JOIN provider_public_profiles p ON p.user_id=u.id
   WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
   AND COALESCE(u.status,'') NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING')
   AND (u.role IN ('provider','provider_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access=1)
   ORDER BY u.last_name,u.first_name`,[agencyId]);
  const [facets]=await db.execute(`SELECT user_id,field_key,value_option FROM provider_search_index WHERE agency_id=? AND field_key IN ('age_specialty','provider_marketing_age_specialty','modality','pt_specialties_max25','specialties_general','mental_health','other_issues')`,[agencyId]);
  const [enrollments]=filters.serviceType?await db.execute('SELECT user_id,service_type,is_active FROM provider_public_service_enrollments WHERE agency_id=? AND service_type=?',[agencyId,filters.serviceType]):[[]];
  const weeks=new Set();for(let day=filters.dateFrom;day<=filters.dateTo;day=addDaysYmd(day,1)){const dow=new Date(day+'T12:00:00Z').getUTCDay();weeks.add(addDaysYmd(day,-(dow+6)%7));}
  const results=[],failed=[],unknownAge=[];const queue=[...providers];
  await Promise.all(Array.from({length:4},async()=>{while(queue.length){const p=queue.shift();if(!p)break;
    const evidence=ageEvidence(facets.filter(f=>Number(f.user_id)===Number(p.id)),filters);
    if(!evidence.matches){if(!evidence.ages.length)unknownAge.push(Number(p.id));continue;}
    const personFacets=facets.filter(f=>Number(f.user_id)===Number(p.id));
    if(filters.specialty&&!personFacets.some(f=>String(f.value_option||'').toLowerCase().includes(filters.specialty.toLowerCase())))continue;
    const review=[];const profile=parseJson(p.public_details_json);
    if(filters.serviceType){const enrollment=enrollments.find(e=>Number(e.user_id)===Number(p.id));if(!offersProviderService(profile,agencyId,filters.serviceType,{enrolled:!!enrollment?.is_active,hasEnrollment:!!enrollment,counselingEligible:true}))continue;}
    if(filters.language){const languages=publicLanguages({details:profile},p.languages_spoken);if(languages.length&&!languages.some(l=>String(l).toLowerCase()===String(filters.language).toLowerCase()))continue;if(!languages.length)review.push('Language preference needs verification.');}
    if(filters.insurance){const raw=parseJson(p.insurances_json),plans=restrictPublicInsurances(Array.isArray(raw)?raw:[],p);const wanted=String(filters.insurance).toLowerCase();if(plans.some(plan=>String(plan).toLowerCase()===wanted))review.push('Insurance plan is listed; verify benefits and eligibility.');else review.push('Insurance / payment preference is not a confirmed profile match: '+filters.insurance);}
    try {const slots=[],warnings=[];
      for(const weekStartYmd of weeks){const data=await compute({agencyId,providerId:p.id,weekStartYmd,intakeOnly:true,includeGoogleBusy:true,includeExternalBusy:true,materializeOfficeEvents:false,slotMinutes:15});
        warnings.push(...data.calendarWarnings||[]);
        for(const [format,rows] of [['VIRTUAL',data.virtualSlots],['IN_PERSON',data.inPersonSlots]])if(filters.modality==='ALL'||filters.modality===format)for(const row of appointmentWindows(rows||[])){const slot={...row,format};if(+new Date(slot.startAt)>+now&&slotMatchesSearch(slot,filters,timeZone))slots.push(slot);}
      }
      const unique=[...new Map(slots.map(s=>[`${s.startAt}:${s.endAt}:${s.format}:${s.buildingId||''}:${s.frequency}:${s.purpose}`,s])).values()].sort((a,b)=>a.startAt.localeCompare(b.startAt));
      if(unique.length)results.push({providerId:Number(p.id),name:[p.first_name,p.last_name].filter(Boolean).join(' '),ages:evidence.ages,review,slots:unique.slice(0,20),totalSlots:unique.length,calendarWarnings:[...new Set(warnings)]});
      else if(warnings.length)failed.push(Number(p.id));
    }catch {failed.push(Number(p.id));}
  }}));
  results.sort((a,b)=>a.slots[0].startAt.localeCompare(b.slots[0].startAt)||a.name.localeCompare(b.name));
  return {...parsed,clientPreferences,unverified,providers:results,failedProviderIds:failed,unknownAgeProviderCount:unknownAge.length,checkedAt:now.toISOString()};
}
export function formatAvailabilitySearch(out) {
  if(out.needsClarification)return out.questions.join('\n');
  const f=out.filters||{};
  const lines=[`Openings ${f.dateFrom}${f.dateTo!==f.dateFrom?' through '+f.dateTo:''} (${out.timeZone})${f.exactTime?' at '+f.exactTime:f.timeFrom||f.timeTo?' · '+(f.timeFrom||'start of day')+'–'+(f.timeTo||'end of day'):''}.`,[f.modality&&f.modality!=='ALL'?f.modality.replace('_',' '):'Both formats',f.children?'Recorded child/teen age specialties':f.ageBucket,f.frequency?.replaceAll('_',' '),f.specialty,f.serviceType,f.insurance?('Insurance / payment: '+f.insurance):null,f.language,f.purpose,f.days?.join(', '),f.location].filter(Boolean).join(' · ')];
  if(f.clientId)lines.push(`Schedule and profile matches for client #${f.clientId}’s saved preferences. Review any unconfirmed preferences below.`);
  for(const p of out.providers||[]){lines.push(`\n${p.name}${f.children?' — '+p.ages.join(', '):''}`);const groups=new Map();for(const s of p.slots.slice(0,8)){const day=localDate(new Date(s.startAt),out.timeZone);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(`${localTime(new Date(s.startAt),out.timeZone)} ${s.format==='VIRTUAL'?'virtual':s.buildingName||'in person'} (${s.frequency==='ONCE'?(s.purpose==='MEETING'?'one-time meeting':'single intake'):String(s.frequency||'WEEKLY').replaceAll('_',' ').toLowerCase()})`);}for(const [day,times] of groups)lines.push(`- ${day}: ${times.join('; ')}`);if(p.totalSlots>8)lines.push(`+ ${p.totalSlots-8} more matching options.`);if(p.review?.length)lines.push('Review: '+p.review.join(' '));if(p.calendarWarnings?.length)lines.push('Calendar check incomplete — verify these times before booking.');}
  if(!out.providers?.length)lines.push('No verified matches in this search window.');
  if(out.failedProviderIds?.length)lines.push(`${out.failedProviderIds.length} provider calendar checks could not complete; these are not confirmed unavailable.`);
  if(out.unknownAgeProviderCount)lines.push(`${out.unknownAgeProviderCount} providers have no recorded age range and were not counted as age matches.`);
  if(out.unverified?.length)lines.push('\nStill needs team verification (not included in the matching criteria):\n'+out.unverified.map(x=>'- '+x).join('\n'));
  if(f.children)lines.push('For a specific child, give their age to narrow these age bands.');
  lines.push('These are published openings after calendar checks. Recurrence describes the published window; future conflicts and client suitability must be checked when booking.');
  return lines.join('\n');
}
