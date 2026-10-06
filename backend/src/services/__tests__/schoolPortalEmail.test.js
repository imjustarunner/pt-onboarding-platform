import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),member:vi.fn(),mailbox:vi.fn(),send:vi.fn(),create:vi.fn(),add:vi.fn(),updateMessage:vi.fn(),update:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{query:m.query,execute:m.execute}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:async()=>2}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{getClient:async()=>({members:{get:m.member}})}}));
vi.mock('../schoolGroupSubscription.service.js',()=>({resolveGroupEmailForSchool:async()=> 'school@example.org'}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({resolveMessagesSendMailbox:m.mailbox}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../../models/CommunicationConversation.model.js',()=>({default:{create:m.create,addMessage:m.add,updateMessage:m.updateMessage,update:m.update,upsertLink:vi.fn(),upsertParticipant:vi.fn()}}));
import {schoolEmailContext,getSchoolEmail,listSchoolEmails,sendSchoolEmail,markSchoolEmailRead} from '../schoolPortalEmail.service.js';
const ctx={agencyId:2,orgId:440,userId:42,email:'staff@example.org',groupEmail:'school@example.org',name:'School Staff',schoolName:'Example School'};
beforeEach(()=>{
 vi.clearAllMocks();m.member.mockResolvedValue({data:{delivery_settings:'NONE'}});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT name')?[[{name:'Example School',organization_type:'school'}]]:sql.includes('SELECT id,email')?[[{id:42,email:'staff@example.org'}]]:[[]]);
 m.mailbox.mockResolvedValue({identity:{id:7,from_email:'messages@itsco.health'},inbox:{id:19}});m.create.mockResolvedValue({id:900});m.add.mockResolvedValue(901);m.send.mockResolvedValue({id:'gmail-id',internetMessageId:'<sent@example.org>',threadId:'thread'});m.updateMessage.mockResolvedValue({});m.update.mockResolvedValue({});
});
it('denies users without school access before reading any email or consulting Google',async()=>{
 await expect(schoolEmailContext({organizationId:440,user:{id:42,role:'school_staff'},checkAccess:async()=>false})).rejects.toMatchObject({status:403});expect(m.query).not.toHaveBeenCalled();expect(m.member).not.toHaveBeenCalled();
});
it('keeps group email available when the member selects No email',async()=>{
 const result=await schoolEmailContext({organizationId:440,user:{id:42,role:'school_staff'},checkAccess:async()=>true});expect(result.groupEmail).toBe('school@example.org');
});
it('does not confuse portal membership with group membership',async()=>{
 m.member.mockRejectedValue({code:404});await expect(schoolEmailContext({organizationId:440,user:{id:42,role:'school_staff'},checkAccess:async()=>true})).rejects.toMatchObject({status:403});
});
it('fails closed if Google cannot verify group access',async()=>{
 m.member.mockRejectedValue({code:503});await expect(schoolEmailContext({organizationId:440,user:{id:42,role:'school_staff'},checkAccess:async()=>true})).rejects.toMatchObject({status:503});
});
it('uses the same school, recipient, private-recipient, and internal-note exclusions on detail and list',async()=>{
 m.query.mockResolvedValueOnce([[{total:0,unread:0}]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
 await listSchoolEmails(ctx);await expect(getSchoolEmail(ctx,999)).rejects.toMatchObject({status:404});
 for(const [sql,args] of m.query.mock.calls){expect(sql).toContain('c.agency_id = ?');expect(sql).toContain('COALESCE(m.is_internal_note,0) = 0');expect(sql).not.toContain('OR c.owner_user_id');expect(sql).not.toContain('OR m.author_user_id');expect(sql).toContain('JSON_CONTAINS');expect(args).toContain('school@example.org');expect(args).not.toContain('staff@example.org');}
});
it('marks only the exact opened email as read',async()=>{
 m.query.mockResolvedValue([[{id:8,conversation_id:10,subject:'Earlier message',created_at:'2026-10-05 12:00:00',body_text:'Hello'}]]);
 await markSchoolEmailRead(ctx,8);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO school_portal_email_reads'),[440,42,expect.stringMatching(/^[a-f0-9]{64}$/)]);
});
it('sends from the server-selected messages identity and copies only its own school group',async()=>{
 const result=await sendSchoolEmail(ctx,{to:'recipient@example.org',subject:'School update',body:'Hello',senderIdentityId:999});
 expect(result.sent).toBe(true);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:42,agencyId:2}));expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:7,to:'recipient@example.org',cc:'school@example.org',generatedByUserId:42,replyToOverride:'school@example.org'}));
});
it('never claims a redirected or held email was delivered',async()=>{
 m.send.mockResolvedValue({id:'test-delivery',redirected:true});await expect(sendSchoolEmail(ctx,{to:'recipient@example.org',subject:'Update',body:'Hello'})).rejects.toMatchObject({status:502});expect(m.updateMessage).toHaveBeenCalledWith(901,{sendStatus:'failed'});
});
it('does not send a reply to an inaccessible source email',async()=>{
 m.query.mockResolvedValue([[]]);await expect(sendSchoolEmail(ctx,{to:'recipient@example.org',subject:'Reply',body:'Hello',replyMessageId:999})).rejects.toMatchObject({status:404});expect(m.send).not.toHaveBeenCalled();
});
it.each(['one@example.org,two@example.org','x@example.org\r\nBcc: third@example.org'])('rejects recipient injection: %s',async to=>{
 await expect(sendSchoolEmail(ctx,{to,subject:'Update',body:'Hello'})).rejects.toMatchObject({status:400});expect(m.send).not.toHaveBeenCalled();
});
