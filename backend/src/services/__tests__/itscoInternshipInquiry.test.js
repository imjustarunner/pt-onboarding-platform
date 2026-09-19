import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:vi.fn()}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findByPortalUrl:vi.fn(),findBySlug:vi.fn()}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:vi.fn()}}));
vi.mock('../websiteChatReferral.service.js',()=>({resolveChatReferral:vi.fn().mockResolvedValue(null)}));
vi.mock('../publicWebsiteIdentity.service.js',()=>({getPublicWebsiteIdentity:vi.fn().mockResolvedValue(null)}));
vi.mock('../captcha.service.js',()=>({verifyRecaptchaV3:vi.fn().mockResolvedValue({ok:true,score:1,action:'public_agency_support'})}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:vi.fn(text=>({plain:null,ciphertext:'encrypted',iv:'iv',authTag:'tag',keyId:'key'}))}));
import { resolveInternshipContact, deliverInternshipInquiry, INTERNSHIP_INQUIRY_SUBJECT } from '../itscoInternshipInquiry.service.js';
import { createPublicAgencySupportTicket } from '../publicAgencySupport.service.js';
import { sendWebsiteTicketReply } from '../publicWebsiteTicketReply.service.js';
import pool from '../../config/database.js';
import identities from '../../models/EmailSenderIdentity.model.js';
import Agency from '../../models/Agency.model.js';
import config from '../../config/config.js';
import { verifyRecaptchaV3 } from '../captcha.service.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
const agency={id:2,slug:'itsco',name:'ITSCO',portal_url:'itsco'};
beforeEach(()=>{
 vi.clearAllMocks();Agency.findByPortalUrl.mockResolvedValue(agency);
 identities.findByAgencyAndIdentityKey.mockImplementation(async(id,key)=>key==='support'?{id:11}:key==='personal_507'?{id:86,from_email:'rachel@itsco.health'}:null);
 pool.execute.mockImplementation(async sql=>sql.includes('SELECT DISTINCT')?[[{id:507,work_email:null}]]:sql.includes('SELECT u.id')?[[]]:[{insertId:321,affectedRows:1}]);
 sendEmailFromIdentity.mockResolvedValue({sent:true});
});
describe('ITSCO practicum/internship inquiries',()=>{
 it('uses Rachel’s configured work mailbox and an agency-scoped support sender',async()=>{
  expect(await resolveInternshipContact(agency)).toEqual({userId:507,email:'rachel@itsco.health',senderIdentityId:11});
  expect(identities.findByAgencyAndIdentityKey).toHaveBeenCalledWith(2,'personal_507');
 });
 it('fails closed for another tenant or ambiguous recipient',async()=>{
  await expect(resolveInternshipContact({...agency,slug:'other'})).rejects.toMatchObject({status:404});
  pool.execute.mockResolvedValue([[{id:507},{id:999}]]);await expect(resolveInternshipContact(agency)).rejects.toMatchObject({status:503});
 });
 it('rejects a missing work mailbox without falling back to a personal login email',async()=>{
  identities.findByAgencyAndIdentityKey.mockResolvedValue(null);await expect(resolveInternshipContact(agency)).rejects.toMatchObject({status:503});
 });
 it('requires email even when the visitor supplies a phone',async()=>{
  await expect(createPublicAgencySupportTicket('itsco',{name:'Test Student',phone:'7195550100',message:'Placement question',phiAcknowledged:true},null,{internshipInquiry:true})).rejects.toThrow('email address');
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
 });
 it('creates an encrypted, replyable ticket with the exact subject and assigns Rachel',async()=>{
  const result=await createPublicAgencySupportTicket('itsco',{name:'Test Student',email:'student@example.com',category:'careers',message:'Can I apply for a Denver practicum?',phiAcknowledged:true,to:'attacker@example.com',subject:'Override'},null,{internshipInquiry:true});
  expect(result).toMatchObject({ticketId:321,emailDelivered:true});
  const insert=pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'));
  expect(insert[1]).toContain(INTERNSHIP_INQUIRY_SUBJECT);expect(insert[1]).toContain('student@example.com');expect(insert[1]).toContain('encrypted');
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('SET claimed_by_user_id=?'),[507,321,2]);
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({to:'rachel@itsco.health',subject:'Practicum/Internship inquiry',senderIdentityId:11,linkUrl:'https://plottwisthq.com/itsco/tickets?ticketId=321',text:expect.stringContaining('student@example.com')}));
 });
 it('preserves captcha and privacy validation before creating or sending',async()=>{
  await expect(createPublicAgencySupportTicket('itsco',{name:'Test Student',email:'student@example.com',message:'Placement inquiry',phiAcknowledged:false},null,{internshipInquiry:true})).rejects.toThrow('privacy');expect(sendEmailFromIdentity).not.toHaveBeenCalled();
 });
 it('rejects failed human verification before persisting an inquiry',async()=>{
  const original=config.recaptcha;config.recaptcha={siteKey:'test'};verifyRecaptchaV3.mockResolvedValueOnce({ok:false,reason:'invalid_token'});
  try { await expect(createPublicAgencySupportTicket('itsco',{name:'Test Student',email:'student@example.com',message:'Placement question',phiAcknowledged:true,captchaToken:'invalid'},{headers:{},socket:{}},{internshipInquiry:true})).rejects.toMatchObject({code:'invalid_token'});expect(pool.execute).not.toHaveBeenCalled();expect(sendEmailFromIdentity).not.toHaveBeenCalled(); }
  finally { config.recaptcha=original; }
 });
 it('reports skipped delivery without losing the saved ticket',async()=>{
  sendEmailFromIdentity.mockResolvedValue({skipped:true});expect(await deliverInternshipInquiry({contact:{userId:507,email:'rachel@itsco.health',senderIdentityId:11},ticketId:321,question:'Question'})).toBe(false);
 });
 it('sends app replies back to the visitor using the branded support identity',async()=>{
  await sendWebsiteTicketReply({id:321,agency_id:2,source_channel:'public_web',source_email_from:'student@example.com',subject:INTERNSHIP_INQUIRY_SUBJECT},'Thank you for your interest.');
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({to:'student@example.com',senderIdentityId:11,subject:'Re: Practicum/Internship inquiry [#321]'}));
 });
});
