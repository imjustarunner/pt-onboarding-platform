import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),staff:vi.fn(),mailbox:vi.fn(),send:vi.fn(),create:vi.fn(),link:vi.fn(),add:vi.fn(),update:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/CommunicationConversation.model.js',()=>({default:{create:m.create,upsertLink:m.link,addMessage:m.add,updateMessage:m.update}}));
vi.mock('../schoolContactPlan.service.js',()=>({SCHOOL_CONTACT_TEST_INBOX:'testing@itsco.health',schoolContactRouting:p=>({providerEmail:p.email})}));
vi.mock('../schoolContactStaffEmail.service.js',()=>({loadSchoolContactStaff:m.staff,schoolContactComposePath:(w,s)=>`/auricwell-qa-demo/email-compose?agencyId=${w.agency_id}&schoolContactWorkflowId=${w.id}&schoolStaffUserId=${s.userId}`}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({resolveMessagesSendMailbox:m.mailbox}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {sendSchoolContactProviderNotice} from '../schoolContactProviderNotice.service.js';
const workflow={id:42,agency_id:450,provider_user_id:1490,client_id:2298,school_id:451,school_name:'Cedar Grove'},ctx={userId:1490,provider:{first_name:'Quality',email:'qa-inbox@itsco.health'},agency:{name:'ITSCOLLC'}};
const decided='2026-10-31T12:00:00Z';
beforeEach(()=>{
 vi.clearAllMocks();m.staff.mockResolvedValue({attemptCount:3,completedPhases:{first:true,second:true,third:true},workflow:{...workflow,initials:'QACSSO'},contacts:[{userId:1465,name:'Jamie QA',email:'jamie@example.com'}]});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT DISTINCT')?[[{id:1434,email:'support@example.com'},{id:1438,email:'supervisor@example.com'},{id:1490,email:'qa-inbox@itsco.health'}]]:[[{status:'enabled',decided_at:decided,plan_decided_at:decided}]]);
 m.mailbox.mockResolvedValue({identity:{id:9,agency_id:450},inbox:{id:8},fromEmail:'messages@itsco.health'});m.create.mockResolvedValue({id:88});m.add.mockResolvedValue(77);m.send.mockResolvedValue({id:'receipt'});m.update.mockResolvedValue();
});
it('names only individually ROI-approved staff and provides in-app IDs-only compose links without emailing staff',async()=>{
 await expect(sendSchoolContactProviderNotice(workflow,ctx,{stepKey:'provider_notice'})).resolves.toMatchObject({sent:true,messageId:77});
 expect(m.staff).toHaveBeenCalledWith({agencyId:450,providerUserId:1490,workflowId:42});
 expect(m.add).toHaveBeenCalledWith(expect.objectContaining({to:[{email:'qa-inbox@itsco.health'}],cc:[{email:'support@example.com'},{email:'supervisor@example.com'}]}));
 const sent=m.send.mock.calls[0][0];expect(sent.to).toBe('testing@itsco.health');expect(sent.cc).toBe('testing@itsco.health');expect(sent.text).toContain('Jamie QA — jamie@example.com');expect(sent.text).toContain('schoolContactWorkflowId=42&schoolStaffUserId=1465');expect(sent.text).toContain('client initials');expect(sent.subject).toContain('QACSSO');expect(sent.text).toContain('does not authorize services');expect(sent.html).not.toContain('mailto:');
 const [sql,args]=m.execute.mock.calls[0];expect(args).toEqual([450,1490]);expect(sql).toContain('ua.is_active=1');expect(sql).toContain('sa.agency_id=ua.agency_id');expect(sql).toContain('sa.supervisee_id=?');expect(sql).toContain('u.terminated_at IS NULL');
});
it('does not invent staff contacts when the release authorizes no individual',async()=>{
 m.staff.mockResolvedValue({attemptCount:3,completedPhases:{first:true,second:true,third:true},workflow:{...workflow,initials:'QACSSO'},contacts:[]});await sendSchoolContactProviderNotice(workflow,ctx,{stepKey:'provider_notice'});expect(m.send.mock.calls[0][0].text).toContain('No school staff currently have an individual ROI permission');expect(m.send.mock.calls[0][0].text).not.toContain('schoolStaffUserId=');
});
it.each([0,1,2])('requires all three accepted contact phases before notifying the provider: %s',async count=>{
 m.staff.mockResolvedValue({attemptCount:count,workflow,contacts:[]});await expect(sendSchoolContactProviderNotice(workflow,ctx,{stepKey:'provider_notice'})).rejects.toMatchObject({code:'school_contact_attempts_incomplete'});expect(m.send).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('rejects an unrelated mailbox before creating any conversation or sending',async()=>{
 m.mailbox.mockResolvedValue({identity:{id:9,agency_id:999},inbox:{id:8}});await expect(sendSchoolContactProviderNotice(workflow,ctx,{stepKey:'provider_notice'})).rejects.toMatchObject({code:'school_contact_mailbox_missing'});expect(m.send).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('rechecks the provider contact plan before transport and marks the prepared copy failed if disabled',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT DISTINCT')?[[]]:[[{status:'declined',decided_at:decided,plan_decided_at:decided}]]);
 await expect(sendSchoolContactProviderNotice(workflow,ctx,{stepKey:'provider_notice'})).rejects.toMatchObject({code:'school_contact_plan_changed'});expect(m.send).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(77,{sendStatus:'failed'});
});
it.each([{reminder:true,hasGuardianReply:false},{reminder:false,hasGuardianReply:true}])('does not misstate no response on a documentation reminder or after a later guardian reply: %o',async flags=>{
 const state=await m.staff();m.staff.mockResolvedValue({...state,hasGuardianReply:flags.hasGuardianReply});await sendSchoolContactProviderNotice(workflow,ctx,{reminder:flags.reminder,stepKey:flags.reminder?'intake_reminder_42':'provider_notice'});const email=m.send.mock.calls[0][0];expect(email.text).toContain('still awaits finalized documentation');expect(email.text).not.toContain('without a documented reply');expect(email.html).not.toContain('without a documented reply');
});
