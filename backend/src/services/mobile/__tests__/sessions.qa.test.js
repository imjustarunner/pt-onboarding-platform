import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../quickViewAuth.service.js',()=>({startAuthenticatedMobileSession:vi.fn()}));
vi.mock('../../hireStaffAccess.service.js',()=>({assertHireStaffAccess:vi.fn()}));
vi.mock('../../productIdentity.service.js',()=>({assertFullSuiteIdentity:vi.fn()}));
vi.mock('../../clientSecureConversation.service.js',()=>({refreshClientSecureAccess:vi.fn()}));
vi.mock('../../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn()}));
import {createMobileSessionService} from '../session.service.js';
import {createMobilePushWorker} from '../push.service.js';
import {accountFingerprint} from '../policy.js';
const user={id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE'};
const qa={id:450,name:'Synthetic QA',slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
let deps,service;
beforeEach(()=>{deps={db:{execute:vi.fn().mockResolvedValue([[qa,{id:456,name:'Other QA',slug:'scb-qa-company'}]])},findUser:vi.fn().mockResolvedValue(user),assertStaff:vi.fn(),assertProduct:vi.fn()};service=createMobileSessionService(deps);});
it('primary account setup and profile expose only the currently granted synthetic workspace',async()=>{const actor=await service.actor(user.id);expect(actor.qaAgencyIds).toEqual([450]);expect(service.publicProfile(actor).agencies.map(a=>a.id)).toEqual([450]);await expect(service.actor(user.id,456)).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});});
it('rechecks the grant on each device access and revokes the durable and short sessions when the grant disappears',async()=>{
 let allowed=true;const device={id:2,user_id:1433,agency_id:450,last_used_at:new Date(),enrolled_at:new Date(),account_fingerprint:accountFingerprint(user)};
 deps.db.execute.mockImplementation(async sql=>sql.startsWith('SELECT * FROM mobile_device_sessions')?[[device]]:sql.includes('FROM user_agencies')?[[{...qa,feature_flags:allowed?qa.feature_flags:{}}]]:[{affectedRows:1}]);
 expect((await service.access(2,1433,450)).qaAgencyIds).toEqual([450]);allowed=false;
 await expect(service.access(2,1433,450)).rejects.toMatchObject({code:'MOBILE_ACCOUNT_UNAVAILABLE'});
 expect(deps.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE mobile_device_sessions SET revoked_at'))).toBe(true);
 expect(deps.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE quick_view_sessions SET revoked_at'))).toBe(true);
});
it('does not enable unapproved demo accounts or disable normal staff multi-agency access',async()=>{deps.findUser.mockResolvedValue({...user,email:'another@example.com'});await expect(service.actor(user.id)).rejects.toMatchObject({code:'MOBILE_ACCOUNT_UNAVAILABLE'});deps.findUser.mockResolvedValue({...user,is_demo:0});expect((await service.actor(user.id)).agencies.map(a=>a.id)).toEqual([450,456]);});
it('blocks all out-of-scope push sources and notification targets before content access',async()=>{
 const db={execute:vi.fn()},sessions={access:vi.fn().mockResolvedValue({qaAgencyIds:[450]})},conversationAccess=vi.fn(),refreshSecure=vi.fn();
 const worker=createMobilePushWorker({db,sessions,conversationAccess,refreshSecure}),device={id:2,user_id:1433,agency_id:450};
 for(const kind of ['chat','email','sms']){db.execute.mockResolvedValue([[{agency_id:456,thread_id:8,conversation_id:8,id:8}]]);expect(await worker.permitted(device,kind,8)).toBeNull();}
 expect(conversationAccess).not.toHaveBeenCalled();expect(refreshSecure).not.toHaveBeenCalled();
 db.execute.mockResolvedValue([[{agency_id:450,thread_id:9}]]);expect(await worker.permitted(device,'chat',9)).toBe(9);expect(refreshSecure).toHaveBeenCalledWith(9,1433);
 sessions.access.mockRejectedValue({status:403});await expect(worker.permitted(device,'chat',9)).rejects.toMatchObject({status:403});
});

it('suppresses restored email pushes and respects a muted school packet alert without removing the message',async()=>{
 const sessions={access:vi.fn().mockResolvedValue({qaAgencyIds:[450]})},conversationAccess=vi.fn();
 const device={id:2,user_id:1433,agency_id:450};
 for(const kind of ['restored','muted']){
  const db={execute:vi.fn().mockImplementation(async sql=>sql.includes('user_notification_type_preferences')?[[{in_app_enabled:0,push_enabled:null}]]:[[{agency_id:450,conversation_id:5,subject:'Example - Digital Enrollment Packet',suppress_push:kind==='restored'?1:0}]])};
  const worker=createMobilePushWorker({db,sessions,conversationAccess});
  expect(await worker.permitted(device,'email',9)).toBeNull();
 }
 expect(conversationAccess).not.toHaveBeenCalled();
});
