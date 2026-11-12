import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'production',recaptcha:{secretKey:'configured-test-key',siteKey:'ordinary-key'}}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findByPortalUrl:vi.fn(),findBySlug:vi.fn(),findById:vi.fn()}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:vi.fn().mockResolvedValue(null)}}));
vi.mock('../publicWebsiteIdentity.service.js',()=>({getPublicWebsiteIdentity:vi.fn().mockResolvedValue(null)}));
vi.mock('../websiteChatReferral.service.js',()=>({resolveChatReferral:vi.fn().mockResolvedValue(null)}));
vi.mock('../captcha.service.js',()=>({verifyRecaptchaV3:vi.fn()}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:vi.fn(()=>({plain:null,ciphertext:'fixture',iv:'iv',authTag:'tag',keyId:'key'}))}));
import Agency from '../../models/Agency.model.js';
import pool from '../../config/database.js';
import {verifyRecaptchaV3} from '../captcha.service.js';
import {getPublicAgencySupportConfig,createPublicAgencySupportTicket} from '../publicAgencySupport.service.js';
const qa={id:450,slug:'auricwell-qa-demo',portal_url:'auricwell-qa-demo',name:'Fictional QA',is_active:1,feature_flags:{qaSandbox:{syntheticOnly:true}}};
const payload={name:'Fictional QA',email:'testing+captcha-fixture@itsco.health',message:'A fictional support test question',phiAcknowledged:true};
beforeEach(()=>{vi.clearAllMocks();Agency.findByPortalUrl.mockResolvedValue(qa);Agency.findBySlug.mockResolvedValue(null);pool.execute.mockRejectedValue(new Error('STOP_AFTER_CAPTCHA'));});
describe('public support CAPTCHA uses the actual stored demo route',()=>{
 it.each([qa,{...qa,id:453,slug:'nlu-qa-demo',portal_url:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}},{...qa,id:456,slug:'scb-qa-company',portal_url:'scb-qa-company',organization_type:'agency',feature_flags:{qaCaptcha:{syntheticOnly:true}}}])('returns no key and permits token-free synthetic request only for the exact route',async agency=>{
  Agency.findByPortalUrl.mockResolvedValue(agency);
  const cfg=await getPublicAgencySupportConfig(agency.slug);expect(cfg.recaptchaRequired).toBe(false);expect(cfg.recaptchaSiteKey).toBeNull();
  await expect(createPublicAgencySupportTicket(agency.slug,payload,{headers:{}})).rejects.toThrow('STOP_AFTER_CAPTCHA');
  expect(verifyRecaptchaV3).not.toHaveBeenCalled();expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO support_tickets'))).toBe(true);
 });
 it.each(['fundthred','plotline','itsco'])('does not exempt a marketing alias %s even if it resolves to the demo support agency',async alias=>{
  const cfg=await getPublicAgencySupportConfig(alias);expect(cfg.recaptchaSiteKey).toBe('ordinary-key');expect(cfg.recaptchaRequired).toBe(true);
  await expect(createPublicAgencySupportTicket(alias,{...payload,skipCaptcha:true,qaSandbox:{syntheticOnly:true}},{headers:{}})).rejects.toMatchObject({code:'missing_token'});expect(pool.execute).not.toHaveBeenCalled();
 });
 it('keeps live NLU6 and spoofed flags protected',async()=>{
  Agency.findByPortalUrl.mockResolvedValue({...qa,id:6,slug:'nlu',portal_url:'nlu'});
  expect((await getPublicAgencySupportConfig('nlu')).recaptchaRequired).toBe(true);
  await expect(createPublicAgencySupportTicket('nlu',{...payload,agencyId:453,skipCaptcha:true},{headers:{}})).rejects.toMatchObject({code:'missing_token'});expect(pool.execute).not.toHaveBeenCalled();
 });
});
