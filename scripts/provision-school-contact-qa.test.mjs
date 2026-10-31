import test from 'node:test';
import assert from 'node:assert/strict';
import {provision,provisionPlan,STAFF,CONTACT_FIXTURES,SSO_EMAIL} from './provision-school-contact-qa.mjs';
const passwordHash='$2b$12$'+'A'.repeat(53);
const fullProvider=id=>({id,email:SSO_EMAIL,username:SSO_EMAIL,work_email:SSO_EMAIL,personal_email:SSO_EMAIL,
  first_name:'Quality',last_name:'Tester QA SSO',role:'provider',is_demo:0,is_active:1,is_archived:0,
  credential:null,sso_password_override:0,has_supervisor_privileges:0,login_is_group_email:0,password_hash:passwordHash});
function fixture(overrides={}){
 let state={agency:{id:450,slug:'auricwell-qa-demo',is_active:1,is_archived:0,feature_flags:{medicalBillingEnabled:true,qaSandbox:{syntheticOnly:true,inbox:'testing@itsco.health'},keep:'unchanged'}},
  school:{id:451,slug:'auricwell-qa-demo-school',organization_type:'school'},
  staff:STAFF.map(([id,email])=>({id,email,is_demo:1,sso_password_override:0,password_hash:'EXISTING-PASSWORD-HASH',status:id===1454?'INACTIVE_EMPLOYEE':'ACTIVE_EMPLOYEE'})),
  staffMemberships:STAFF.map(([user_id])=>({user_id,agency_id:450,is_active:1})),
  guardian:{id:1437,email:'testing@itsco.health',personal_email:'testing@itsco.health',first_name:'Jordan',last_name:'QA-SchoolEN-1025',role:'client_guardian',is_active:1,is_archived:0,is_demo:0,password_hash:'DO-NOT-CHANGE'},
  guardianMemberships:[{user_id:1437,agency_id:450,is_active:1}],
  averyAssignments:['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day_of_week,i)=>({id:731+i,day_of_week,start_time:'09:00:00',end_time:'13:00:00',slots_total:4,is_active:1})),
  providers:[],providerMemberships:[],schoolAssignments:[],clients:[],guardianLinks:[],clientMemberships:[],clientOrganizations:[],clientAssignments:[],plans:[],
  counts:{clients:21,providers:3},extraProviderIds:[],
  nextUserId:1500,nextClientId:2300,nextAssignmentId:800,...overrides};
 let snapshot;const calls=[];
 const db={
  beginTransaction:async()=>{calls.push(['BEGIN']);snapshot=structuredClone(state);},
  commit:async()=>{calls.push(['COMMIT']);snapshot=null;},
  rollback:async()=>{calls.push(['ROLLBACK']);if(snapshot)state=snapshot;snapshot=null;},
  execute:async(sql,args=[])=>{
   calls.push([sql,structuredClone(args)]);
   assert.equal((sql.match(/\?/g)||[]).length,args.length,'Every SQL placeholder must be bound');
   if(overrides.failOn && sql.startsWith(overrides.failOn))throw Error('Injected database failure');
   if(sql.includes('FROM agencies WHERE id=450'))return [[state.agency].filter(Boolean)];
   if(sql.includes('FROM agencies s'))return [[state.school].filter(Boolean)];
   if(sql.includes('FROM users WHERE id IN'))return [state.staff];
   if(sql.includes('FROM user_agencies WHERE user_id IN'))return [state.staffMemberships];
   if(sql.includes('FROM users WHERE id=1437'))return [[state.guardian].filter(Boolean)];
   if(sql.includes('FROM user_agencies WHERE user_id=1437'))return [state.guardianMemberships];
   if(sql.includes('FROM provider_school_assignments WHERE provider_user_id=1433'))return [state.averyAssignments];
   if(sql.includes('WHERE LOWER(email)'))return [structuredClone(state.providers)];
   if(sql.includes('FROM user_agencies WHERE user_id=?'))return [state.providerMemberships.filter(m=>m.user_id===args[0])];
   if(sql.includes('SELECT DISTINCT u.id FROM users u'))return [[...new Set([1433,1438,1439,...state.providers.map(p=>p.id),...state.extraProviderIds])].map(id=>({id}))];
   if(sql.includes('FROM clients WHERE identifier_code IN'))return [structuredClone(state.clients)];
   if(sql.includes(' AS clients,'))return [[structuredClone(state.counts)]];
   if(sql.startsWith('INSERT INTO users')){const id=state.nextUserId++;state.providers.push({...fullProvider(id),password_hash:args[4]});state.counts.providers++;return[{insertId:id}];}
   if(sql.startsWith('INSERT INTO user_agencies')){const school=sql.includes('?,451,1,0');state.providerMemberships.push({user_id:args[0],agency_id:school?451:450,is_active:1,is_default:school?0:1});return[{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO user_preferences'))return[{affectedRows:1}];
   if(sql.includes('FROM provider_school_assignments WHERE provider_user_id=?'))return[state.schoolAssignments.filter(a=>a.provider_user_id===args[0])];
   if(sql.startsWith('INSERT INTO provider_school_assignments')){const id=state.nextAssignmentId++;state.schoolAssignments.push({id,provider_user_id:args[0],school_organization_id:451,day_of_week:'Tuesday',start_time:'09:00:00',end_time:'13:00:00',slots_total:1,is_active:1});return[{insertId:id}];}
   if(sql.startsWith('INSERT INTO clients')){const id=state.nextClientId++;assert.match(sql,/'PENDING_REVIEW',UTC_DATE\(\),'NONE'/);assert.match(sql,/1,NULL,NULL,NULL,1,0,0,0/);state.clients.push({id,agency_id:450,organization_id:451,initials:args[0],identifier_code:args[1],full_name:args[2],date_of_birth:args[3],status:'PENDING_REVIEW',client_status_id:null,paperwork_status_id:null,insurance_type_id:null,document_status:'NONE',cleared_to_start:0,is_demo:1,client_type:'school',provider_id:null});state.counts.clients++;return[{insertId:id}];}
   if(sql.startsWith('INSERT INTO client_agency_assignments')){state.clientMemberships.push({client_id:args[0],agency_id:450,is_active:1});return[{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO client_organization_assignments')){state.clientOrganizations.push({client_id:args[0],organization_id:451,is_active:1});return[{affectedRows:1}];}
   if(sql.startsWith('INSERT INTO client_guardians')){state.guardianLinks.push({client_id:args[0],guardian_user_id:1437,relationship_type:'guardian',access_enabled:1,permissions_json:JSON.parse(args[1])});return[{affectedRows:1}];}
   if(sql.includes('FROM client_guardians WHERE client_id=?'))return[state.guardianLinks.filter(r=>r.client_id===args[0])];
   if(sql.includes('FROM client_agency_assignments WHERE client_id=?'))return[state.clientMemberships.filter(r=>r.client_id===args[0])];
   if(sql.includes('FROM client_organization_assignments WHERE client_id=?'))return[state.clientOrganizations.filter(r=>r.client_id===args[0])];
   if(sql.includes('FROM client_provider_assignments WHERE client_id=?'))return[state.clientAssignments.filter(r=>r.client_id===args[0])];
   if(sql.startsWith('UPDATE users SET sso_password_override')){const user=state.staff.find(u=>u.id===args[0]&&u.email===args[1]&&u.is_demo===1);if(user)user.sso_password_override=1;return[{affectedRows:user?1:0}];}
   if(sql.startsWith('UPDATE agencies SET feature_flags')){state.agency.feature_flags=JSON.parse(args[0]);return[{affectedRows:1}];}
   if(sql.includes('FROM school_provider_contact_plans'))return[state.plans];
   throw Error('Unexpected SQL: '+sql);
  }
 };
 return{db,calls,state:()=>state};
}
const writes=f=>f.calls.filter(([sql])=>/^(?:INSERT|UPDATE|DELETE|REPLACE)/.test(sql));
test('creates isolated unassigned school fixtures and real Google QA provider without outreach, privileges, or password resets',async()=>{
 const f=fixture(),before=structuredClone(f.state());const result=await provision(f.db,{passwordHash});
 assert.equal(result.applied,true);assert.deepEqual(result.counts,{clients:23,providers:4});
 assert.equal(result.ssoProviderUserId,1500);assert.equal(result.averySchoolAssigned,true);assert.equal(result.averyPlanStatus,'unconfigured');assert.equal(result.ssoPlanStatus,'unconfigured');
 assert.deepEqual(result.clients.map(c=>[c.marker,c.unassigned]),CONTACT_FIXTURES.map(c=>[c.marker,true]));
 assert.deepEqual(f.state().guardian,before.guardian);assert.deepEqual(f.state().averyAssignments,before.averyAssignments);
 assert.ok(f.state().staff.every(s=>s.password_hash==='EXISTING-PASSWORD-HASH'&&s.sso_password_override===1));
 assert.equal(f.state().staff.find(s=>s.id===1454).status,'INACTIVE_EMPLOYEE');
 assert.equal(f.state().agency.feature_flags.keep,'unchanged');assert.deepEqual(f.state().agency.feature_flags.googleSsoRequiredRoles,['provider']);assert.equal(f.state().agency.feature_flags.googleSsoEnabled,true);
 assert.deepEqual(f.state().agency.feature_flags.googleSsoAllowedDomains,['itsco.health']);assert.equal(f.state().providers[0].is_demo,0);
 assert.deepEqual(f.state().providerMemberships,[{user_id:1500,agency_id:450,is_active:1,is_default:1},{user_id:1500,agency_id:451,is_active:1,is_default:0}]);
 assert.ok(f.state().clients.every(c=>c.provider_id===null&&c.is_demo===1));assert.equal(f.state().clientAssignments.length,0);
 assert.ok(f.state().clients.every(c=>c.status==='PENDING_REVIEW'&&c.document_status==='NONE'&&c.cleared_to_start===0&&c.client_status_id===null&&c.paperwork_status_id===null&&c.insurance_type_id===null));
 assert.ok(f.state().guardianLinks.every(c=>c.permissions_json.canMessage&&!c.permissions_json.canSignDocs&&!c.permissions_json.canViewDocs));
 const statements=writes(f).map(([sql])=>sql).join('\n');assert.doesNotMatch(statements,/DELETE|clinical_grants|clinical_notes|communication_messages|school_contact_workflows|school_provider_contact_plans|sms_sender|sms_recipient|supervisor_assignments/i);
 assert.ok(!f.calls.some(([sql])=>sql.startsWith('UPDATE users')&&!sql.startsWith('UPDATE users SET sso_password_override=1')));
 assert.ok(f.calls.some(([sql])=>sql==='COMMIT'));assert.doesNotMatch(JSON.stringify(result),/\$2b\$|EXISTING-PASSWORD-HASH|DO-NOT-CHANGE/);
});
test('repeat application preserves identities, hashes, plan decisions, and existing records without more writes',async()=>{
 const f=fixture();const first=await provision(f.db,{passwordHash});const hash=f.state().providers[0].password_hash;
 f.state().plans=[{provider_user_id:1433,status:'declined'},{provider_user_id:first.ssoProviderUserId,status:'enabled'}];
 const priorWrites=writes(f).length;const second=await provision(f.db,{passwordHash:'$2b$12$'+'B'.repeat(53)});
 assert.deepEqual(second.clients,first.clients);assert.deepEqual(second.counts,first.counts);assert.equal(second.averyPlanStatus,'declined');assert.equal(second.ssoPlanStatus,'enabled');assert.equal(f.state().providers[0].password_hash,hash);assert.equal(writes(f).length,priorWrites);
});
test('retains a fixture that testers subsequently assigned and never unassigns it to reset a test',async()=>{
 const f=fixture();await provision(f.db,{passwordHash});f.state().clients[0].provider_id=1433;f.state().clientAssignments.push({id:1,client_id:f.state().clients[0].id});
 const previous=writes(f).length;const result=await provision(f.db,{passwordHash});assert.equal(result.clients[0].unassigned,false);assert.equal(writes(f).length,previous);assert.equal(f.state().clients[0].provider_id,1433);
});
for(const change of [
 {agency:{id:2,slug:'itsco',is_active:1,feature_flags:{qaSandbox:{syntheticOnly:true}}}},
 {agency:{id:450,slug:'auricwell-qa-demo',is_active:1,feature_flags:{qaSandbox:{syntheticOnly:false}}}},
 {school:null},{guardian:{id:1437,email:'real-parent@example.test'}}
])test('rejects changed agency, school, or retained guardian before any write: '+JSON.stringify(change),async()=>{
 const f=fixture(change);await assert.rejects(provision(f.db,{passwordHash}));assert.equal(writes(f).length,0);assert.ok(f.calls.some(([sql])=>sql==='ROLLBACK'));
});
test('requires the exact QA staff emails, demo flags, and demo organization membership',async()=>{
 for(const change of ['email','demo','membership']){const f=fixture();if(change==='email')f.state().staff[0].email='real@example.test';if(change==='demo')f.state().staff[0].is_demo=0;if(change==='membership')f.state().staffMemberships.push({user_id:1433,agency_id:2,is_active:1});await assert.rejects(provision(f.db,{passwordHash}));assert.equal(writes(f).length,0);}
});
test('rejects another guardian agency and changed Avery assignment while preserving the original records',async()=>{
 for(const change of ['guardian','avery']){const f=fixture();if(change==='guardian')f.state().guardianMemberships.push({user_id:1437,agency_id:2,is_active:1});else f.state().averyAssignments[0].slots_total=9;await assert.rejects(provision(f.db,{passwordHash}));assert.equal(writes(f).length,0);}
});
test('rejects global SSO identity collisions, other-tenant ownership, existing licenses or elevated privileges',async()=>{
 for(const change of ['different','foreign','license','admin','override','demo','default','schoolDefault']){
  const p=fullProvider(1500);const f=fixture({providers:[p],providerMemberships:[{user_id:1500,agency_id:450,is_active:1,is_default:1}]});
  if(change==='different')p.first_name='Someone';if(change==='foreign')f.state().providerMemberships.push({user_id:1500,agency_id:2,is_active:1});if(change==='license')p.credential='LPC';if(change==='admin')p.role='admin';if(change==='override')p.sso_password_override=1;if(change==='demo')p.is_demo=1;if(change==='default')f.state().providerMemberships[0].is_default=0;if(change==='schoolDefault')f.state().providerMemberships.push({user_id:1500,agency_id:451,is_active:1,is_default:1});
  await assert.rejects(provision(f.db,{passwordHash}));assert.equal(writes(f).length,0);
 }
});
test('rejects unexpected active providers before enabling a provider SSO requirement',async()=>{
 const f=fixture({extraProviderIds:[1600]});await assert.rejects(provision(f.db,{passwordHash}),/roster/);assert.equal(writes(f).length,0);
});
test('adds only the affiliated school membership to an existing prepared Google fixture',async()=>{
 const f=fixture({providers:[fullProvider(1500)],providerMemberships:[{user_id:1500,agency_id:450,is_active:1,is_default:1}],counts:{clients:21,providers:4}});
 const result=await provision(f.db);assert.equal(result.ssoProviderUserId,1500);assert.equal(f.state().providerMemberships.length,2);assert.equal(f.state().providers[0].password_hash,passwordHash);
 assert.ok(!f.calls.some(([sql])=>sql.startsWith('INSERT INTO users')));assert.ok(f.state().providerMemberships.some(m=>m.agency_id===451&&m.is_default===0&&m.is_active===1));
});
test('preserves compatible Google allowed-domain restrictions',async()=>{
 const f=fixture();f.state().agency.feature_flags.googleSsoAllowedDomains=['itsco.health','other.example'];await provision(f.db,{passwordHash});assert.deepEqual(f.state().agency.feature_flags.googleSsoAllowedDomains,['itsco.health','other.example']);
});
test('enforces client and provider caps before creating accounts or links',async()=>{
 for(const counts of [{clients:29,providers:3},{clients:21,providers:10}]){const f=fixture({counts});await assert.rejects(provision(f.db,{passwordHash}),/cap/);assert.equal(writes(f).length,0);}
});
test('does not replace existing Google domain restrictions or create an account with a weak/absent hash',async()=>{
 const f=fixture();f.state().agency.feature_flags.googleSsoAllowedDomains=['other.example'];await assert.rejects(provision(f.db,{passwordHash}),/domain/);assert.equal(writes(f).length,0);
 for(const hash of [undefined,'plaintext','unusable']){const f=fixture();await assert.rejects(provision(f.db,{passwordHash:hash}),/bcrypt/);assert.equal(writes(f).length,0);}
});
test('rolls back the new user, membership and clients together if any later operation fails',async()=>{
 const f=fixture({failOn:'INSERT INTO client_guardians'}),before=structuredClone(f.state());await assert.rejects(provision(f.db,{passwordHash}),/Injected/);assert.deepEqual(f.state(),before);assert.ok(f.calls.some(([sql])=>sql==='ROLLBACK'));assert.ok(!f.calls.some(([sql])=>sql==='COMMIT'));
});
test('refuses changed retained fixture guardian links rather than granting replacement access',async()=>{
 const f=fixture();await provision(f.db,{passwordHash});f.state().guardianLinks[0].guardian_user_id=999;
 const before=structuredClone(f.state());await assert.rejects(provision(f.db,{passwordHash}),/guardian link/);assert.deepEqual(f.state(),before);
});
test('refuses a client marker collision outside the demo without reading or copying another client',async()=>{
 const f=fixture({clients:[{id:1,identifier_code:CONTACT_FIXTURES[0].marker,agency_id:2,organization_id:451,is_demo:1,client_type:'school',status:'ACTIVE'}]});await assert.rejects(provision(f.db,{passwordHash}),/marker/);assert.equal(writes(f).length,0);
 const clean=fixture();await provision(clean.db,{passwordHash});assert.ok(!clean.calls.some(([sql])=>sql.includes('2267')));
});
test('the plan advertises exact population and no-outreach boundaries',()=>{
 assert.equal(provisionPlan.agencyId,450);assert.equal(provisionPlan.enablesContactPlans,false);assert.equal(provisionPlan.enablesSms,false);assert.equal(provisionPlan.sendsMessages,false);assert.equal(provisionPlan.createsGoogleAccounts,false);
});
