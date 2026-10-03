// Fictional fixtures only. This adapter has no network fallback and never accepts writes.
export const practice = { id: 990101, name: 'Meadowbrook Therapy', slug: 'meadowbrook', organization_type: 'agency', timezone: 'America/Denver', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true, medicalBillingEnabled: true } };
export const providers = [
  { id: 990111, first_name: 'Avery', last_name: 'Lane', credential: 'LPC', is_active: 1, status: 'ACTIVE', profile_photo_url: '/auricwell/examples/avery-lane.jpg', specialties: ['Anxiety', 'Life transitions', 'Individual therapy'], bio: 'Avery helps adults build practical coping skills and make room for meaningful change. Their approach combines collaborative goal setting, reflection and strategies to try between visits.' },
  { id: 990112, first_name: 'Jordan', last_name: 'Reed', credential: 'LCSW', is_active: 1, status: 'ACTIVE', profile_photo_url: '/auricwell/examples/jordan-reed.jpg', specialties: ['Stress', 'Relationships', 'Individual therapy'], bio: 'Jordan works with adults navigating stress and changing relationships. Sessions balance a welcoming space to talk with practical ways to build confidence and connection.' }
];
export const actor = { ...providers[0], role: 'super_admin', email: 'avery@example.invalid', agencyIds: [practice.id], agencies: [practice] };
export const clients = [
  { id: 990121, full_name: 'Emerson Cole', initials: 'E.C.', status: 'ACTIVE' },
  { id: 990122, full_name: 'Morgan Rivera', initials: 'M.R.', status: 'ACTIVE' },
  { id: 990123, full_name: 'Jamie Stone', initials: 'J.S.', status: 'ACTIVE' }
].map(c => ({ ...c, agency_id: practice.id, agency_name: practice.name, source:'MANUAL', provider_id: actor.id }));
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
export const weekStart = ymd(monday);
export const drafts = clients.slice(0,2).map((c,i) => ({ id: 990131+i, client_id:c.id, client_full_name:c.full_name, initials:c.initials, agency_id:practice.id, client_agency_id:practice.id, note_type:'PROGRESS_NOTE', service_code:'90834', status:'draft', date_of_service:weekStart, created_at:`${weekStart}T16:00:00Z`, updated_at:`${weekStart}T17:00:00Z`, title:'Individual therapy progress note', input_text: 'Fictional session example: We reviewed the client’s coping strategies and practiced a grounding exercise. The client described using a strategy independently twice this week. Continue practicing and review progress at the next visit.' }));
const historicalNotes = clients.map((c,i)=>({...drafts[0],id:990171+i,client_id:c.id,client_full_name:c.full_name,initials:c.initials,status:'signed',provider_signed_at:`${weekStart}T17:00:00Z`,title:'Progress note · fictional historical record'}));
const claims = clients.map((c,i)=>({id:990141+i,agency_id:practice.id,client_id:c.id,clinical_note_id:990171+i,claim_number:`DEMO-${101+i}`,payer_name:'Example Health Plan',date_of_service:weekStart,amount_cents:12500,currency_code:'USD',claim_lifecycle:['draft','ready','rejected'][i],payer_sequence:1}));
function schedule(start) {
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(start)) ? new Date(`${start}T12:00:00`) : new Date(`${weekStart}T12:00:00`);
 const events=[];
 for(let day=0;day<5;day++) { const next=new Date(date);next.setDate(date.getDate()+day);for(const [i,hour] of [9,11,14].entries()) events.push({id:990200+day*10+i,userId:actor.id,agencyId:practice.id,kind:'PERSONAL_EVENT',clientId:clients[i].id,appointmentStatus:i===0?'client_confirmed':'scheduled',reasonCode:'CLIENT_SESSION',title:`${clients[i].initials} · Individual therapy`,startAt:`${ymd(next)}T${hour.toString().padStart(2,'0')}:00:00`,endAt:`${ymd(next)}T${hour.toString().padStart(2,'0')}:50:00`,status:'scheduled',modality:day%2?'IN_PERSON':'VIRTUAL'}); }
 return {weekStart:ymd(date),agencyId:practice.id,scheduleAgencyIds:[practice.id],scheduleEvents:events,officeEvents:[],schoolAssignments:[],schoolRequests:[],officeRequests:[],supervisionSessions:[],googleBusy:[],googleEvents:[],externalBusy:[],virtualWorkingHours:[]};
}
const clientFor = id => clients.find(c => c.id === Number(id));
function chart(id) {const client=clientFor(id);return {client,notes:historicalNotes.filter(d=>d.client_id===client.id),sessions:[],diagnoses:[{id:990160,icd10_code:'F43.23',description:'Adjustment disorder with mixed anxiety and depressed mood · fictional example'}],latestPlan:{id:990161,title:'Build confidence and strengthen coping strategies',status:'active',effective_date:weekStart,prescribed_frequency:'Weekly individual therapy',goals:[{id:990162,goal_text:'Build confidence using coping strategies.',status:'active',objectives:[{id:990163,objective_text:'Use a grounding strategy independently when stress increases.',scale_start:3,scale_current:5,scale_target:8}]}]},objectiveRatings:[],goals:[]};}
export function demoResponse(url, config={}) {
 const method=String(config.method||'get').toLowerCase();
 if (!['get','head'].includes(method)) throw new Error('Demo only: nothing was saved, signed, submitted or sent. Please use fictional information.');
 const parsed=new URL(url,'https://demo.invalid');const p=parsed.pathname.replace(/^\/api(?=\/)/,'');const q={...Object.fromEntries(parsed.searchParams),...config.params};
 for(const key of ['agencyId','agency_id','organizationId','organization_id']) if(q[key] && Number(q[key])!==practice.id) throw new Error('That practice is outside this fictional demo.');
 const clientMatch=p.match(/\/clients\/(\d+)(?:\/|$)/);if(clientMatch&&!clientFor(clientMatch[1]))throw new Error('That client is outside this fictional demo.');
 const userMatch=p.match(/\/users\/(\d+)(?:\/|$)/);if(userMatch&&!providers.some(u=>u.id===Number(userMatch[1])))throw new Error('That provider is outside this fictional demo.');
 if(p==='/clients') {const search=String(q.search||'').toLowerCase();return {clients:Number(q.page||1)>1?[]:clients.filter(c=>`${c.full_name} ${c.initials}`.toLowerCase().includes(search)),total:clients.length};}
 if(p==='/auricwell-preview/providers')return {providers};
 if(/^\/clients\/\d+$/.test(p))return clientFor(clientMatch[1]);
 if(p.endsWith('/chart')&&clientMatch)return chart(clientMatch[1]);
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
 if(p===`/users/${actor.id}/preferences`)return {preferences:{}};
 if(p===`/users/${actor.id}/schedule-summary`)return schedule(q.weekStart||q.weekStartYmd);
 if(p===`/users/${actor.id}/work-schedule`)return {schedule:[]};
 if(p===`/users/${actor.id}/virtual-session-clients`)return {clients:clients.map(c=>({...c,displayName:c.full_name})),guardians:[]};
 if(p==='/users/me/agencies'||p==='/agencies')return [practice];
 if(p===`/agencies/${practice.id}`)return practice;
 if(p==='/users'||p==='/providers')return providers;
 if(p===`/users/${actor.id}`)return actor;
 if(p==='/users/me')return actor;
 if(p==='/auth/me')return {user:actor,agencies:[practice]};
 if(p===`/users/${actor.id}/agencies/${practice.id}/practice-categories`)return [];
 if(['/offices','/calendar-connections',`/users/${actor.id}/meeting-candidates`,`/agencies/${practice.id}/affiliated-organizations`].includes(p))return [];
 if(p==='/office-schedule/booking-metadata')return {serviceCodes:[{code:'90834',label:'Individual psychotherapy',durationMinutes:50}],serviceLocations:[{id:990151,name:'Telehealth',placeOfService:'10'}],appointmentTypes:[],appointmentSubtypes:[]};
 if(p==='/medical-billing/workspace') {const selected=claims.filter(c=>(!q.status||q.status==='all'||q.status===c.claim_lifecycle||q.status==='attention'&&c.claim_lifecycle==='rejected')&&(!q.search||`${c.claim_number} ${c.id}`.toLowerCase().includes(String(q.search).toLowerCase())));return {organizations:[{...practice,counts:{draft:1,ready:1,rejected:1},connection:{configured:false},enrollments:[],eft:[],payments:{postingCount:0,paidCents:0}}],claims:selected,total:selected.length,capabilities:{claims:true,enrollments:true},updatedAt:new Date().toISOString()};}
 const claimMatch=p.match(/^\/medical-billing\/claimmd\/claims\/(\d+)\/(history|draft|review)$/);
 if(claimMatch) {const claim=claims.find(c=>c.id===Number(claimMatch[1]));if(!claim)throw new Error('That claim is outside this fictional demo.');const history=[{id:990170,type:'draft_created',status:'draft',createdAt:`${weekStart}T17:00:00Z`,messages:[{message:'Fictional claim prepared for review. Nothing has been transmitted.'}]}];if(claimMatch[2]==='history')return {history};if(claimMatch[2]==='draft')return {claim:{...claim,billing_revision:1,place_of_service:'10'},lines:[{id:990180,procedure_code:'90834',units:1,charge_cents:12500,modifiers_json:[]}]};return {claimId:claim.id,lifecycle:claim.claim_lifecycle,readiness:{ready:false,blockers:['Demo only: clearinghouse and payer enrollment are not connected.'],warnings:[]},history,payload:{charge:[{from_date:weekStart,proc_code:'90834',units:1,place_of_service:'10',charge:'125.00'}],total_charge:'125.00'},reviewHash:'demo-only'};}
 if(/^\/medical-billing\/claimmd\/claims\/99014[1-3]\/service-changes$/.test(p))return {changes:[],previouslyTransmitted:false,revision:1};
 if([`/tenant-booking/agencies/${practice.id}/booking-options`,`/tenant-booking/agencies/${practice.id}/services`].includes(p))return {services:[]};
 if(p==='/supervision/providers')return {providers};
 if(p==='/medical-billing/claimmd/enrollments')return {enrollments:[]};
 if(p==='/medical-billing/claimmd/billing-offices')return {offices:[]};
 if(p==='/medical-billing/claims/undrafted-notes')return {notes:[]};
 if(p==='/medical-billing/payer-setup-requests')return {items:[]};
 if(p==='/medical-billing/claimmd/payers')return {payers:[]};
 const noteMatch=p.match(/^\/medical-billing\/notes\/(\d+)$/);if(noteMatch){const note=historicalNotes.find(d=>d.id===Number(noteMatch[1]));if(note)return {note:{...note,agencyId:practice.id,clientId:note.client_id,noteType:'PROGRESS_NOTE',dateOfService:note.date_of_service,serviceCode:'90834',createdAt:note.created_at,status:'signed',providerSignedAt:note.provider_signed_at,providerName:'Avery Lane, LPC',note_status:'signed',outputJson:{sections:{Narrative:note.input_text},meta:{sessionContext:{durationMinutes:50,startTimeLocal:'09:00',endTimeLocal:'09:50'}}},content_json:{text:note.input_text}},session:{client_id:note.client_id,agency_id:practice.id}};}
 throw new Error('This action is not included in the fictional demo. Explore the calendar, clients, provider profiles, note drafts or billing queue.');
}
