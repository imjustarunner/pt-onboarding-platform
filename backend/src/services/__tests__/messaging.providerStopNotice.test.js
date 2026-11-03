import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),send:vi.fn(),agency:vi.fn(),identities:vi.fn(),domain:vi.fn(),off:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.query,getConnection:async()=>({execute:m.execute,release:vi.fn()})}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:m.identities}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:m.domain}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../exchangeSmsPreference.service.js',()=>({exchangeSmsOptedOut:m.off}));
import {deliverProviderStopNotice,processProviderStopNotices} from '../providerSmsStopNotice.service.js';
import {isRequiredProviderWorkEmail} from '../requiredProviderWorkEmail.service.js';
let status,job;
beforeEach(()=>{
 vi.clearAllMocks();status='pending';job={id:1,user_id:7,agency_id:2,permission_event_id:99,phone:'+13035550101',stopped_at:'2026-11-02T18:00:00Z',evidence_json:{senderNumber:'+13035550100',provider:'vonage'}};
 m.agency.mockResolvedValue({id:2,name:'Test Agency',slug:'agency',feature_flags:{}});
 m.identities.mockResolvedValue([{id:4,agency_id:2,identity_key:'notifications',from_email:'notifications@example.com'}]);
 m.domain.mockResolvedValue('example.com');m.off.mockResolvedValue(false);m.send.mockResolvedValue({id:'message1',communicationId:81});
 m.query.mockResolvedValue([[]]);
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('FROM provider_sms_stop_notices n'))return [status==='pending'?[job]:[]];
  if(sql.includes('FROM users u'))return [[{id:7,role:'provider',first_name:'Demo',last_name:'Provider',work_email:'provider@example.com',notification_categories:{staff_communications_2:{choices:{exchangeMatches:true,messageAlerts:true}}}}]];
  if(sql.includes('FROM supervisor_assignments'))return [[{work_email:'supervisor@example.com'},{work_email:'supervisor@example.com'}]];
  if(sql.includes("SET status='sending'"))status='sending';
  if(sql.includes('SET status=?'))status=args[0];
  return [{affectedRows:1}];
 });
});
it('sends one branded provider email with supervisor and agency Admin copied',async()=>{
 await deliverProviderStopNotice(1);await deliverProviderStopNotice(1);
 expect(m.send).toHaveBeenCalledOnce();expect(status).toBe('sent');
 expect(m.send.mock.calls[0][0]).toMatchObject({to:'provider@example.com',cc:'admin@example.com, supervisor@example.com',replyToOverride:'admin@example.com',templateType:'provider_sms_stopped'});
 const mail=m.send.mock.calls[0][0];expect(mail.text).toContain('phone ending 0101');expect(mail.text).toContain('New matching clients in Client Exchange');
 expect(mail.text).not.toContain(job.phone);expect(mail.html).toContain('data-portal-email="v2"');
 expect(m.execute.mock.calls.find(([sql])=>sql.includes('FROM supervisor_assignments'))[1]).toEqual([7,2]);
});
it('still copies Admin if there is no assigned supervisor',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('FROM supervisor_assignments')?Promise.resolve([[]]):original(sql,args));
 await deliverProviderStopNotice(1);expect(m.send.mock.calls[0][0].cc).toBe('admin@example.com');
});
it('does not replay old STOP events or email for NOEXCHANGE',async()=>{
 await processProviderStopNotices();const sql=m.query.mock.calls[0][0];
 expect(sql).toContain("e.purpose='suppression'");expect(sql).toContain("e.status='opted_out'");
 expect(sql).toContain("$.providerNoticeRequested");expect(sql).toContain('n.id IS NULL');expect(m.send).not.toHaveBeenCalled();
});
it('leaves an ambiguous email outcome for review without retrying the send',async()=>{
 m.send.mockRejectedValueOnce(new Error('response lost'));
 await deliverProviderStopNotice(1);await deliverProviderStopNotice(1);
 expect(status).toBe('needs_review');expect(m.send).toHaveBeenCalledOnce();
});
it('keeps missing configuration retryable without claiming delivery',async()=>{
 m.domain.mockResolvedValue(null);await deliverProviderStopNotice(1);
 expect(status).toBe('pending');expect(m.send).not.toHaveBeenCalled();
});
it('keeps isolated QA notices from reaching production administration',async()=>{
 m.agency.mockResolvedValue({id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}});
 await deliverProviderStopNotice(1);expect(m.send).not.toHaveBeenCalled();
});
it('treats the STOP notice as required only for the provider’s own work email',async()=>{
 const args={templateType:'provider_sms_stopped',userId:7,agencyId:2,to:'provider@example.com'};
 const load=async()=>({member:true,user:{role:'provider',work_email:args.to,is_active:1}});
 expect(await isRequiredProviderWorkEmail(args,load)).toBe(true);
 expect(await isRequiredProviderWorkEmail({...args,to:'personal@example.com'},load)).toBe(false);
});
