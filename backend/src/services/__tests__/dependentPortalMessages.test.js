import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../dependentPortal.service.js',()=>({personalContext:vi.fn()}));
vi.mock('../guardianClinicalAccess.service.js',()=>({requireClinicalScope:vi.fn(),clinicalAccess:vi.fn()}));
vi.mock('../familySharedConversations.service.js',()=>({familySharedConversations:{open:vi.fn()}}));
import pool from '../../config/database.js';import {personalContext} from '../dependentPortal.service.js';
import {familySharedConversations} from '../familySharedConversations.service.js';
import {assertDependentThreadAccess,personalConversation} from '../dependentPortalMessages.service.js';
const mapping={thread_id:22,user_id:4,client_id:8,agency_id:2,service_id:5};
beforeEach(()=>{vi.resetAllMocks();personalContext.mockResolvedValue({clientId:8,agencyId:2,serviceId:5,selected:{permissions_json:{},service:{provider_user_id:9,provider_name:'Tutor',service_kind:'tutoring'}}});pool.execute.mockImplementation(async(sql,params=[])=>sql.includes('dependent_portal_threads')?[[mapping]]:sql.includes('dependent_portal_access')?[[{user_id:4,client_id:8}]]:sql.includes('JOIN user_agencies')?[[{id:params[1]}]]:sql.startsWith('SELECT user_id FROM chat_thread_participants')?[params[0]===22&&[4,9].includes(params[1])?[{user_id:params[1]}]:[]]:[[]]);});
it('denies parents and unrelated providers even if they know the personal thread ID',async()=>{await expect(assertDependentThreadAccess(3,22)).rejects.toMatchObject({status:403});await expect(assertDependentThreadAccess(10,22)).rejects.toMatchObject({status:403});});
it('accepts only the child and current assigned tutor',async()=>{expect(await assertDependentThreadAccess(4,22)).toEqual(mapping);expect(await assertDependentThreadAccess(9,22)).toEqual(mapping);});
it('blocks the old conversation when personal access is revoked',async()=>{pool.execute.mockResolvedValueOnce([[mapping]]).mockResolvedValueOnce([[{client_id:8,revoked_at:new Date()}]]);await expect(assertDependentThreadAccess(4,22)).rejects.toMatchObject({status:403});});
it('opens the new immutable shared-family audience without expanding the older private history',async()=>{
  const current={threadId:33,clientId:8,agencyId:2,serviceId:5,audienceUserIds:[3,4,9],participants:[{id:3,name:'Eligible guardian',role:'guardian'},{id:4,name:'Client',role:'client'},{id:9,name:'Tutor',role:'provider'}],shared:true,sharingPolicy:'all_eligible_family'};
  familySharedConversations.open.mockResolvedValue(current);
  const result=await personalConversation(4,{agencyId:2,serviceId:5});
  expect(familySharedConversations.open).toHaveBeenCalledWith({userId:4,clientId:8,agencyId:2,serviceId:5,providerUserId:9});
  expect(result).toMatchObject(current);expect(result.threadId).not.toBe(mapping.thread_id);
  expect(result.participants.map(p=>p.id)).toEqual([3,4,9]);expect(result.audience).toContain('all currently authorized family portal users');
  expect(pool.execute).not.toHaveBeenCalled();expect(pool.getConnection).not.toHaveBeenCalled();
  // The new shared channel does not change the old personal thread's original
  // recipients. It remains readable to the client, never to the guardian.
  expect(await assertDependentThreadAccess(4,22)).toEqual(mapping);
  await expect(assertDependentThreadAccess(3,22)).rejects.toMatchObject({status:403});
  expect(pool.execute.mock.calls.some(([sql])=>/INSERT.*chat_thread_participants/.test(sql))).toBe(false);
});
it('does not add a newly assigned tutor to the previous private thread',async()=>{
  personalContext.mockResolvedValue({clientId:8,agencyId:2,serviceId:5,selected:{permissions_json:{},service:{provider_user_id:10,provider_name:'New tutor',service_kind:'tutoring'}}});
  await expect(assertDependentThreadAccess(10,22)).rejects.toMatchObject({status:403});
  expect(pool.execute.mock.calls.some(([sql])=>/INSERT.*chat_thread_participants/.test(sql))).toBe(false);
});
