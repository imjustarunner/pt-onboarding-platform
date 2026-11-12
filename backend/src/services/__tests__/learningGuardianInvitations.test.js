import crypto from 'node:crypto';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),connection:vi.fn(),send:vi.fn(),agency:vi.fn(),setup:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:m.send}));
vi.mock('../coGuardianInvite.service.js',()=>({emailPortalLoginInfo:m.setup}));
import {requireLearningGuardianInvitationAuthority,listLearningGuardianInvitations,createLearningGuardianInvitation,acceptLearningGuardianInvitation} from '../learningGuardianInvitations.service.js';

const scope={userId:1759,clientId:2545,agencyId:453};
const input={firstName:'Rene',lastName:'QA NLU',email:'qa.nlu.coparent@example.com',authorityConfirmed:true,requestKey:'stable_qa_request_0001'};
const token='synthetic_token_not_an_actual_bearer';
let context,target,targetLink,duplicate,current,guardians,pending,invites,membership,dispatchRecipient,aliases;
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T22:00:00Z'));
 context={id:2545,agency_id:453,client_type:'learning',date_of_birth:'2016-04-12',guardian_portal_enabled:1,status:'PACKET',
  access_enabled:1,permissions_json:{},relationship_type:'guardian',role:'client_guardian',guardian_active:1,guardian_archived:0,guardian_email:'qa.nlu.parent@example.com',
  slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}},agency_active:1,agency_archived:0,tutoring_active:1,clinical_active:0,independent:0};
 target=null;targetLink=null;duplicate=null;guardians=[{guardian_user_id:1759}];pending=0;invites=[];membership=null;aliases=[];
 dispatchRecipient={access_enabled:1,permissions_json:{learningOnly:true},email:input.email,role:'client_guardian',is_active:1,is_archived:0};
 current={id:50,agency_id:453,invited_by_user_id:1759,invited_email:input.email,invited_first_name:'Rene',invited_last_name:'QA NLU',source:'learning_portal',status:'pending',expires_at:'2026-12-01T00:00:00Z',token_hash:crypto.createHash('sha256').update(token).digest('hex')};
 const db={execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release};m.connection.mockResolvedValue(db);
 m.agency.mockResolvedValue({id:453,slug:'nlu-qa-demo',name:'Next Level Up QA',app_domain:'app.nextleveluplcc.com'});
 m.send.mockResolvedValue({id:100,sent:true,communicationId:100});m.setup.mockResolvedValue({id:101,redirected:true,sent:false});
 m.execute.mockImplementation(async(sql,params)=>{
  if(sql.includes('FROM clients c JOIN client_guardians'))return [[context].filter(Boolean)];
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SELECT id FROM clients'))return [[{id:2545}]];
  if(sql.includes('SELECT i.*,d.delivery_status'))return [sql.includes('LOWER(i.invited_email)')?[duplicate].filter(Boolean):invites];
  if(sql.includes('FROM users WHERE LOWER(email)'))return [[target].filter(Boolean)];
  if(sql.startsWith('SELECT user_id FROM user_login_emails'))return [aliases];
  if(sql.startsWith('SELECT access_enabled,permissions_json FROM client_guardians'))return [[targetLink].filter(Boolean)];
  if(sql.startsWith('SELECT cg.access_enabled,cg.permissions_json,u.email'))return [[dispatchRecipient].filter(Boolean)];
  if(sql.startsWith('SELECT guardian_user_id FROM client_guardians'))return [guardians];
  if(sql.includes('COUNT(DISTINCT i.invited_email)'))return [[{total:pending}]];
  if(sql.startsWith('INSERT INTO co_guardian_invites'))return [{insertId:50}];
  if(sql.startsWith('INSERT INTO co_guardian_invite_deliveries'))return [{insertId:60}];
  if(sql.startsWith('SELECT * FROM co_guardian_invites WHERE id='))return [[current].filter(Boolean)];
  if(sql.startsWith('SELECT client_id FROM co_guardian_invite_clients'))return [[{client_id:2545}]];
  if(sql.startsWith('SELECT agency_id FROM user_agencies'))return [[{agency_id:453}]];
  if(sql.startsWith('SELECT is_active FROM user_agencies'))return [[membership].filter(Boolean)];
  if(sql.startsWith('INSERT INTO users'))return [{insertId:1800}];
  if(sql.startsWith("UPDATE co_guardian_invites SET status='accepted'")){current={...current,status:'accepted',accepted_user_id:params[0],response_json:params[1]};targetLink={access_enabled:1,permissions_json:{learningOnly:true}};return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE co_guardian_invites SET response_json')){current.response_json=params[0];return [{affectedRows:1}];}
  if(/^(INSERT|UPDATE)/.test(sql))return [{affectedRows:1}];
  throw Error(`Unexpected query: ${sql}`);
 });
});
afterEach(()=>vi.useRealTimers());
const create=patch=>createLearningGuardianInvitation({...scope,input:{...input,...patch}});
const accept=patch=>acceptLearningGuardianInvitation({row:{...current},contact:{email:input.email,...patch},token});
const mutations=()=>m.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql));

describe('learning guardian invitations require the exact current learning relationship',()=>{
 it('allows the existing authorized minor learning relationship and lists only its own issued invitations',async()=>{
  invites=[{...current,delivery_status:'sent'}];const result=await listLearningGuardianInvitations(scope);
  expect(result).toMatchObject({canInvite:true,clientId:2545,invitations:[{id:50,email:input.email,deliveryStatus:'sent'}]});
  expect(JSON.stringify(result)).not.toContain('token_hash');expect(mutations()).toEqual([]);
 });
 it.each(['unlinked','revoked','restricted','proxy','inactive guardian','archived agency','wrong tenant','missing tutoring','dual service','clinical child','adult','independent','new invitee','invalid permissions'])('denies %s before creating or mailing anything',async reason=>{
  if(reason==='unlinked')context=null;
  else if(reason==='revoked')context.access_enabled=0;
  else if(reason==='restricted')context.permissions_json={noView:true};
  else if(reason==='proxy')context.relationship_type='proxy';
  else if(reason==='inactive guardian')context.guardian_active=0;
  else if(reason==='archived agency')context.agency_archived=1;
  else if(reason==='wrong tenant')context.slug='unrelated';
  else if(reason==='missing tutoring')context.tutoring_active=0;
  else if(reason==='dual service')context.clinical_active=1;
  else if(reason==='clinical child')context.client_type='clinical';
  else if(reason==='adult')context.date_of_birth='2000-01-01';
  else if(reason==='independent')context.independent=1;
  else if(reason==='new invitee')context.permissions_json={canInviteGuardians:false};
  else context.permissions_json='invalid JSON';
  await expect(create()).rejects.toMatchObject({status:403});expect(m.send).not.toHaveBeenCalled();expect(mutations()).toEqual([]);
 });
 it('requires explicit unchecked authority and a stable generated request key',async()=>{
  await expect(create({authorityConfirmed:false})).rejects.toMatchObject({status:400});
  await expect(create({requestKey:''})).rejects.toMatchObject({status:400});expect(m.connection).not.toHaveBeenCalled();
 });
 it('validates exact numeric child and agency scope before looking up another record',async()=>{
  await expect(requireLearningGuardianInvitationAuthority({...scope,clientId:-1})).rejects.toMatchObject({status:400});expect(m.execute).not.toHaveBeenCalled();
 });
});
describe('one intended invitation never provisions an account or repeats mail',()=>{
 it('records one pending invitation, uses the NLU path and returns no bearer token or credentials',async()=>{
  const result=await create();expect(result).toMatchObject({reused:false,emailSent:true,deliveryStatus:'sent',invitation:{id:50,status:'pending'}});
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({enrollmentChannel:'tutoring',to:input.email,linkUrl:expect.stringContaining('/join/nlu-qa-demo/tutoring/co-guardian/')}));
  expect(mutations().some(([sql])=>/INSERT INTO (users|client_guardians|user_agencies)/.test(sql))).toBe(false);
  expect(JSON.stringify(result)).not.toContain('token');expect(JSON.stringify(result)).not.toContain('password');
  expect(m.release).toHaveBeenCalledOnce();
 });
 it.each(['sent','sending','failed','pending'])('returns a saved %s attempt on retry without another send or token rotation',async state=>{
  duplicate={...current,delivery_status:state};const result=await create();expect(result.reused).toBe(true);expect(result.deliveryStatus).toBe(state);
  expect(m.send).not.toHaveBeenCalled();expect(mutations()).toEqual([]);
 });
 it('rejects reuse of one request key for a different recipient',async()=>{
  duplicate={...current,invited_email:'another@example.com'};await expect(create()).rejects.toMatchObject({status:409});expect(m.send).not.toHaveBeenCalled();
 });
 it.each(['staff address','secondary alias','disabled recipient','existing revoked link','foreign QA membership','shared inbox'])('rejects %s rather than taking over an account or reviving access',async reason=>{
  target={id:1900,email:input.email,role:'client_guardian',is_active:1,is_archived:0};
  if(reason==='staff address')target.role='staff';
  if(reason==='secondary alias')target.email='original@example.com';
  if(reason==='disabled recipient')target.is_active=0;
  if(reason==='existing revoked link')targetLink={access_enabled:0,permissions_json:{}};
  if(reason==='shared inbox')target=null;
  if(reason==='foreign QA membership'){const old=m.execute.getMockImplementation();m.execute.mockImplementation((sql,p)=>sql.startsWith('SELECT agency_id FROM user_agencies')?Promise.resolve([[{agency_id:6}]]):old(sql,p));}
  const call=reason==='shared inbox'?create({email:'testing@itsco.health'}):create();
  await expect(call).rejects.toMatchObject({status:reason==='shared inbox'?400:409});expect(mutations()).toEqual([]);expect(m.send).not.toHaveBeenCalled();
 });
 it('reserves the remaining guardian place and checks current locked guardian rows',async()=>{
  pending=1;await expect(create()).rejects.toMatchObject({status:409});
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("COALESCE(relationship_type,'guardian')<>'self' FOR UPDATE"),[2545]);expect(m.send).not.toHaveBeenCalled();
 });
 it('does not shadow another account’s separately registered login alias at invitation or acceptance',async()=>{
  aliases=[{user_id:1496}];await expect(create()).rejects.toMatchObject({status:409});await expect(accept()).rejects.toMatchObject({status:409});
  expect(mutations()).toEqual([]);expect(m.send).not.toHaveBeenCalled();expect(m.setup).not.toHaveBeenCalled();
 });
 it('shows a failed transport truthfully and never calls it an inbox receipt',async()=>{
  m.send.mockRejectedValueOnce(new Error('transport unavailable'));const result=await create();expect(result).toMatchObject({emailSent:false,deliveryStatus:'failed'});
 });
 it('stops disclosure if the authorizing guardian loses access before dispatch',async()=>{
  m.commit.mockImplementationOnce(async()=>{context.access_enabled=0;});const result=await create();expect(result.deliveryStatus).toBe('failed');expect(m.send).not.toHaveBeenCalled();
 });
});
describe('delivered token acceptance creates only the intended limited learning link',()=>{
 it('creates a new pending guardian only on acceptance and sends one normal setup email',async()=>{
  const result=await accept({firstName:'Changed input is not a stored identity override'});
  expect(result).toMatchObject({accepted:true,created:true,source:'learning_portal',portalAccess:{email:input.email,existingAccount:false,setupEmailSent:true,deliveryStatus:'sent'}});
  const link=mutations().find(([sql])=>sql.startsWith('INSERT INTO client_guardians'));
  expect(JSON.parse(link[1][2])).toMatchObject({learningOnly:true,serviceAgencyIds:[453],serviceKinds:['tutoring'],canMessage:true,canViewDocs:false,canSignDocs:false,canViewProgress:false,canInviteGuardians:false});
  expect(mutations().some(([sql])=>sql.includes('guardian_clinical_grants')||sql.includes('guardian_portal_policies'))).toBe(false);
  expect(m.setup).toHaveBeenCalledOnce();expect(JSON.stringify(result)).not.toContain('password');
 });
 it('links an existing verified guardian without changing names, credentials or sending a reset',async()=>{
  target={id:1900,email:input.email,role:'client_guardian',is_active:1,is_archived:0,password_hash:'existing-hash'};membership={is_active:1};
  const result=await accept({firstName:'Replacement',lastName:'Wrong',phone:'not authorized'});
  expect(result).toMatchObject({created:false,portalAccess:{existingAccount:true,deliveryStatus:'not_requested'}});
  expect(mutations().some(([sql])=>sql.startsWith('UPDATE users')||sql.startsWith('INSERT INTO users'))).toBe(false);expect(m.setup).not.toHaveBeenCalled();
 });
 it('a refresh of an accepted invitation neither recreates access nor resends setup',async()=>{
  await accept();m.execute.mockClear();await accept();expect(m.setup).toHaveBeenCalledOnce();expect(mutations()).toEqual([]);
 });
 it.each(['wrong email','foreign token','revoked invitation','expired token','revoked inviter','disabled membership','full guardian places'])('blocks %s before account or link mutations',async reason=>{
  let patch={};
  if(reason==='wrong email')patch={email:'wrong@example.com'};
  if(reason==='foreign token')current.token_hash='unrelated';
  if(reason==='revoked invitation')current.status='revoked';
  if(reason==='expired token')current.expires_at='2026-11-01T00:00:00Z';
  if(reason==='revoked inviter')context.access_enabled=0;
  if(reason==='disabled membership'){target={id:1900,email:input.email,role:'client_guardian',is_active:1,is_archived:0,password_hash:'existing'};membership={is_active:0};}
  if(reason==='full guardian places')guardians=[{guardian_user_id:1},{guardian_user_id:2}];
  await expect(accept(patch)).rejects.toBeTruthy();expect(mutations()).toEqual([]);expect(m.setup).not.toHaveBeenCalled();
 });
 it('never restores a link revoked after acceptance',async()=>{
  current.status='accepted';current.accepted_user_id=1900;targetLink={access_enabled:0,permissions_json:{}};
  await expect(accept()).rejects.toMatchObject({status:403});expect(mutations()).toEqual([]);expect(m.setup).not.toHaveBeenCalled();
 });
 it.each(['disabled account','restricted link','changed primary address','missing membership'])('suppresses setup mail after %s changes before dispatch',async reason=>{
  m.commit.mockImplementationOnce(async()=>{
   if(reason==='disabled account')dispatchRecipient.is_active=0;
   if(reason==='restricted link')dispatchRecipient.permissions_json={noView:true};
   if(reason==='changed primary address')dispatchRecipient.email='replacement@example.com';
   if(reason==='missing membership')dispatchRecipient=null;
  });
  const result=await accept();expect(result).toMatchObject({accepted:true,portalAccess:{setupEmailSent:false,deliveryStatus:'failed'}});expect(m.setup).not.toHaveBeenCalled();
 });
});
