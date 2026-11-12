import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),services:vi.fn(),membership:vi.fn(),clinical:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>{}}));
vi.mock('../clientServiceEnrollment.service.js',()=>({clientAgencyMembership:m.membership,listClientServices:m.services}));
vi.mock('../guardianClinicalAccess.service.js',()=>({clinicalAccess:m.clinical}));
import {createFamilySharedConversations} from '../familySharedConversations.service.js';
import {clientSecureAudience} from '../clientSecureConversation.service.js';
let db,client,provider,ordinary,limited,service,shared;
beforeEach(()=>{
 vi.clearAllMocks();
 client={id:2545,agency_id:453,provider_id:1496,client_type:'learning',guardian_portal_enabled:1};
 provider={id:1496,role:'provider',is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE',first_name:'Finley'};
 ordinary={id:1759,guardian_user_id:1759,role:'client_guardian',relationship_type:'guardian',is_active:1,is_archived:0,status:'ACTIVE',permissions_json:{},first_name:'Morgan'};
 limited={id:1900,guardian_user_id:1900,role:'client_guardian',relationship_type:'guardian',is_active:1,is_archived:0,status:'ACTIVE',permissions_json:{learningOnly:true,serviceKinds:['tutoring'],serviceAgencyIds:[453],canMessage:true},first_name:'Rene'};
 service={id:1038,agency_id:453,service_kind:'tutoring',provider_user_id:1496,is_active:1};
 m.services.mockImplementation(async()=>[{...service}]);m.membership.mockResolvedValue(true);m.clinical.mockResolvedValue({scopes:['clinical_messages']});
 db={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};db.getConnection=vi.fn(async()=>db);
 m.execute.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT c.id,c.agency_id,c.provider_id'))return [[{...client}]];
  if(sql.startsWith('SELECT id, agency_id, organization_id'))return [[{...client}]];
  if(sql.startsWith('SELECT id FROM clients'))return [[{id:client.id}]];
  if(sql.includes('FROM users u JOIN user_agencies')||sql.includes('SELECT DISTINCT u.id, u.first_name'))return [[provider]];
  if(sql.includes('FROM client_guardians cg JOIN users u'))return [[ordinary,limited]];
  if(sql.startsWith('SELECT * FROM family_shared_conversations'))return [[{thread_id:900,client_id:2545,agency_id:service.agency_id,service_id:service.id,provider_user_id:1496,clinical_required:service.service_kind==='counseling'?1:0,audience_json:[1496,1759,1900]}]];
  if(sql.startsWith('SELECT user_id FROM chat_thread_participants'))return [[{user_id:1900}]];
  throw Error(`Unexpected query or mutation: ${sql}`);
 });
 shared=createFamilySharedConversations({db,contacts:vi.fn(async()=>[])});
});

describe('learning-only links retain their exact messaging service boundary',()=>{
 it('allows the explicitly bound tutoring conversation in its original agency',async()=>{
  const audience=await shared.currentAudience({clientId:2545,agencyId:453,serviceId:1038});expect(audience.audienceIds).toEqual([1496,1759,1900]);
  expect((await clientSecureAudience(2545,db,{agencyId:453,serviceId:1038})).userIds).toContain(1900);
 });
 it.each(['counseling added later','another agency tutoring','omitted service'])('withholds limited guardian from %s while preserving ordinary family access',async reason=>{
  if(reason==='counseling added later'){service.id=1039;service.service_kind='counseling';}
  if(reason==='another agency tutoring')service.agency_id=454;
  const serviceId=reason==='omitted service'?0:service.id;
  const audience=await shared.currentAudience({clientId:2545,agencyId:service.agency_id,serviceId});
  expect(audience.audienceIds).toEqual([1496,1759]);
  const legacy=await clientSecureAudience(2545,db,{agencyId:service.agency_id,serviceId});expect(legacy.userIds).not.toContain(1900);expect(legacy.userIds).toContain(1759);
 });
 it.each([false,true])('denies a retained shared thread membership when it is now clinical (send %s)',async forSend=>{
  service.service_kind='counseling';await expect(shared.requireAccess(1900,900,{forSend})).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
 it('cannot open an ambiguous legacy thread by omitting the tutoring service',async()=>{
  await expect(shared.open({userId:1900,clientId:2545,agencyId:453})).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
});
