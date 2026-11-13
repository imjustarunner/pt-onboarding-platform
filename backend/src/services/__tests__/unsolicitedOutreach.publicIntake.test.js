import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'production',recaptcha:{secretKey:'test-key',siteKey:'site-key'}}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findByPortalUrl:vi.fn(),findBySlug:vi.fn(),findById:vi.fn()}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:vi.fn().mockResolvedValue(null)}}));
vi.mock('../publicWebsiteIdentity.service.js',()=>({getPublicWebsiteIdentity:vi.fn().mockResolvedValue(null)}));
vi.mock('../websiteChatReferral.service.js',()=>({resolveChatReferral:vi.fn().mockResolvedValue(null)}));
vi.mock('../captcha.service.js',()=>({verifyRecaptchaV3:vi.fn()}));
vi.mock('../unsolicitedOutreach.service.js',()=>({filterUnsolicitedOutreach:vi.fn()}));
vi.mock('../publicWebsiteTicketRouting.service.js',()=>({routePublicWebsiteTicket:vi.fn()}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:vi.fn(text=>({plain:text,ciphertext:null,iv:null,authTag:null,keyId:null}))}));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import {verifyRecaptchaV3} from '../captcha.service.js';
import {filterUnsolicitedOutreach} from '../unsolicitedOutreach.service.js';
import {createPublicAgencySupportTicket} from '../publicAgencySupport.service.js';
const payload={name:'Fictional vendor',email:'vendor@example.test',message:'We offer SEO services. Can we send a free audit and prices?',category:'school_partnership',phiAcknowledged:true,captchaToken:'fixture-token'};
beforeEach(()=>{
 vi.clearAllMocks();Agency.findByPortalUrl.mockResolvedValue({id:2,slug:'itsco',name:'ITSCO',portal_url:'itsco',is_active:1});
 verifyRecaptchaV3.mockResolvedValue({ok:true,score:1,action:'public_agency_support'});
 filterUnsolicitedOutreach.mockResolvedValue({filtered:true});
 pool.execute.mockRejectedValue(new Error('STOP_BEFORE_TICKET_INSERT'));
});
it('suppresses a pitch after CAPTCHA and before ticket creation or routing',async()=>{
 expect(await createPublicAgencySupportTicket('itsco',payload,{headers:{}})).toEqual({ok:true,ticketId:null,suppressed:true});
 expect(verifyRecaptchaV3).toHaveBeenCalledOnce();expect(filterUnsolicitedOutreach).toHaveBeenCalledWith({agencyId:2,fromEmail:'vendor@example.test',bodyText:payload.message});
 expect(verifyRecaptchaV3.mock.invocationCallOrder[0]).toBeLessThan(filterUnsolicitedOutreach.mock.invocationCallOrder[0]);
 expect(pool.execute).not.toHaveBeenCalled();
});
it('does not let an unverified submission trigger a block or rejection email',async()=>{
 verifyRecaptchaV3.mockResolvedValue({ok:false,reason:'verification_failed'});
 await expect(createPublicAgencySupportTicket('itsco',payload,{headers:{}})).rejects.toMatchObject({code:'verification_failed'});
 expect(filterUnsolicitedOutreach).not.toHaveBeenCalled();expect(pool.execute).not.toHaveBeenCalled();
});
it('honors the existing honeypot without emailing the supplied address',async()=>{
 expect(await createPublicAgencySupportTicket('itsco',{...payload,website:'spam-filled'},{headers:{}})).toMatchObject({suppressed:true});
 expect(filterUnsolicitedOutreach).not.toHaveBeenCalled();expect(verifyRecaptchaV3).not.toHaveBeenCalled();
});
it('keeps ordinary care and applicant submissions on the existing ticket path',async()=>{
 filterUnsolicitedOutreach.mockResolvedValue({filtered:false});
 await expect(createPublicAgencySupportTicket('itsco',{...payload,message:'I need counseling for my family.'},{headers:{}})).rejects.toThrow('STOP_BEFORE_TICKET_INSERT');
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO support_tickets'),expect.any(Array));
});
