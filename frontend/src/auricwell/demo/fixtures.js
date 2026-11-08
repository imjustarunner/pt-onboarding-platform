import {demoBookingResponse} from './booking.js';
import { demoClients, demoProviders, demoStaff } from './people.js';
import { createDemoNoteFixtures } from './notes.js';
import { createDemoTaskFixtures } from './tasks.js';
import { demoClientRecordIds } from './recordIds.js';
import { zonedDatetimeLocalToIso } from '../../utils/timezones.js';
// Fictional fixtures only. This adapter has no network fallback and never accepts writes.
export const practice = { id: 990101, name: 'Meadowbrook Therapy', slug: 'meadowbrook', organization_type: 'agency', timezone: 'America/Denver', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true, medicalBillingEnabled: true } };
export const providers = demoProviders;
export const staff = demoStaff;
export const actor = { ...providers[0], role: 'super_admin', email: 'avery@example.invalid', agencyIds: [practice.id], agencies: [practice], demoMode: true };
export const clients = demoClients;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
export const weekStart = ymd(monday);
const noteFixtures = createDemoNoteFixtures({ practice, actor, clients, providers, weekStart });
export const drafts = noteFixtures.drafts;
const taskFixtures=createDemoTaskFixtures({practice,actor,staff,weekStart});
export const demoTaskLists=taskFixtures.lists;
const historicalNotes = noteFixtures.historicalNotes;
const claims = clients.map((c,i)=>({id:demoClientRecordIds(c.id).claimId,agency_id:practice.id,client_id:c.id,clinical_note_id:demoClientRecordIds(c.id).historyNoteId,claim_number:`DEMO-${101+i}`,payer_name:'Example Health Plan',date_of_service:weekStart,amount_cents:12500,currency_code:'USD',claim_lifecycle:['draft','ready','rejected'][i % 3],payer_sequence:1}));
// Seed current display versions so shared-calendar migrations do not try to save
// on first load. View choices already use the demo's memory-only browser storage.
const preferenceDefaults = () => ({schedule_display_prefs:{layoutDefaultsVersion:2,schedulePaletteVersion:2,scheduleSideBySide:false,rowHeightMode:'large',hideWeekend:true,spanMode:'week'}});
const providerFor = id => providers.find(provider => provider.id === Number(id));
function requireProvider(id) {const provider=providerFor(id);if(!provider)throw new Error('That provider is outside this fictional demo.');return provider;}
function workSchedule(providerId) {
 requireProvider(providerId);
 const id=Number(providerId),days=id===990112?[2,3,4,5]:id===990114?[1,2,3,4,5]:[1,2,3,4];
 const [startTime,endTime]=id===990112?['08:00','16:00']:id===990113?['08:30','17:00']:id===990114?['10:00','18:00']:['09:00','17:00'];
 return {schedule:[],hasSavedSchedule:true,isActive:true,blocks:days.map(dayOfWeek=>({dayOfWeek,startTime,endTime}))};
}
function schedule(start,providerId=actor.id) {
 const provider=requireProvider(providerId),assigned=clients.filter(client=>client.provider_id===provider.id);
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(start)) ? new Date(`${start}T12:00:00`) : new Date(`${weekStart}T12:00:00`);
 if(!Number.isFinite(date.getTime()))throw new Error('That schedule date is outside this fictional demo.');
 const events=[],workingDays=workSchedule(provider.id).blocks.map(block=>block.dayOfWeek);
 for(let day=0;day<7;day++) {
  const next=new Date(date);next.setDate(date.getDate()+day);if(!workingDays.includes(next.getDay()))continue;
  for(const [index,client] of assigned.entries()) {
   const time=client.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/),hour=(Number(time?.[1]||9)%12)+(time?.[3]==='PM'?12:0),minute=Number(time?.[2]||0),duration=Number(client.frequency?.match(/(\d+) minutes/)?.[1])||(client.status==='INTAKE'?60:50);
   const startMinutes=hour*60+minute,endMinutes=startMinutes+duration,clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}:00`;
   events.push({id:990200+providers.indexOf(provider)*1000+day*10+index,userId:provider.id,providerUserId:provider.id,agencyId:practice.id,kind:'PERSONAL_EVENT',clientId:client.id,appointmentStatus:client.reminder.startsWith('Confirmed')?'client_confirmed':'scheduled',reasonCode:'CLIENT_SESSION',title:`${client.initials} · ${client.service}`,startAt:zonedDatetimeLocalToIso(`${ymd(next)}T${clock(startMinutes)}`,practice.timezone),endAt:zonedDatetimeLocalToIso(`${ymd(next)}T${clock(endMinutes)}`,practice.timezone),status:'scheduled',modality:client.format==='In person'?'IN_PERSON':'VIRTUAL'});
  }
 }
 return {weekStart:ymd(date),providerId:provider.id,agencyId:practice.id,scheduleAgencyIds:[practice.id],scheduleEvents:events,officeEvents:[],schoolAssignments:[],schoolRequests:[],officeRequests:[],supervisionSessions:[],googleBusy:[],googleEvents:[],externalBusy:[],virtualWorkingHours:[]};
}
const clientFor = id => clients.find(c => c.id === Number(id));
function chart(id) {const client=clientFor(id);return {client,notes:historicalNotes.filter(d=>d.client_id===client.id),sessions:[],diagnoses:[{id:990160,icd10_code:'F43.23',description:'Adjustment disorder with mixed anxiety and depressed mood · fictional example'}],latestPlan:{id:990161,title:'Build confidence and strengthen coping strategies',status:'active',effective_date:weekStart,prescribed_frequency:'Weekly individual therapy',goals:[{id:990162,goal_text:'Build confidence using coping strategies.',status:'active',objectives:[{id:990163,objective_text:'Use a grounding strategy independently when stress increases.',scale_start:3,scale_current:5,scale_target:8}]}]},objectiveRatings:[],goals:[]};}
export function demoResponse(url, config={}) {
 const method=String(config.method||'get').toLowerCase();
 if (!['get','head'].includes(method)) throw new Error('Demo only: nothing was saved, signed, submitted or sent. Please use fictional information.');
 const parsed=new URL(url,'https://demo.invalid');const p=parsed.pathname.replace(/^\/api(?=\/)/,'');const q={...Object.fromEntries(parsed.searchParams),...config.params};
 for(const key of ['agencyId','agency_id','organizationId','organization_id']) if(q[key] && Number(q[key])!==practice.id) throw new Error('That practice is outside this fictional demo.');
 const clientMatch=p.match(/\/clients\/(\d+)(?:\/|$)/);if(clientMatch&&!clientFor(clientMatch[1]))throw new Error('That client is outside this fictional demo.');
 const userMatch=p.match(/\/users\/(\d+)(?:\/|$)/);if(userMatch&&!staff.some(u=>u.id===Number(userMatch[1])))throw new Error('That provider is outside this fictional demo.');
 const bookingResponse = demoBookingResponse(p,q);
 if(bookingResponse !== undefined)return bookingResponse;
 const taskResponse = taskFixtures.response(p,q);
 if(taskResponse !== undefined)return taskResponse;
 const noteResponse = noteFixtures.response(p, q);
 if(noteResponse !== undefined) return noteResponse;
 if(p==='/auricwell-preview/my-clients'){const selected=clients.filter(c=>c.provider_id===actor.id);return {clients:selected,total:selected.length,agencies:[{...practice,client_count:selected.length}],page:1,pageSize:50};}
 if(p==='/clients') {const search=String(q.search||'').toLowerCase(),providerId=q.provider_id||q.providerId;if(providerId)requireProvider(providerId);const selected=clients.filter(c=>(!providerId||c.provider_id===Number(providerId))&&(!q.status||c.status===String(q.status).toUpperCase())&&`${c.full_name} ${c.initials}`.toLowerCase().includes(search));return {clients:Number(q.page||1)>1?[]:selected,total:selected.length};}
 if(p==='/auricwell-preview/providers')return {providers};
 if(p==='/auricwell-preview/workspace-scope')return {actorId:actor.id,scopes:['mine','practice'],providers:providers.map(p=>({...p,name:`${p.first_name} ${p.last_name}`,active:true,canViewSchedule:true}))};
 if(p==='/auricwell-preview/directory'){const search=String(q.search||'').toLowerCase(),providerId=q.providerId||(q.scope==='mine'?actor.id:null);if(providerId)requireProvider(providerId);let rows=clients.filter(c=>(!providerId||c.provider_id===Number(providerId))&&`${c.full_name} ${c.initials}`.toLowerCase().includes(search));rows.sort((a,b)=>a.full_name.localeCompare(b.full_name)*(q.order==='desc'?-1:1));return {clients:Number(q.page||1)>1?[]:rows,total:rows.length,page:1,pageSize:50};}
 if(p==='/auricwell-preview/agenda'){
   const selected=q.providerId?[requireProvider(q.providerId)]:q.scope==='practice'?providers:[actor];
   let items=selected.flatMap(provider=>schedule(q.start,provider.id).scheduleEvents.map(e=>({...e,key:`appointment:${e.id}`,providerId:provider.id,providerName:provider.name,kind:'appointment',clientName:clientFor(e.clientId).full_name,date:e.startAt.slice(0,10),startAt:e.startAt,endAt:e.endAt,location:e.modality,readOnly:true,status:e.appointmentStatus})));
   const search=String(q.search||'').toLowerCase();items=items.filter(r=>(!q.end||r.date<q.end)&&(!search||[r.clientName,r.providerName,r.title,r.location].join(' ').toLowerCase().includes(search))&&(!q.kind||q.kind==='all'||q.kind===r.kind)&&q.status!=='canceled');
   const field={client:'clientName',provider:'providerName',status:'status'}[q.sort]||'startAt';items.sort((a,b)=>String(a[field]).localeCompare(String(b[field]))*(q.order==='desc'?-1:1));
   return {items:items.slice(((Number(q.page)||1)-1)*50,(Number(q.page)||1)*50),total:items.length,timeZone:practice.timezone,page:Number(q.page)||1,pageSize:50};
 }

 if(p==='/auricwell-preview/tasks'){const tasks=taskFixtures.tasks.filter(task=>task.assigned_to_user_id===actor.id&&task.status!=='completed');return {tasks,total:tasks.length};}
 if(p==='/appointments')return {appointments:schedule(q.windowStart,q.providerId||q.provider_id||actor.id).scheduleEvents.map(e=>({...e,serviceCode:clientFor(e.clientId)?.status==='INTAKE'?'90791':'90834'}))};
 if(p==='/appointments/booking-access'){requireProvider(q.providerUserId||actor.id);return {enabled:true};}
 if(p==='/appointments/staff-alerts'){requireProvider(q.providerId||actor.id);return {alerts:[]};}
 const waitlist=p.match(/^\/availability\/providers\/(\d+)\/enrollment-waitlist$/);if(waitlist){requireProvider(waitlist[1]);return {requests:[],waitlistEnabled:false,total:0};}
 if(/^\/clients\/\d+$/.test(p))return clientFor(clientMatch[1]);
 if(p.endsWith('/chart')&&clientMatch)return {...chart(clientMatch[1]),...noteFixtures.chartExtras(Number(clientMatch[1]))};
 if(clientMatch&&p.endsWith('/agency-affiliations'))return [{agency_id:practice.id,agency_name:practice.name}];
 if(clientMatch&&/\/(guardians|affiliations|records-copy-blocks|clinical-responses)$/.test(p))return [];
 if(clientMatch&&p.endsWith('/intake-note'))return {note:null};
 if(p==='/clinical-notes/context')return {providerCredentialText:'LPC',derivedTier:'intern_plus',eligibleServiceCodes:['90834','90791'],serviceCodeCatalog:[],audioAgreementTemplates:[]};
 if(p==='/clinical-notes/programs')return {programs:[]};
 if(p==='/clinical-notes/recent')return {drafts,signedSessions:[]};
 if(['/clinical-notes/contact-documentation','/medical-billing/planned-services'].includes(p))return {items:[]};
 if(p==='/appointments/waiver-reviews')return {items:[]};
 if(p==='/clinical-notes/work-queue')return {items:[]};
 if(p==='/clinical-notes/termination-outcomes')return {outcomes:[]};
 if(p==='/note-aid/catalog')return {settings:[],assignments:[],customAids:[],peopleScopedCatalogIds:[],peopleScopedCustomIds:[]};
 if(p==='/medical-billing/service-locations')return {choices:[{id:990151,label:'Telehealth',name:'Telehealth',place_of_service:'10'}]};
 if(p==='/me/notes-to-sign/count')return {count:0};
 if(p==='/me/notes-to-sign')return {notes:[]};
 if(p===`/supervisor-assignments/supervisee/${actor.id}`||p==='/tasks')return [];
 if(userMatch&&p===`/users/${userMatch[1]}/preferences`)return preferenceDefaults();
 if(userMatch&&p===`/users/${userMatch[1]}/schedule-summary`)return schedule(q.weekStart||q.weekStartYmd,userMatch[1]);
 if(userMatch&&p===`/users/${userMatch[1]}/work-schedule`)return workSchedule(userMatch[1]);
 if(userMatch&&p===`/users/${userMatch[1]}/virtual-session-clients`){const provider=requireProvider(userMatch[1]);return {clients:clients.filter(c=>c.provider_id===provider.id).map(c=>({...c,displayName:c.full_name})),guardians:[]};}
 if(userMatch&&p===`/users/${userMatch[1]}/meeting-candidates`){requireProvider(userMatch[1]);return [];}
 if(userMatch&&p===`/users/${userMatch[1]}/office-assignments`){requireProvider(userMatch[1]);return [];}
 if(userMatch&&p===`/users/${userMatch[1]}/agencies`)return [practice];
 if(p==='/users/me/agencies'||p==='/agencies')return [practice];
 if(p===`/agencies/${practice.id}`)return practice;
 if(p==='/users')return staff;
 if(p==='/providers')return providers;
 if(userMatch&&p===`/users/${userMatch[1]}`)return staff.find(person=>person.id===Number(userMatch[1]));
 if(p==='/users/me')return actor;
 if(p==='/auth/me')return {user:actor,agencies:[practice]};
 if(userMatch&&p===`/users/${userMatch[1]}/agencies/${practice.id}/practice-categories`){requireProvider(userMatch[1]);return [];}
 if(['/calendar-connections',`/agencies/${practice.id}/affiliated-organizations`].includes(p))return [];
 if(p==='/communications/call-billing')return {items:[],total:0,hasMore:false};
 if(p==='/medical-billing/workspace') {const selected=claims.filter(c=>(!q.status||q.status==='all'||q.status===c.claim_lifecycle||q.status==='attention'&&c.claim_lifecycle==='rejected')&&(!q.search||`${c.claim_number} ${c.id}`.toLowerCase().includes(String(q.search).toLowerCase())));const counts=claims.reduce((result,claim)=>{result[claim.claim_lifecycle]=(result[claim.claim_lifecycle]||0)+1;return result;},{});return {organizations:[{...practice,counts,connection:{configured:false},enrollments:[],eft:[],payments:{postingCount:0,paidCents:0}}],claims:selected,total:selected.length,capabilities:{claims:true,enrollments:true},updatedAt:new Date().toISOString()};}
 const claimMatch=p.match(/^\/medical-billing\/claimmd\/claims\/(\d+)\/(history|draft|review)$/);
 if(claimMatch) {const claim=claims.find(c=>c.id===Number(claimMatch[1]));if(!claim)throw new Error('That claim is outside this fictional demo.');const history=[{id:990170,type:'draft_created',status:'draft',createdAt:`${weekStart}T17:00:00Z`,messages:[{message:'Fictional claim prepared for review. Nothing has been transmitted.'}]}];if(claimMatch[2]==='history')return {history};if(claimMatch[2]==='draft')return {claim:{...claim,billing_revision:1,place_of_service:'10'},lines:[{id:990180,procedure_code:'90834',units:1,charge_cents:12500,modifiers_json:[]}]};return {claimId:claim.id,lifecycle:claim.claim_lifecycle,readiness:{ready:false,blockers:['Demo only: clearinghouse and payer enrollment are not connected.'],warnings:[]},history,payload:{charge:[{from_date:weekStart,proc_code:'90834',units:1,place_of_service:'10',charge:'125.00'}],total_charge:'125.00'},reviewHash:'demo-only'};}
 const serviceChanges=p.match(/^\/medical-billing\/claimmd\/claims\/(\d+)\/service-changes$/);if(serviceChanges){if(!claims.some(claim=>claim.id===Number(serviceChanges[1])))throw new Error('That claim is outside this fictional demo.');return {changes:[],previouslyTransmitted:false,revision:1};}
 if(p==='/supervision/providers')return {providers};
 if(p==='/medical-billing/claimmd/enrollments')return {enrollments:[]};
 if(p==='/medical-billing/claimmd/billing-offices')return {offices:[]};
 if(p==='/medical-billing/claims/undrafted-notes')return {notes:[]};
 if(p==='/medical-billing/payer-setup-requests')return {items:[]};
 if(p==='/medical-billing/claimmd/payers')return {payers:[]};
 const noteMatch=p.match(/^\/medical-billing\/notes\/(\d+)$/);if(noteMatch){const note=historicalNotes.find(d=>d.id===Number(noteMatch[1]));if(note)return {note:{...note,agencyId:practice.id,clientId:note.client_id,noteType:'PROGRESS_NOTE',dateOfService:note.date_of_service,serviceCode:'90834',createdAt:note.created_at,status:'signed',providerSignedAt:note.provider_signed_at,providerName:'Avery Lane, LPC',note_status:'signed',outputJson:{sections:{Narrative:note.input_text},meta:{sessionContext:{durationMinutes:50,startTimeLocal:'09:00',endTimeLocal:'09:50'}}},content_json:{text:note.input_text}},session:{client_id:note.client_id,agency_id:practice.id}};}
 throw new Error('This action is not included in the fictional demo. Explore the calendar, clients, provider profiles, note drafts or billing queue.');
}
