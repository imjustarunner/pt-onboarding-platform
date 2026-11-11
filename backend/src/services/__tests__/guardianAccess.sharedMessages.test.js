import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() },onTableWrite:()=>{} }));
vi.mock('../clientSecureConversation.service.js', () => ({ clientSecureAudience: vi.fn(), refreshClientSecureAccess:vi.fn() }));
vi.mock('../dependentPortalMessages.service.js', () => ({ assertDependentThreadAccess: vi.fn(async () => null) }));
vi.mock('../sharedFamilyNotice.service.js',()=>({requireSharedFamilyAck:vi.fn()}));
vi.mock('../familySharedConversations.service.js',async(importOriginal)=>({...await importOriginal(),familySharedConversations:{open:vi.fn(),requireAccess:vi.fn()}}));
import pool from '../../config/database.js';
import { clientSecureAudience,refreshClientSecureAccess } from '../clientSecureConversation.service.js';
import {familySharedConversations} from '../familySharedConversations.service.js';
import {requireSharedFamilyAck} from '../sharedFamilyNotice.service.js';
import { sharedChildParticipants, ensureSharedChildThread, assertSharedChildThreadAccess, assertSharedGuardianSend } from '../guardianSharedMessages.service.js';
const shared={threadId:4,client_id:8,clientId:8,agencyId:2,audienceUserIds:[1,2,9],participants:[{id:1},{id:2},{id:9}]};
beforeEach(() => {
  vi.resetAllMocks();
  clientSecureAudience.mockResolvedValue({ client: { id: 8, agency_id: 2 }, participants: shared.participants });
  familySharedConversations.open.mockResolvedValue(shared);familySharedConversations.requireAccess.mockResolvedValue(shared);
  pool.execute.mockResolvedValue([[{ client_id: 8, agency_id: 2 }]]);
});
it('uses the authorized client audience without granting another tenant access',async()=>{
 expect((await sharedChildParticipants(8,2)).participants.map(p=>p.id)).toEqual([1,2,9]);
 await expect(sharedChildParticipants(8,3)).rejects.toMatchObject({status:403});
});
it('opens a new immutable audience conversation through the existing guardian API',async()=>{
 expect(await ensureSharedChildThread({clientId:8,agencyId:2,userId:1})).toMatchObject({threadId:4,shared:true});
 expect(familySharedConversations.open).toHaveBeenCalledWith({clientId:8,agencyId:2,serviceId:undefined,userId:1});
});
it('honors revoked access even when old thread membership remains',async()=>{
 familySharedConversations.requireAccess.mockRejectedValue(Object.assign(new Error('Revoked'),{status:403}));
 await expect(assertSharedChildThreadAccess(2,4)).rejects.toMatchObject({status:403});
});
it('rechecks the full reviewed audience and first-send acknowledgment before a guardian or provider send',async()=>{
 await assertSharedGuardianSend(9,4,{expectedRecipientUserIds:[1,2]});
 expect(familySharedConversations.requireAccess).toHaveBeenCalledWith(9,4,{forSend:true});
 expect(requireSharedFamilyAck).toHaveBeenCalledWith({userId:9,agencyId:2});
 await expect(assertSharedGuardianSend(9,4,{expectedRecipientUserIds:[1]})).rejects.toMatchObject({status:409,code:'FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED'});
});
it('keeps earlier private family conversations read-only and never silently copies their history',async()=>{
 familySharedConversations.requireAccess.mockResolvedValue(null);pool.execute.mockResolvedValue([[{user_id:1}]]);
 await expect(assertSharedGuardianSend(9,4)).rejects.toMatchObject({status:409,code:'FAMILY_SHARED_THREAD_REQUIRED'});
 expect(familySharedConversations.open).not.toHaveBeenCalled();expect(requireSharedFamilyAck).not.toHaveBeenCalled();
});
it('does not apply the family notice to an internal staff-only conversation',async()=>{
 familySharedConversations.requireAccess.mockResolvedValue(null);pool.execute.mockResolvedValue([[]]);
 await expect(assertSharedGuardianSend(9,4)).resolves.toBeUndefined();expect(requireSharedFamilyAck).not.toHaveBeenCalled();
});
it('rechecks historical client access without auto-adding participants',async()=>{
 familySharedConversations.requireAccess.mockResolvedValue(null);refreshClientSecureAccess.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));
 await expect(assertSharedChildThreadAccess(2,4)).rejects.toMatchObject({status:403});expect(familySharedConversations.open).not.toHaveBeenCalled();
});
