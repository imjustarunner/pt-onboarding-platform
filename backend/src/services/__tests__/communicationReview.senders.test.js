import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../sharedCareNumber.service.js',()=>({sharedCareNumberId:vi.fn()}));
vi.mock('../communicationRouting.service.js',()=>({resolveClientCaregivers:vi.fn()}));
vi.mock('../smsProfileAudit.service.js',()=>({resolveProfilePhoneMatch:vi.fn()}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{}}));
vi.mock('../../models/AgencyContact.model.js',()=>({default:{}}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn(),decryptChatText:()=> 'Reply text'}));
import { listCommunicationReview } from '../communicationReview.service.js';
const row={id:3,channel:'sms',reason:'staff_line_review',status:'review',from_number:'+13035550101'};
beforeEach(()=>vi.clearAllMocks());
it('identifies an agency staff sender in one batch while retaining the text review reason',async()=>{
 mocks.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{id:7,first_name:'Taylor',last_name:'Team',personal_phone:'303-555-0101'}]]);
 expect(await listCommunicationReview(2)).toEqual([expect.objectContaining({senderName:'Taylor Team',reason:'staff_line_review',body:'Reply text'})]);
 const [sql,params]=mocks.execute.mock.calls[1];expect(sql).toContain('ua.agency_id=? AND ua.is_active=TRUE');expect(params).toEqual([2,'3035550101','3035550101','3035550101']);
});
it('does not guess an identity for a phone shared by multiple agency accounts',async()=>{
 mocks.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{id:7,first_name:'One',phone_number:'+13035550101'},{id:8,first_name:'Two',phone_number:'+13035550101'}]]);
 expect((await listCommunicationReview(2))[0].senderName).toBeNull();
});
