import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),care:vi.fn(),eligible:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>m}}));
vi.mock('../staffCareEligibility.service.js',()=>({staffCareEligibility:m.eligible,readStaffCareEligibility:m.care}));
import { evaluateClientSessionBooking, requireClientSessionBooking, saveClientSessionBookingRollout } from '../clientSessionBookingRollout.service.js';
const policy={revision:3,entries:[{providerUserId:12,enabled:true},{providerUserId:30,enabled:true}]};
const input={providerUserIds:[12],enabled:true,transitionReviewed:true,note:'Reviewed October cohort',revision:3};
beforeEach(()=>{vi.clearAllMocks();m.care.mockResolvedValue({canProvideCare:true});m.eligible.mockImplementation(row=>({canProvideCare:row.id!==99}));m.execute.mockImplementation(async sql=>sql.startsWith('SELECT feature_flags')?[[{feature_flags:{clientSessionBookingRollout:policy,keep:true}}]]:sql.includes('FROM users u')?[[{id:12,first_name:'Legal',preferred_name:'Preferred',last_name:'Name'},{id:30,first_name:'Other'},{id:99,first_name:'Nonclient staff'}]]:[{affectedRows:1}]);});
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
