// Repository-owned fictional records. This module never imports the API client or reads a database.
export const school={id:990001,name:'Cedar Grove Elementary',official_name:'Cedar Grove Elementary',slug:'cedar-grove-demo',portal_url:'cedar-grove-demo',organization_type:'school',is_active:true};
export const agency={id:990002,name:'Meadowbrook Student Care · Example agency',slug:'meadowbrook-demo',portal_url:'meadowbrook-demo',organization_type:'agency',is_active:true,feature_flags:{schoolPortalsEnabled:true}};
export const user={id:990003,first_name:'Sam',last_name:'Rivera',firstName:'Sam',lastName:'Rivera',email:'sam@example.test',role:'school_staff',isSchoolAdmin:true,__schoolOnboardingDemoUser:true};
export const providers=[
 {provider_user_id:990011,first_name:'Avery',last_name:'Lane',title:'School-based therapist',credential:'LPC',day_of_week:'Monday',service_focus:'Anxiety, emotional regulation and school transitions',languages_spoken:'English, Spanish',school_info_blurb:'I help students build practical coping skills and confidence, with school and caregiver collaboration when authorized. This is a fictional provider profile.',profile_photo_url:'/auricwell/examples/avery-lane.jpg',insurances_accepted:[],supervisors:[],slots_total:6,slots_used:2,slots_available:4,start_time:'08:30:00',end_time:'14:30:00',is_active:true},
 {provider_user_id:990012,first_name:'Jordan',last_name:'Reed',title:'School-based therapist',credential:'LCSW',day_of_week:'Thursday',service_focus:'Connection, coping skills and life transitions',languages_spoken:'English',school_info_blurb:'My approach combines a steady relationship with strategies students can use in their day. We review progress together and coordinate with the authorized care team. Fictional example.',profile_photo_url:'/auricwell/examples/jordan-reed.jpg',insurances_accepted:[],supervisors:[],slots_total:6,slots_used:2,slots_available:4,start_time:'09:00:00',end_time:'15:00:00',is_active:true}
];
export const clients=[
 {id:990101,first_name:'Willow',last_name:'Brooks',initials:'WB',identifier_code:'DEMO-101',grade:'4',provider_id:990011,service_day:'Monday'},
 {id:990102,first_name:'Theo',last_name:'Morgan',initials:'TM',identifier_code:'DEMO-102',grade:'3',provider_id:990011,service_day:'Monday'},
 {id:990103,first_name:'Casey',last_name:'Park',initials:'CP',identifier_code:'DEMO-103',grade:'5',provider_id:990012,service_day:'Thursday'},
 {id:990104,first_name:'Robin',last_name:'Ellis',initials:'RE',identifier_code:'DEMO-104',grade:'4',provider_id:990012,service_day:'Thursday'}
].map(c=>({...c,full_name:`${c.first_name} ${c.last_name}`,client_name:`${c.first_name} ${c.last_name}`,organization_id:school.id,agency_id:agency.id,status:'ACTIVE',client_status_key:'current',client_status_label:'Current',parents_contacted_at:'2026-09-01',parents_contacted_successful:true,first_service_at:'2026-09-08',document_status:'complete',school_year:'2026-2027',school_staff_access_level:'full',school_staff_effective_access_state:'active',school_portal_can_open:true,school_portal_gray:false,school_portal_force_placeholder:false,roi_expires_at:'2027-08-01',submission_date:'2026-09-01',provider_name:providers.find(p=>p.provider_user_id===c.provider_id).first_name+' '+providers.find(p=>p.provider_user_id===c.provider_id).last_name,provider_ids:[c.provider_id],provider_day_pairs:[{provider_user_id:c.provider_id,service_day:c.service_day,day_of_week:c.service_day}],unread_notes_count:0}));
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const assigned=id=>clients.filter(c=>c.provider_id===Number(id));
const abs=p=>({...p,id:p.provider_user_id,email:null,profile_photo_path:new URL(p.profile_photo_url,globalThis.location?.origin||'https://example.test').href,profile_photo_url:new URL(p.profile_photo_url,globalThis.location?.origin||'https://example.test').href});
const stats={assigned_weekdays_count:2,clients_total:4,clients_assigned:4,slots_total:12,slots_used:4,slots_available:8,school_staff_count:2};
const staff=[{id:user.id,first_name:'Sam',last_name:'Rivera',role:'school_staff',is_school_admin:true,email:'sam@example.test'},{id:990004,first_name:'Alex',last_name:'Chen',role:'school_staff',email:'alex@example.test'}];
function notAvailable(){throw Object.assign(new Error('This action is outside the fictional demo. Nothing was sent or saved.'),{status:409});}
export function demoResponse(url,{method='get',params={}}={}) {
 const parsed=new URL(url,'https://example.test'),path=parsed.pathname.replace(/^\/api(?=\/)/,'');
 const query={...Object.fromEntries(parsed.searchParams),...params};
 if(!['get','head'].includes(method.toLowerCase()))return notAvailable();
 const portal=path.match(/^\/school-portal\/(\d+)\/(.*)$/);
 if(portal && Number(portal[1])!==school.id)return notAvailable();
 const rest=portal?.[2];
 if(rest==='affiliation')return {active_agency_id:agency.id,active_agency:agency,school_agency:agency,can_edit_clients:false};
 if(rest==='stats')return stats;
 if(rest==='days')return weekdays.map(weekday=>({weekday,is_active:true,has_providers:providers.some(p=>p.day_of_week===weekday)}));
 if(rest==='providers/scheduling')return providers.map(abs);
 const day=rest?.match(/^days\/([^/]+)\/providers$/);
 if(day)return providers.filter(p=>p.day_of_week===decodeURIComponent(day[1])).map(abs);
 const profile=rest?.match(/^providers\/(\d+)\/(profile|caseload-slots|assigned-clients)$/);
 if(profile){const p=providers.find(p=>p.provider_user_id===Number(profile[1]));if(!p)return notAvailable();if(profile[2]==='profile')return {...abs(p),school_organization_id:school.id};if(profile[2]==='assigned-clients')return assigned(p.provider_user_id);return {provider_user_id:p.provider_user_id,school_organization_id:school.id,assignments:[{...p,clients:assigned(p.provider_user_id)}]};}
 const slots=rest?.match(/^days\/([^/]+)\/providers\/(\d+)\/soft-slots$/);
 if(slots){const p=providers.find(p=>p.provider_user_id===Number(slots[2])&&p.day_of_week===decodeURIComponent(slots[1]));if(!p)return notAvailable();return {persisted:true,slots:Array.from({length:6},(_,i)=>({id:990201+i,slot_index:i+1,start_time:`${String(9+i).padStart(2,'0')}:00:00`,end_time:`${String(9+i).padStart(2,'0')}:45:00`,client_id:assigned(p.provider_user_id)[i]?.id||null,note:i===0?'Example recurring school visit':null}))};}
 if(rest==='clients'||rest==='my-roster'||rest==='client-assignment-search')return clients.filter(c=>!query.q||`${c.first_name} ${c.last_name} ${c.initials}`.toLowerCase().includes(String(query.q).toLowerCase()));
 if(rest==='roster-school-years')return {school_years:['2026-2027']};
 if(rest==='school-staff')return staff;
 const student=rest?.match(/^clients\/(\d+)\/(comments|school-staff-roi-summary)$/);
 if(student){if(!clients.some(c=>c.id===Number(student[1])))return notAvailable();if(student[2]==='comments')return [{id:990601,comment:'Fictional example: classroom pickup is by the front office.',message:'Fictional example: classroom pickup is by the front office.',body:'Fictional example: classroom pickup is by the front office.',created_at:'2026-10-01T10:00:00',author_name:'Sam Rivera'}];return {staff:staff.map(s=>({school_staff_user_id:s.id,name:`${s.first_name} ${s.last_name}`,status_label:'Active',effective_access_state:'active',roi_expires_at:'2027-08-01'}))};}
 if(rest==='notifications/feed')return {items:[],notifications:[]};
 if(rest==='announcements/banner')return {announcements:[{id:990301,title:'Welcome to Cedar Grove',message:'This working portal uses fictional people and records. Open Providers, Days / Schedule or Roster to explore.',body:'Explore the sample school portal.',is_active:true}]};
 if(rest==='school-events')return [{id:990401,title:'Student support team meeting',event_type:'meeting',start_at:'2026-10-08T15:00:00',end_at:'2026-10-08T16:00:00',event_date:'2026-10-08',school_organization_id:school.id}];
 if(rest==='school-events/missing')return {missingCategories:[]};
 if(rest==='public-documents'||rest==='documents'||rest==='skills-groups'||rest==='skills-group-meetings'||rest==='psychotherapy-compliance/summary')return [];
 if(rest==='faq')return [{id:990501,question:'What can I explore in this demo?',answer:'Open the provider cards, weekly school schedule and fictional student roster. This is the actual school portal interface. Changes and messages are not saved or sent.'}];
 if(rest?.endsWith('/notes')||rest?.endsWith('/messages')||rest?.endsWith('/history'))return [];
 const client=path.match(/^\/clients\/(\d+)(?:\/(.*))?$/);
 if(client){const c=clients.find(c=>c.id===Number(client[1]));if(!c)return notAvailable();if(!client[2])return c;if(client[2]==='school-roi-access')return {can_open:true,school_portal_can_open:true,access_level:'full',effective_access_state:'active'};return [];}
 if(path==='/agencies'||path==='/users/me/agencies'||path===`/users/${user.id}/agencies`)return [agency,school];
 if(path===`/agencies/${agency.id}`)return agency;
 if(path===`/agencies/${school.id}`||path.includes('/agencies/slug/'))return school;
 if(path==='/dashboard/school-overview')return {schools:[{...stats,school_id:school.id,school_name:school.name,school_slug:school.slug,school_portal_url:school.portal_url,portal_url:school.portal_url,organization_type:'school',is_active:true,providers_count:2,provider_count:2,clients_current:4,notifications_count:0,notifications_comments_count:0,notifications_messages_count:0,waitlist_count:0,active_clients:4,total_clients:4,assigned_clients:4,unassigned_clients:0,district_name:'Example School District'}]};
 if(path==='/school-portal/school-events/overview')return {events:[],missing:[]};
 if(path==='/school-portal/district-schedule-links')return {districts:[]};
 if(path==='/school-portal/bulk-announcements')return [];
 if(path.includes('/preferences'))return {review_prompt_state:{byAgency:{[agency.id]:{completed:true}}}};
 if(path==='/chat/threads')return [];
 if(path==='/users/me')return user;
 if(path==='/auth/test-accounts')return [];
 if(path==='/account-security')return {verified:true,required:false};
 if(path.includes('/school-staff-waiver')||path.includes('/waiver-status'))return {required:false,isSigned:true,status:'signed'};
 if(path.includes('/client-statuses'))return [{key:'current',label:'Current',color:'#16845a'}];
 if(path.includes('/document-statuses'))return [{key:'complete',label:'Complete'}];
 if(path.includes('/support-tickets'))return [];
 if(path==='/psychotherapy-compliance/summary')return {by_client:{},by_org_client_kind:{}};
 if(path.startsWith('/public-intake/school/'))return {links:[]};
 // Unknown reads also stay inside this adapter; no request can fall through to a backend.
 return notAvailable();
}
