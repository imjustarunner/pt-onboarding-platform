import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:vi.fn()}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'test'}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findByPortalUrl:vi.fn(async()=>({id:2,slug:'itsco',name:'ITSCO'}))}}));
vi.mock('../publicWebsiteIdentity.service.js',()=>({getPublicWebsiteIdentity:vi.fn(async()=>null)}));
vi.mock('../publicWebsiteTicketRouting.service.js',()=>({routePublicWebsiteTicket:vi.fn(async()=>{})}));
vi.mock('../websiteChatReferral.service.js',()=>({resolveChatReferral:vi.fn(async()=>null)}));
vi.mock('../itscoInternshipInquiry.service.js',()=>({resolveInternshipContact:vi.fn(),deliverInternshipInquiry:vi.fn(),INTERNSHIP_INQUIRY_SUBJECT:'Practicum/Internship inquiry'}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:text=>({plain:text})}));
import pool from '../../config/database.js';
import {createPublicAgencySupportTicket} from '../publicAgencySupport.service.js';
const payload={name:'Visitor Name',email:'visitor@example.com',message:'I would like to inquire about appointments.',category:'other',providerId:496,phiAcknowledged:true};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async(sql)=>{
 if(sql.includes('SELECT u.id,u.first_name,u.last_name'))return [[{id:496,first_name:'Megan',last_name:'Geil-Crader'}]];
 if(sql.includes('INSERT INTO support_tickets'))return [{insertId:31}];return [[]];
});});
describe('provider-specific support inquiry',()=>{
 it('uses the agency-validated provider identity in the saved subject and message',async()=>{
  const result=await createPublicAgencySupportTicket('itsco',{...payload,providerName:'Wrong name'},null);
  expect(result.ticketId).toBe(31);const query=pool.execute.mock.calls.find(([sql])=>sql.includes('SELECT u.id,u.first_name,u.last_name'));
  expect(query[1]).toEqual([496,2]);const inserted=pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'))[1];
  expect(inserted).toContain('Provider inquiry: Megan Geil-Crader — Visitor Name');expect(inserted.find(v=>typeof v==='string'&&v.includes('Requested provider:'))).toContain('Requested provider: Megan Geil-Crader (ID 496)');
 });
 it('rejects a provider outside the selected agency before creating a ticket',async()=>{
  pool.execute.mockResolvedValue([[]]);await expect(createPublicAgencySupportTicket('itsco',payload,null)).rejects.toMatchObject({status:400});expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 });
});
