import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),persist:vi.fn(),rsvp:vi.fn(),send:vi.fn(),reminderRecipient:vi.fn(async()=>null)}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../messageReminderRecipient.service.js',()=>({messageReminderRecipient:m.reminderRecipient}));
vi.mock('../supervisionRsvp.service.js',()=>({saveSupervisionRsvp:m.rsvp}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async()=>({email:'person@itsco.health'})}));
vi.mock('../personalMailbox.service.js',()=>({ensurePersonalMailbox:async({userId})=>({id:userId,from_email:'host@itsco.health'})}));
vi.mock('../inboundEmailPersistence.service.js',()=>({persistInboundEmail:m.persist}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantMessageMailboxes:async()=>({notifications:{id:6}})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {ingestSupervisionReply,forwardUnreadSupervisionReplies,saveHuddleReplyRsvp} from '../supervisionEmailReplies.service.js';
const session={id:10,agency_id:2,supervisor_user_id:3,co_facilitator_user_id:null,status:'SCHEDULED',start_at:'2099-01-01 12:00:00'};
const reply={identityId:6,fromEmail:'person@itsco.health',inReplyTo:'<invitation@test>',messageId:'<reply@test>',subject:'Re: Supervision',bodyText:"I'm out sick today.",receivedAt:new Date(),authenticationResults:'mx.google.com; dmarc=pass header.from=itsco.health'};
beforeEach(()=>{vi.clearAllMocks();m.persist.mockResolvedValue({messageId:100,conversationId:200});m.send.mockResolvedValue({id:'sent',communicationId:300});m.execute.mockImplementation(async sql=>{
 if(sql.includes('FROM email_sender_identities'))return [[{agency_id:2}]];
 if(sql.includes('FROM supervision_email_deliveries'))return [[{session_id:10,user_id:8}]];
 if(sql.includes('SELECT * FROM supervision_sessions'))return [[session]];
 if(sql.includes('SELECT u.*'))return [[{id:8,email:'person@itsco.health'}]];
 if(sql.startsWith('SELECT conversation_id'))return [[]];
 return [{affectedRows:1}];
});});
it('stores an authenticated excuse only in the host inbox and declines the participant',async()=>{expect(await ingestSupervisionReply(reply)).toEqual({ingested:true,response:'declined'});expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:3,agencyId:2,bodyText:reply.bodyText}));expect(m.rsvp).toHaveBeenCalledWith({sessionId:10,userId:8,response:'declined'});expect(m.send).not.toHaveBeenCalled();});
it('keeps an unverified reply for the host without changing attendance',async()=>{await ingestSupervisionReply({...reply,authenticationResults:'dmarc=fail header.from=itsco.health'});expect(m.persist).toHaveBeenCalled();expect(m.rsvp).not.toHaveBeenCalled();});
it('does not accept a different sender or ambiguous session',async()=>{expect((await ingestSupervisionReply({...reply,fromEmail:'stranger@itsco.health'})).ingested).toBe(false);expect(m.persist).not.toHaveBeenCalled();});
it('does not replay an old decline over a newer manual RSVP',async()=>{m.persist.mockResolvedValue({messageId:100,conversationId:200,duplicate:true});await ingestSupervisionReply(reply);expect(m.rsvp).not.toHaveBeenCalled();});
it('forwards only rows due by the unread/24-hour query and claims each once',async()=>{
 const row={message_id:100,host_user_id:3,agency_id:2,from_json:{email:'person@itsco.health'},body_text:'Out sick',subject:'Supervision'};
 m.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 const now=new Date();await forwardUnreadSupervisionReplies(now);
 const query=m.execute.mock.calls[0];expect(query[0]).toContain('DATE_SUB(?,INTERVAL 24 HOUR)');expect(query[0]).toContain('s.start_at<=DATE_ADD(?,INTERVAL 24 HOUR)');expect(query[0]).toContain('r.last_read_at<f.received_at');expect(query[0]).toContain('answer.author_user_id=f.host_user_id');expect(query[1]).toEqual([now,now]);
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:6,replyToOverride:'person@itsco.health',userId:3}));
 m.send.mockClear();m.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{affectedRows:0}]);await forwardUnreadSupervisionReplies(now);expect(m.send).not.toHaveBeenCalled();
});

it('updates a huddle RSVP only while the recipient remains invited to an active future huddle',async()=>{
 await saveHuddleReplyRsvp({eventId:7,userId:8,response:'declined'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("p.kind='HUDDLE' AND p.status='ACTIVE' AND p.start_at>UTC_TIMESTAMP()"),['declined',8,7]);
 m.execute.mockResolvedValueOnce([{affectedRows:0}]);await expect(saveHuddleReplyRsvp({eventId:7,userId:9,response:'declined'})).rejects.toMatchObject({status:410});
});

it('delegates non-SSO personal notifications to the configurable inbox reminder instead of forwarding independently',async()=>{
 const row={message_id:100,host_user_id:3,agency_id:2,personal_email:'private@example.org'};
 m.execute.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 m.reminderRecipient.mockResolvedValueOnce(row.personal_email);
 await forwardUnreadSupervisionReplies();expect(m.send).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("delivery_status='inbox_reminder'"),[100,3]);
});
