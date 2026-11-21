import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),care:vi.fn(),eligible:vi.fn(),offered:vi.fn()}));
vi.mock('../hireGroupEmail.service.js',()=>({ensureHireGroupEmailForActivation:vi.fn(async()=>({emailSendingReady:true}))}));
vi.mock('../providerServiceOfferings.service.js',()=>({readProviderServices:m.offered}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>m}}));
vi.mock('../staffCareEligibility.service.js',()=>({staffCareEligibility:m.eligible,readStaffCareEligibility:m.care}));
import { evaluateClientSessionBooking, clientSessionBookingAccess, requireClientSessionBooking, saveClientSessionBookingRollout, sessionBookingProviders } from '../clientSessionBookingRollout.service.js';
const policy={revision:3,entries:[{providerUserId:12,enabled:true},{providerUserId:30,enabled:true}]};
const input={providerUserIds:[12],enabled:true,transitionReviewed:true,note:'Reviewed October cohort',revision:3};
beforeEach(()=>{vi.clearAllMocks();m.care.mockResolvedValue({canProvideCare:true});m.eligible.mockImplementation(row=>({canProvideCare:row.id!==99}));m.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,work_email') || sql.startsWith('SELECT work_email,login_is_group_email')?[[{id:12,work_email:'synthetic@itsco.health',personal_email:'personal@example.net',password_hash:'synthetic',sso_password_override:1,login_is_group_email:1}]]:sql.includes('FROM provider_account_conversions')?[[]]:sql.startsWith('SELECT id,slug')?[[{id:2,slug:'real',feature_flags:{}}]]:sql.startsWith('SELECT feature_flags')?[[{feature_flags:{clientSessionBookingRollout:policy,keep:true}}]]:sql.includes('FROM users u')?[[{id:12,first_name:'Legal',preferred_name:'Preferred',last_name:'Name'},{id:30,first_name:'Other'},{id:99,first_name:'Nonclient staff'}]]:[{affectedRows:1}]);});
describe('explicit provider session booking transition',()=>{
 it('defaults closed and requires an exact enabled provider entry',()=>{
  for(const providerId of [0,13,null])expect(evaluateClientSessionBooking(policy,providerId).enabled).toBe(false);
  expect(evaluateClientSessionBooking(null,12).enabled).toBe(false);
  expect(evaluateClientSessionBooking(policy,12).enabled).toBe(true);
  expect(evaluateClientSessionBooking({entries:[{providerUserId:12,enabled:'true'}]},12).enabled).toBe(false);
 });
 it('enforces a pause and rechecks active client-facing status',async()=>{
  await expect(requireClientSessionBooking(2,13)).rejects.toMatchObject({status:403,code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
  m.care.mockResolvedValue({canProvideCare:false,reason:'Sees clients is off'});
  await expect(requireClientSessionBooking(2,12)).rejects.toThrow('Sees clients is off');
 });
 it('fails closed when settings cannot be loaded',async()=>{
  m.execute.mockRejectedValue(new Error('Database unavailable'));
  await expect(requireClientSessionBooking(2,12)).rejects.toThrow('Database unavailable');
 });
 it('enables only the selected cohort and preserves other providers and feature flags',async()=>{
  const saved=await saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input});
  expect(saved.revision).toBe(4);expect(saved.entries).toHaveLength(2);
  expect(saved.entries.find(row=>row.providerUserId===30)).toEqual(policy.entries[1]);
  expect(saved.history[0]).toMatchObject({providerUserIds:[12],updatedByUserId:5,note:input.note,enabled:true});
  expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))[0]).toContain("JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.clientSessionBookingRollout'");
  expect(m.commit).toHaveBeenCalledOnce();expect(m.release).toHaveBeenCalledOnce();
 });
 it('pauses without deleting the transition record',async()=>{
  const saved=await saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input:{...input,enabled:false,transitionReviewed:false}});
  expect(evaluateClientSessionBooking(saved,12).enabled).toBe(false);expect(evaluateClientSessionBooking(saved,30).enabled).toBe(true);
 });
 it('rejects unreviewed, oversized, foreign/non-client cohorts and stale revisions without writing',async()=>{
  for(const patch of [{transitionReviewed:false},{providerUserIds:Array.from({length:11},(_,i)=>i+1)},{providerUserIds:[99]},{providerUserIds:[500]},{revision:2},{note:''},{providerUserIds:[]}])
   await expect(saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input:{...input,...patch}})).rejects.toThrow();
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(m.commit).not.toHaveBeenCalled();
 });
});

it('admits only explicitly allowlisted synthetic providers in the isolated QA practice', async () => {
 const provider={id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1};
 const qa={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,exchangeProviders:[{id:1433,email:provider.email}]}}};
 let agency=qa;
 m.execute.mockImplementation(async sql => sql.includes('FROM agencies')?[[agency]]:[[provider,{...provider,id:1439},{...provider,id:7,is_demo:0,email:'real@clinic.test'}]]);
 expect(await sessionBookingProviders(450)).toEqual([{id:1433,name:''}]);
 agency={...qa,feature_flags:{}};
 expect((await sessionBookingProviders(450)).map(p=>p.id)).toEqual([7]);
 agency={id:2,slug:'itsco',feature_flags:{}};
 expect((await sessionBookingProviders(2)).map(p=>p.id)).toEqual([7]);
});

it('opens the practice for new eligible providers, preserves explicit pauses and enforces care eligibility', async () => {
 const practice={...policy,enabledForAllProviders:true,entries:[...policy.entries,{providerUserId:13,enabled:false}]};
 expect(evaluateClientSessionBooking(practice,14).enabled).toBe(true);
 expect(evaluateClientSessionBooking(practice,13).enabled).toBe(false);
 expect(evaluateClientSessionBooking(practice,0).enabled).toBe(false);
 m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,work_email')?[[{id:14,work_email:'synthetic@itsco.health',personal_email:'personal@example.net',password_hash:'synthetic',sso_password_override:1,login_is_group_email:1}]]:sql.startsWith('SELECT feature_flags') ? [[{feature_flags:{clientSessionBookingRollout:practice}}]] : sql.startsWith('SELECT id,slug') ? [[{id:2}]] : sql.includes('FROM users u') ? [[{id:12}]] : [{affectedRows:1}]);
 const saved=await saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input:{...input,enabled:false}});
 expect(saved.enabledForAllProviders).toBe(true); expect(evaluateClientSessionBooking(saved,14).enabled).toBe(true);
 m.care.mockResolvedValue({canProvideCare:false,reason:'Sees clients is off'});
 await expect(requireClientSessionBooking(2,14)).rejects.toThrow('Sees clients is off');
});

it('keeps tutoring capability independent of the clinical transition and checks the exact assignment',async()=>{
 m.offered.mockResolvedValue({careEligibility:{canProvideCare:true},services:[{serviceType:'tutoring',offered:true}]});
 expect((await clientSessionBookingAccess(453,1496,undefined,{businessType:'tutoring'})).enabled).toBe(true);
 await expect(requireClientSessionBooking(453,1496,undefined,{businessType:'tutoring'})).resolves.toMatchObject({enabled:true,businessType:'tutoring'});
 m.offered.mockResolvedValue({careEligibility:{canProvideCare:false},services:[{serviceType:'tutoring',offered:true}]});
 expect((await clientSessionBookingAccess(453,1496,undefined,{businessType:'tutoring'})).enabled).toBe(false);
 await expect(requireClientSessionBooking(453,1496,undefined,{businessType:'tutoring'})).rejects.toMatchObject({status:403});
 await expect(requireClientSessionBooking(453,1496)).rejects.toMatchObject({status:403});
});


it('opens the shared scheduling entry for tutoring without enabling clinical booking',async()=>{
 m.offered.mockResolvedValue({careEligibility:{canProvideCare:true},services:[{serviceType:'tutoring',offered:true}]});
 const access=await clientSessionBookingAccess(2,13,undefined,{businessType:'any'});expect(access).toMatchObject({enabled:true,availableBusinessTypes:['tutoring']});
 await expect(requireClientSessionBooking(2,13)).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
});

function staffBookingDatabase(actor){return {execute:vi.fn(async sql=>sql.startsWith('SELECT feature_flags')?[[{feature_flags:{clientSessionBookingRollout:policy}}]]:sql.includes('SELECT u.role,u.is_active')?[[actor]]:[])};}
const activeStaff={role:'support',is_active:1,status:'ACTIVE_EMPLOYEE',is_archived:0,membership_active:1};
it.each(['support','admin','super_admin'])('allows scoped ITSCO %s staff to arrange care before provider self-scheduling activation',async role=>{
 const db=staffBookingDatabase({...activeStaff,role});
 expect(await clientSessionBookingAccess(2,13,db,{actorUserId:5})).toMatchObject({enabled:true,staffScheduling:true,providerSelfSchedulingEnabled:false});
 await expect(requireClientSessionBooking(2,13,db,{actorUserId:5})).resolves.toMatchObject({enabled:true});
 expect(evaluateClientSessionBooking(policy,13).enabled).toBe(false);
 expect(db.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
});
it.each([{role:'provider'},{role:'intern'},{role:'support',membership_active:0},{role:'admin',membership_active:0},{role:'support',is_active:0},{role:'support',status:'TERMINATED'},{role:'support',is_archived:1}])('does not turn staff-on-behalf access into an unscoped rollout bypass: %j',async actor=>{
 const db=staffBookingDatabase({...activeStaff,...actor});
 await expect(requireClientSessionBooking(2,13,db,{actorUserId:5})).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
});
it('keeps provider self-scheduling closed and limits the staff exception to ITSCO',async()=>{
 const db=staffBookingDatabase({...activeStaff,role:'super_admin'});
 await expect(requireClientSessionBooking(2,13,db,{actorUserId:13})).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
 await expect(requireClientSessionBooking(7,13,db,{actorUserId:5})).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
});
it('does not let staff schedule for a person who is not eligible to provide care',async()=>{
 const db=staffBookingDatabase(activeStaff);m.care.mockResolvedValue({canProvideCare:false,reason:'Active client-facing assignment required'});
 await expect(requireClientSessionBooking(2,13,db,{actorUserId:5})).rejects.toThrow('Active client-facing assignment required');
});

it('keeps pending conversions self-scheduling closed even when a previous rollout write enabled the provider',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM provider_account_conversions')?[[{id:'conversion-12',state:'password_pending'}]]:base(sql,args));
 await expect(requireClientSessionBooking(2,12)).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
 await expect(saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input})).rejects.toMatchObject({status:409});
});

it('blocks legacy enabled ITSCO SSO-only identities without a conversion row while preserving staff-on-behalf care',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT id,work_email')?[[{id:12,work_email:'workspace@itsco.health',personal_email:'personal@example.net',password_hash:null,sso_password_override:0,login_is_group_email:0}]]:sql.includes('SELECT u.role,u.is_active')?[[activeStaff]]:base(sql,args));
 await expect(requireClientSessionBooking(2,12)).rejects.toMatchObject({code:'CLIENT_SESSION_BOOKING_NOT_ENABLED'});
 await expect(saveClientSessionBookingRollout({agencyId:2,actorUserId:5,input})).rejects.toThrow('Individual account conversion');
 expect(await clientSessionBookingAccess(2,12,undefined,{actorUserId:5})).toMatchObject({enabled:true,staffScheduling:true,providerSelfSchedulingEnabled:false});
});

it.each(['tisi', 'nlu'])('opens %s for eligible providers while honoring individual rollout pauses', async slug => {
  const entries = [{ providerUserId: 13, enabled: false }];
  m.execute.mockResolvedValue([[{ slug, feature_flags: { clientSessionBookingRollout: { revision: 1, enabledForAllProviders: false, entries } } }]]);
  m.care.mockResolvedValue({ canProvideCare: true });
  expect((await clientSessionBookingAccess(7, 12)).enabled).toBe(true);
  expect((await clientSessionBookingAccess(7, 13)).enabled).toBe(false);
  m.care.mockResolvedValue({ canProvideCare: false, reason: 'Care access is off' });
  expect(await clientSessionBookingAccess(7, 12)).toMatchObject({ enabled: false, reason: 'Care access is off' });
});
