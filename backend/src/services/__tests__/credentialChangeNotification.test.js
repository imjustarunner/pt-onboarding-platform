import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),db:vi.fn(),release:vi.fn(),user:vi.fn(),agencies:vi.fn(),mailbox:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user,getAgencies:m.agencies}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{}}));
vi.mock('../securityMailbox.service.js',()=>({resolveSecurityMailbox:m.mailbox}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../../utils/publicPortalUrl.js',()=>({buildPublicPortalLoginUrl:()=> 'https://app.itsco.health/login'}));
import {queueCredentialChangeNotice,recordCredentialChangeNotice,deliverCredentialChangeNotice,buildCredentialChangeMessage} from '../credentialChangeNotification.service.js';
import {isCredentialSecurityNotice} from '../../utils/securityNotification.js';
const agency={id:2,name:'ITSCO',primary_color:'#619c72'};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();m.user.mockResolvedValue({id:7,personal_email:'private@example.test',work_email:'shared@itsco.health'});m.agencies.mockResolvedValue([agency]);m.execute.mockResolvedValue([{insertId:81}]);m.getConnection.mockResolvedValue({execute:m.db,release:m.release});m.db.mockImplementation(async sql=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.startsWith('SELECT *'))return [[{id:81,user_id:7,agency_id:2,credential_kind:'quick_view',recipient_email:'private@example.test',occurred_at:'2026-10-19T20:00:00Z'}]];
 return [{affectedRows:1}];
});m.mailbox.mockResolvedValue({agency,identity:{id:4,identity_key:'security',from_email:'security@itsco.health'},replyTo:'admin@itsco.health'});m.send.mockResolvedValue({id:'gmail-message'});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
it('durably queues the person’s recovery inbox using a member agency, not a spoofed tenant',async()=>{
 await queueCredentialChangeNotice({userId:7,agencyId:999,kind:'quick_view',version:2});
 expect(m.execute.mock.calls[0][1]).toEqual([expect.stringMatching(/^quick_view:7:/),7,2,'quick_view','private@example.test']);expect(m.send).not.toHaveBeenCalled();
});
it('uses the verified security identity, admin replies and a real sign-in/report action',async()=>{
 await deliverCredentialChangeNotice(81);
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:4,replyToOverride:'admin@itsco.health',to:'private@example.test',templateType:'security_quick_view_changed'}));
 const email=m.send.mock.calls[0][0];expect(email.html).toContain('If this was not you');expect(email.html).toContain('mailto:admin@itsco.health');expect(email.html).toContain('https://app.itsco.health/login');expect(email.subject).toContain('ITSCO');
 expect(m.db.mock.calls.some(([sql])=>sql.includes("delivery_status='sent'"))).toBe(true);expect(m.release).toHaveBeenCalled();
});
it('keeps failed mail pending for retry and does not mark it sent',async()=>{
 m.send.mockRejectedValue(new Error('Temporary mail outage'));await deliverCredentialChangeNotice(81);
 expect(m.db.mock.calls.some(([sql])=>sql.includes('INTERVAL 5 MINUTE'))).toBe(true);
 expect(m.db.mock.calls.some(([sql])=>sql.includes("delivery_status='sent'"))).toBe(false);
});
it('does not send without a verified sender or while another worker holds the lock',async()=>{
 m.mailbox.mockRejectedValue(new Error('Sender missing'));await deliverCredentialChangeNotice(81);expect(m.send).not.toHaveBeenCalled();
 m.db.mockResolvedValue([[{acquired:0}]]);await deliverCredentialChangeNotice(81);expect(m.send).not.toHaveBeenCalled();
});
it('does not make a successful reset fail when queue storage is temporarily unavailable',async()=>{
 const warn=vi.spyOn(console,'error').mockImplementation(()=>{});m.execute.mockRejectedValue(new Error('Unavailable'));
 expect(await recordCredentialChangeNotice({userId:7,kind:'password'})).toBeNull();expect(warn).toHaveBeenCalled();warn.mockRestore();
});
it('escapes tenant text and limits required-email exemptions to credential notices from security identities',()=>{
 const result=buildCredentialChangeMessage({kind:'password',agency:{...agency,name:'<Tenant>'},replyTo:'admin@itsco.health',occurredAt:new Date(),loginUrl:'https://app.itsco.health/login'});
 expect(result.html).toContain('&lt;Tenant&gt;');expect(result.html).not.toContain('<Tenant>');
 expect(isCredentialSecurityNotice({identity_key:'security'},'security_password_changed')).toBe(true);
 expect(isCredentialSecurityNotice({identity_key:'marketing'},'security_password_changed')).toBe(false);
 expect(isCredentialSecurityNotice({identity_key:'security'},'newsletter')).toBe(false);
});
