import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),persist:vi.fn(),attachments:vi.fn(),workspace:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../inboundEmailPersistence.service.js',()=>({persistInboundEmail:m.persist}));
vi.mock('../communicationAttachments.service.js',()=>({prepareInboundAttachments:m.attachments}));
vi.mock('../../utils/gmailMessageParse.shared.js',async importOriginal=>({...await importOriginal(),readGmailBodyHtml:vi.fn(async()=>'<p>Yes, please call.</p>')}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({getWorkspaceClientsForEmployee:m.workspace}));
import {ingestSchoolContactWorkReply,syncSchoolContactWorkReplies,schoolContactWorkMailboxAvailable,authenticatedSchoolContactSender} from '../schoolContactReplyRouting.service.js';
const identity={id:71,agency_id:450,from_email:'qa-inbox@itsco.health',owner_user_id:1490};
const incoming={identityId:71,fromEmail:'guardian@example.org',toAddresses:['qa-inbox@itsco.health'],ccAddresses:[],
 gmailPayload:{headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'}]},
 inReplyTo:'<school-contact-42-initial_email@itsco.health>',referencesHeader:'<school-contact-42-initial_email@itsco.health>',
 messageIdHeader:'<guardian-reply@example.org>',subject:'Re: School introduction',bodyText:'Yes, please call.',receivedAt:new Date('2026-11-02T18:00:00Z')};
beforeEach(()=>{
 vi.clearAllMocks();
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT esi.id')?[[identity]]:[[{conversation_id:81,inbox_id:12,workflow_id:42}]]);
 m.attachments.mockResolvedValue([]);m.persist.mockResolvedValue({ingested:true,conversationId:81,messageId:92});
});
it('files only the exact guardian reply received at the configured SSO work mailbox into the existing contact conversation',async()=>{
 expect(await ingestSchoolContactWorkReply(incoming)).toMatchObject({ingested:true,conversationId:81});
 expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({agencyId:450,inboxId:12,conversationId:81,ownerUserId:1490,
   fromEmail:'guardian@example.org',deliveryId:'<guardian-reply@example.org>',bodyText:'Yes, please call.',bodyHtml:'<p>Yes, please call.</p>',
   to:[{email:'qa-inbox@itsco.health'}],inReplyTo:incoming.inReplyTo,receivedAt:incoming.receivedAt}));
 const [sql,args]=m.execute.mock.calls[1];
 expect(sql).toContain('m.internet_message_id=?');expect(sql).toContain("$.schoolContactAutomation.workflowId");
 expect(sql).toContain("JSON_CONTAINS(LOWER(CAST(m.to_json AS CHAR)),JSON_OBJECT('email',?))");
 expect(args).toEqual([450,1490,1490,incoming.inReplyTo,1490,'qa-inbox@itsco.health','guardian@example.org','guardian@example.org','guardian@example.org']);
});
it('leaves ordinary SSO email alone even when its subject and sender resemble a known client',async()=>{
 expect(await ingestSchoolContactWorkReply({...incoming,inReplyTo:null,referencesHeader:null})).toEqual({ingested:false});
 expect(m.execute).not.toHaveBeenCalled();expect(m.persist).not.toHaveBeenCalled();
});
it('does not use a work address copied into CC or an unrelated receiving mailbox',async()=>{
 expect(await ingestSchoolContactWorkReply({...incoming,toAddresses:['other@itsco.health'],ccAddresses:['qa-inbox@itsco.health']})).toEqual({ingested:false});
 expect(m.persist).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledOnce();
});
it('rejects inactive or nonSSO mailbox identities before looking for a client conversation',async()=>{
 m.execute.mockResolvedValue([[]]);expect(await ingestSchoolContactWorkReply(incoming)).toEqual({ingested:false});
 expect(m.persist).not.toHaveBeenCalled();
 const sql=m.execute.mock.calls[0][0];expect(sql).toContain('COALESCE(u.sso_password_override,0)=0');
 expect(sql).toContain('ua.agency_id=i.agency_id AND ua.is_active=1');expect(sql).toContain("esi.identity_key=CONCAT('personal_',u.id)");
});
it('requires the original outbound guardian recipient, agency, current owner, workflow, and saved Reply-To',async()=>{
 m.execute.mockResolvedValueOnce([[identity]]).mockResolvedValue([[]]);
 expect(await ingestSchoolContactWorkReply({...incoming,fromEmail:'other@example.org'})).toEqual({ingested:false});expect(m.persist).not.toHaveBeenCalled();
 const sql=m.execute.mock.calls[1][0];expect(sql).toContain('w.agency_id=c.agency_id');expect(sql).toContain('c.owner_user_id=?');
 expect(sql).toContain("$.replyTo");expect(sql).toContain("m.send_status IN ('sent','delivered')");
 expect(sql).toContain('cg.access_enabled=1');expect(sql).toContain("$.noView'");expect(sql).toContain("$.noViewOtherGuardian'");
 expect(sql).toContain('COALESCE(guardian.is_active,1)=1');expect(sql).toContain('COALESCE(guardian.is_archived,0)=0');
});
it('fails closed when different RFC ancestors identify different client conversations',async()=>{
 m.execute.mockResolvedValueOnce([[identity]]).mockResolvedValueOnce([[{conversation_id:81,inbox_id:12}]])
   .mockResolvedValueOnce([[{conversation_id:99,inbox_id:12}]]);
 expect(await ingestSchoolContactWorkReply({...incoming,referencesHeader:'<different@example.org>'})).toMatchObject({ingested:false});
 expect(m.persist).not.toHaveBeenCalled();expect(m.attachments).not.toHaveBeenCalled();
});
it('retains receipt deduplication from the canonical conversation instead of creating another thread',async()=>{
 m.persist.mockResolvedValue({ingested:true,duplicate:true,conversationId:81,messageId:92});
 expect(await ingestSchoolContactWorkReply(incoming)).toMatchObject({duplicate:true,conversationId:81,messageId:92});
 expect(m.persist).toHaveBeenCalledOnce();
});

it('verifies the exact delegated work mailbox profile and fails safely when delegation is absent',async()=>{
 m.workspace.mockRejectedValueOnce(Object.assign(new Error('No delegated access'),{code:403}));
 expect(await schoolContactWorkMailboxAvailable('unavailable@itsco.health')).toBe(false);
 m.workspace.mockResolvedValueOnce({gmail:{users:{getProfile:vi.fn(async()=>({data:{emailAddress:'wrong@itsco.health'}}))}}});
 expect(await schoolContactWorkMailboxAvailable('mismatched@itsco.health')).toBe(false);
});

it('polls only known workflow RFC threads, validates headers before reading content, and never marks Gmail messages read',async()=>{
 const address='school-sync@itsco.health',anchor='<school-contact-42-initial_email@itsco.health>';
 const headers=[{name:'From',value:'Guardian <guardian@example.org>'},{name:'To',value:address},
   {name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'},
   {name:'Message-ID',value:'<new-guardian-reply@example.org>'},{name:'In-Reply-To',value:anchor}];
 const gmail={users:{
   getProfile:vi.fn(async()=>({data:{emailAddress:address}})),
   threads:{get:vi.fn(async()=>({data:{messages:[{id:'reply',payload:{headers}}]}}))},
   messages:{
     list:vi.fn(async()=>({data:{messages:[{id:'anchor',threadId:'only-known-thread'}]}})),
     get:vi.fn(async()=>({data:{internalDate:Date.parse('2026-11-02T18:00:00Z'),payload:{
       headers:[...headers,{name:'Subject',value:'Re: Introduction'}],body:{data:Buffer.from('Yes, please call.').toString('base64url')}
     }}})),modify:vi.fn()
   }
 }};
 m.workspace.mockResolvedValue({gmail});
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT DISTINCT m.id')?[[{id:50,internet_message_id:anchor,conversation_id:81,identity_id:71,from_email:address}]]:
   sql.startsWith('SELECT esi.id')?[[{...identity,from_email:address}]]:sql.startsWith('SELECT id FROM communication_messages')?[[]]:[[{conversation_id:81,inbox_id:12,workflow_id:42}]]);
 expect(await syncSchoolContactWorkReplies()).toEqual({checked:1,ingested:1});
 expect(m.workspace).toHaveBeenCalledWith({subjectEmail:address});
 expect(gmail.users.messages.list).toHaveBeenCalledExactlyOnceWith({userId:'me',q:'rfc822msgid:school-contact-42-initial_email@itsco.health',maxResults:2});
 expect(gmail.users.threads.get).toHaveBeenCalledWith(expect.objectContaining({id:'only-known-thread',format:'metadata'}));
 expect(gmail.users.messages.get).toHaveBeenCalledExactlyOnceWith({userId:'me',id:'reply',format:'full'});
 expect(m.execute.mock.invocationCallOrder[2]).toBeLessThan(gmail.users.messages.get.mock.invocationCallOrder[0]);
 expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({conversationId:81,bodyText:'Yes, please call.',fromEmail:'guardian@example.org'}));
 expect(gmail.users.messages.modify).not.toHaveBeenCalled();
});

it('never fetches a message body for an automated response or unrecognized guardian/thread',async()=>{
 const address='guarded-sync@itsco.health',anchor='<school-contact-42-second_contact@itsco.health>';
 const gmail={users:{getProfile:vi.fn(async()=>({data:{emailAddress:address}})),threads:{get:vi.fn(async()=>({data:{messages:[
   {id:'auto',payload:{headers:[{name:'Message-ID',value:'<auto@example.org>'},{name:'Auto-Submitted',value:'auto-replied'}]}},
   {id:'unrelated',payload:{headers:[{name:'Message-ID',value:'<other@example.org>'},{name:'From',value:'stranger@example.org'},{name:'To',value:address},{name:'In-Reply-To',value:anchor},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'}]}},
   {id:'spoofed',payload:{headers:[{name:'Message-ID',value:'<spoof@example.org>'},{name:'From',value:'guardian@example.org'},{name:'To',value:address},{name:'In-Reply-To',value:anchor},{name:'Authentication-Results',value:'mx.google.com; dmarc=fail header.from=example.org'}]}}
 ]}}))},messages:{list:vi.fn(async()=>({data:{messages:[{id:'anchor',threadId:'known'}]}})),get:vi.fn()}}};
 m.workspace.mockResolvedValue({gmail});m.execute.mockImplementation(async sql=>sql.startsWith('SELECT DISTINCT m.id')?[[{id:51,internet_message_id:anchor,conversation_id:81,identity_id:71,from_email:address}]]:
   sql.startsWith('SELECT esi.id')?[[{...identity,from_email:address}]]:[[]]);
 expect(await syncSchoolContactWorkReplies()).toEqual({checked:1,ingested:0});expect(gmail.users.messages.get).not.toHaveBeenCalled();expect(m.persist).not.toHaveBeenCalled();
});

it.each([
 {headers:[]},
 {headers:[{name:'Authentication-Results',value:'sender.example; dmarc=pass header.from=example.org'}]},
 {headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=other.example'}]},
 {headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=fail header.from=example.org'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'}]}
])('does not accept an unauthenticated or spoofed known-guardian From: $headers',async({headers})=>{
 expect(authenticatedSchoolContactSender(headers,'guardian@example.org')).toBe(false);
 expect(await ingestSchoolContactWorkReply({...incoming,gmailPayload:{headers}})).toEqual({ingested:false});
 expect(m.execute).not.toHaveBeenCalled();expect(m.attachments).not.toHaveBeenCalled();expect(m.persist).not.toHaveBeenCalled();
});
