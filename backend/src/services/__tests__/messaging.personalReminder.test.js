vi.mock('../tenantMessageMailboxes.service.js',()=>({resolveMessagesSendMailbox:vi.fn(async()=>({identity:{id:44},fromEmail:'messages@itsco.health',replyTo:'messages@itsco.health',displayName:'ITSCO Messages'}))}));
vi.mock('../personalMessageThreadPolicy.service.js',()=>({personalThreadCanReply:vi.fn(async()=>true)}));
vi.mock('../inboundEmailPersistence.service.js',()=>({persistInboundEmail:vi.fn(async()=>({ingested:true,messageId:81}))}));
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, slug: 'itsco', name: 'ITSCO' })) } }));
vi.mock('../emailSendMailbox.service.js', () => ({ resolveEmailSendMailbox: vi.fn(async () => ({ identity: { id: 4 }, displayName: 'Staff' })) }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn(async () => ({ id: 'gmail-id' })) }));
vi.mock('../availabilityWindow.service.js', () => ({ resolveAvailabilitySchedule: vi.fn(async () => ({ timezone: 'America/Denver' })) }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getUser: vi.fn(async () => null), getGroup: vi.fn(async () => ({ id: 'group' })) } }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: vi.fn(async () => ({})) }));
vi.mock('../unifiedInbox.service.js', () => ({ isAddressBlocked: vi.fn(async () => false) }));
import pool from '../../config/database.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { getAgencyEmailSettings } from '../emailSettings.service.js';
import { runPersonalThreadReminders, queuePersonalReminderReply, resolvePersonalReminderMailbox, personalReplySendMailbox } from '../personalThreadReminder.service.js';
import { personalReminderReplyText, personalReminderBody } from '../../utils/personalReminderReply.js';
import { validateOutboundEmailQuality } from '../outboundEmailQuality.service.js';
const inbox = { id: 3, agency_id: 2, owner_user_id: 5, from_email: 'staff@itsco.health' };
const reminder = { role:'provider',email:'provider@itsco.health',sso_password_override:1,login_is_group_email:1,reply_allowed:1,personal_email_notify:1,personal_email_delivery_mode:'forward_one_to_one', id: 1, user_id: 5, user_status: 'active', personal_email: 'private@example.org', conversation_id: 10, from_json: { email: 'client@example.org' }, parent_id: '<external@example.org>', parent_references: '<root@example.org>', subject: 'Meeting' };
const provider = { role: 'provider', email: 'provider@itsco.health', personal_email: 'private@example.org', sso_password_override: 1, login_is_group_email: 1 };
const reply = { gmailPayload:{headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.org'}]}, inbox, fromEmail: 'private@example.org', deliveryId: '<reply@example.org>', bodyText: 'Confirmed.\n\nOn Monday Staff wrote:\n> Notification', inReplyTo: '<reminder@itsco.health>' };
beforeEach(() => vi.clearAllMocks());
it('removes quoted private headers and replaces a private address in the new reply', () => {
  expect(personalReminderReplyText('Contact private@example.org\n\nOn Monday,\nStaff wrote:\n> To: private@example.org', 'private@example.org', inbox.from_email)).toBe('Contact staff@itsco.health');
});
it('does not turn an unrelated personal email into an outbound staff reply', async () => {
  pool.execute.mockResolvedValue([[]]);
  expect(await queuePersonalReminderReply(reply)).toBeNull();
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rejects a different sender who quotes the reminder reference', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  await expect(queuePersonalReminderReply({ ...reply, fromEmail: 'other@example.org' })).rejects.toThrow('mailbox owner');
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('queues the reply and receipt together using the original external RFC parent and work identity', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => sql.startsWith('INSERT INTO communication_messages') ? [{ insertId: 80 }] : [[]]) };
  pool.getConnection.mockResolvedValue(db);
  const result = await queuePersonalReminderReply(reply);
  expect(result).toMatchObject({ conversationId: 10, messageId: 80, queuedPersonalReply: true });
  const insert = db.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO communication_messages'));
  expect(insert[1]).toEqual([10, 5, JSON.stringify({ email: 'messages@itsco.health' }), JSON.stringify([{ email: 'client@example.org' }]), '[]', '[]', 'Re: Meeting', 'Confirmed.', '<external@example.org>', '<root@example.org> <external@example.org>', 1]);
  expect(db.commit).toHaveBeenCalledOnce();
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('deduplicates a re-delivered personal reply before creating an outbound message', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => sql.includes('SELECT message_id') ? [[{ message_id: 80 }]] : [[]]) };
  pool.getConnection.mockResolvedValue(db);
  expect(await queuePersonalReminderReply(reply)).toMatchObject({ duplicate: true, messageId: 80 });
  expect(db.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('sends a claimed per-thread reminder after one business day with an exact normal-login destination', async () => {
  const row = { ...provider, conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, sender_identity_id: 4, from_email: inbox.from_email, personal_email: reminder.personal_email, subject: 'Meeting', received_at: '2026-09-01T16:00:00Z', availability_hours_enabled: 0 };
  pool.execute.mockImplementation(async (sql) => sql.startsWith('SELECT c.id') ? [[row]] : [{ affectedRows: 1 }]);
  expect(await runPersonalThreadReminders({ now: new Date('2026-09-02T16:00:00Z') })).toMatchObject({ sent: 1 });
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ to: reminder.personal_email, replyToOverride: expect.stringMatching(/^messages\+p-[a-f0-9]{48}@itsco.health$/), senderIdentityId:44, text: expect.stringContaining('messages?conversationId=10'), internetMessageIdOverride: expect.stringMatching(/^<.+@itsco.health>$/) }));
  expect(sendEmailFromIdentity.mock.calls[0][0].subject).toBe('You have messages waiting');
  expect(sendEmailFromIdentity.mock.calls[0][0].html).not.toContain('Meeting');
  // Exercise the actual branded footer through the real outbound validator:
  // mocking the renderer hid an attachment false positive in every reminder.
  expect(validateOutboundEmailQuality(sendEmailFromIdentity.mock.calls[0][0])).toEqual({ ok: true, flags: [] });
});
it('does not send early or send again when another worker owns the reminder claim', async () => {
  const row = { ...provider, conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, from_email: inbox.from_email, received_at: '2026-09-01T16:00:00Z', availability_hours_enabled: 0 };
  pool.execute.mockImplementation(async (sql) => sql.startsWith('SELECT c.id') ? [[row]] : [{ affectedRows: 0 }]);
  await runPersonalThreadReminders({ now: new Date('2026-09-02T15:59:59Z') });
  await runPersonalThreadReminders({ now: new Date('2026-09-02T16:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});

it('extracts only the new HTML reply and excludes quoted notification and text attachments', async () => {
  const html = '<p>Confirmed &amp; thank you.</p><div class="gmail_quote"><p>Private notification</p></div>';
  const payload = { parts: [{ mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url') } }, { mimeType: 'text/plain', filename: 'notes.txt', body: { data: Buffer.from('Attachment content').toString('base64url') } }] };
  expect(await personalReminderBody(payload)).toBe('Confirmed & thank you.');
});

it('preserves a saved personal delay instead of overriding it with the tenant default', async () => {
  getAgencyEmailSettings.mockResolvedValue({ personalEmailDigestBusinessHours: 24 });
  pool.execute.mockResolvedValue([[{ ...provider, conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, from_email: inbox.from_email, received_at: '2026-09-01T16:00:00Z', availability_hours_enabled: 0, digest_hours: 48 }]]);
  await runPersonalThreadReminders({ now: new Date('2026-09-02T16:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});

it('never sends a personal email reminder for an SSO account even if an old candidate row is returned', async () => {
  pool.execute.mockResolvedValue([[{ ...provider, sso_password_override: 0, login_is_group_email: 0, from_email: inbox.from_email, agency_id: 2, user_id: 5, received_at: '2026-09-01T16:00:00Z' }]]);
  await runPersonalThreadReminders({ now: new Date('2026-09-02T16:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});

import {personalThreadCanReply} from '../personalMessageThreadPolicy.service.js';
import {persistInboundEmail} from '../inboundEmailPersistence.service.js';
it('forwards one-to-one content only with the explicit preference, and never group content',async()=>{
 const row={...provider,conversation_id:10,message_id:20,agency_id:2,inbox_id:3,user_id:5,from_email:inbox.from_email,received_at:'2026-09-01T16:00:00Z',body_text:'Private one-to-one content. See attached.',personal_email_delivery_mode:'forward_one_to_one'};
 pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT c.id')?[[row]]:[{affectedRows:1}]);
 await runPersonalThreadReminders({now:new Date('2026-09-02T16:00:00Z')});
 expect(sendEmailFromIdentity).toHaveBeenLastCalledWith(expect.objectContaining({templateType:'personal_thread_forward',text:expect.stringContaining(row.body_text)}));
 expect(validateOutboundEmailQuality(sendEmailFromIdentity.mock.calls.at(-1)[0])).toEqual({ok:true,flags:[]});
 expect(validateOutboundEmailQuality({text:row.body_text,templateType:'hub_email'}).flags[0].code).toBe('missing_attachment');
 personalThreadCanReply.mockResolvedValueOnce(false);
 await runPersonalThreadReminders({now:new Date('2026-09-02T16:00:00Z')});
 const group=sendEmailFromIdentity.mock.calls.at(-1)[0];expect(group.templateType).toBe('personal_thread_reminder');expect(group.text).not.toContain(row.body_text);expect(group.text).toContain('notification only');
});
it('keeps notification-only, opt-out, group, extra-recipient, and unauthenticated replies inside the app',async()=>{
 const cases=[{record:{reply_allowed:0}},{record:{personal_email_notify:0}},{record:{personal_email_delivery_mode:'notification'}},{input:{gmailPayload:null}},{input:{cc:['other@example.org']}},{input:{cc:['messages@unrelated.example']}},{group:true}];
 for(const c of cases){
   pool.execute.mockResolvedValue([[{...reminder,...c.record}]]);
   if(c.group)personalThreadCanReply.mockResolvedValueOnce(false);
   pool.getConnection.mockClear();
   expect(await queuePersonalReminderReply({...reply,...c.input})).toMatchObject({personalReplyHeld:true});
   expect(pool.getConnection).not.toHaveBeenCalled();
 }
 expect(persistInboundEmail).toHaveBeenCalledWith(expect.objectContaining({internalNote:true,fromEmail:inbox.from_email}));
});
it('uses a scoped token when the reply has no RFC references',async()=>{
 pool.execute.mockResolvedValueOnce([[{agency_id:2,from_email:'messages@itsco.health'}]]).mockResolvedValueOnce([[{id:4,reminder_id:11,owner_user_id:5}]]);
 const result=await resolvePersonalReminderMailbox({identityId:44,fromEmail:'private@example.org',addresses:[`messages+p-${'a'.repeat(48)}@itsco.health`]});
 expect(result.reminder_id).toBe(11);const query=pool.execute.mock.calls[1];expect(query[0]).toContain('i.agency_id=?');expect(query[0]).toContain('i.owner_user_id=n.user_id');expect(query[1].slice(0,2)).toEqual([2,'private@example.org']);expect(query[1][2]).toHaveLength(64);
});
it('rejects wrong-tenant tokens and ambiguous reminder references',async()=>{
 pool.execute.mockResolvedValueOnce([[{agency_id:2,from_email:'messages@itsco.health'}]]);
 expect(await resolvePersonalReminderMailbox({identityId:44,fromEmail:'private@example.org',addresses:[`messages+p-${'a'.repeat(48)}@other.example`]})).toBeNull();
 pool.execute.mockResolvedValueOnce([[{agency_id:2,from_email:'messages@itsco.health'}]]).mockResolvedValueOnce([[{reminder_id:1},{reminder_id:2}]]);
 expect(await resolvePersonalReminderMailbox({identityId:44,fromEmail:'private@example.org',inReplyTo:'<r@itsco.health>'})).toBeNull();
});
it('rechecks preferences before a scheduled personal reply is actually sent',async()=>{
 pool.execute.mockResolvedValue([[{...reminder,personal_email_notify:0}]]);
 await expect(personalReplySendMailbox({reminderId:1,conversationId:10,inbox,userId:5,to:[{email:'client@example.org'}]})).rejects.toThrow('permissions changed');
 pool.execute.mockResolvedValue([[reminder]]);
 expect(await personalReplySendMailbox({reminderId:1,conversationId:10,inbox,userId:5,to:[{email:'client@example.org'}]})).toMatchObject({fromEmail:'messages@itsco.health'});
});
