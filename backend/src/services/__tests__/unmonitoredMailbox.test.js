import {it,expect,vi,beforeEach} from 'vitest';
import {isUnmonitoredAddress,shouldReplyToUnmonitored,unmonitoredReplyText} from '../../utils/unmonitoredMailbox.js';
it('identifies only configured no-reply addresses',()=>{
  expect(isUnmonitoredAddress('No Reply <no-reply@auricwell.com>')).toBe(true);
  expect(isUnmonitoredAddress('not-no-reply@auricwell.com')).toBe(false);
});
it.each([['auto-submitted','auto-replied'],['precedence','bulk'],['x-autoreply','yes'],['x-auto-response-suppress','All']])('blocks automatic reply loops for %s', (key,value)=>{
  expect(shouldReplyToUnmonitored({headers:new Map([[key,value]]),fromEmail:'provider@example.com'})).toBe(false);
});
it('allows a human reply but never replies to another no-reply mailbox',()=>{
  expect(shouldReplyToUnmonitored({headers:new Map(),fromEmail:'provider@example.com'})).toBe(true);
  expect(shouldReplyToUnmonitored({headers:new Map(),fromEmail:'no-reply@example.com'})).toBe(false);
});
it('uses verified agency support and does not guess the agency for unknown senders',()=>{
  expect(unmonitoredReplyText({agencyName:'ITSCO',supportEmail:'support@itsco.health',appUrl:'https://app.itsco.health/client-exchange'})).toContain('contact support@itsco.health');
  const generic=unmonitoredReplyText({appUrl:'https://example.com'});expect(generic).toContain('choose your agency');expect(generic).not.toContain('ITSCO');
});

const mocks=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),release:vi.fn(),identity:vi.fn(),support:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:async()=>({execute:mocks.connection,release:mocks.release})}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByFromEmail:mocks.identity,findByAgencyAndIdentityKey:mocks.support}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async id=>({id,name:'ITSCO',slug:'itsco'})}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:mocks.send}));
import {handleUnmonitoredMailboxReply} from '../unmonitoredMailbox.service.js';
const humanHeaders=()=>new Map([['to','noreply@itsco.health'],['in-reply-to','<original@example.com>'],['message-id','<reply@example.com>']]);
beforeEach(()=>{
  vi.clearAllMocks();mocks.connection.mockResolvedValue([[{acquired:1}]]);
  mocks.identity.mockResolvedValue({id:5,agency_id:2,identity_key:'noreply',from_email:'noreply@itsco.health'});
  mocks.support.mockResolvedValue({from_email:'support@itsco.health'});mocks.send.mockResolvedValue({id:'sent',communicationId:44});
  mocks.execute.mockImplementation(async sql=>sql.includes('FROM user_communications')?[[{agency_id:2,recipient_address:'provider@example.com'}]]:[[]]);
});
it('uses a verified original recipient and preserves a receipt without echoing inbound content',async()=>{
  expect(await handleUnmonitoredMailboxReply({headers:humanHeaders(),fromEmail:'provider@example.com',gmailMessageId:'gmail-1'})).toEqual({handled:true,status:'sent'});
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({to:'provider@example.com',replyToOverride:'noreply@itsco.health',templateType:'unmonitored_mailbox_auto_reply',text:expect.stringContaining('support@itsco.health')}));
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE unmonitored_mailbox_replies'),['sent',44,'gmail-1']);
  expect(mocks.release).toHaveBeenCalled();
});
it('never sends on an unconfigured address or reprocesses the same inbound email',async()=>{
  mocks.identity.mockResolvedValue(null);expect(await handleUnmonitoredMailboxReply({headers:humanHeaders(),fromEmail:'provider@example.com',gmailMessageId:'gmail-1'})).toEqual({handled:false});expect(mocks.send).not.toHaveBeenCalled();
  mocks.identity.mockResolvedValue({id:5,identity_key:'noreply',from_email:'noreply@itsco.health'});mocks.execute.mockResolvedValue([[{status:'sent'}]]);
  expect(await handleUnmonitoredMailboxReply({headers:humanHeaders(),fromEmail:'provider@example.com',gmailMessageId:'gmail-1'})).toMatchObject({handled:true,reason:'already_attempted'});expect(mocks.send).not.toHaveBeenCalled();
});
it('rate-limits human replies instead of creating a mailbox loop',async()=>{
  mocks.execute.mockImplementation(async sql=>sql.includes('created_at>')?[[{gmail_message_id:'prior'}]]:[[]]);
  expect(await handleUnmonitoredMailboxReply({headers:humanHeaders(),fromEmail:'provider@example.com',gmailMessageId:'gmail-2'})).toMatchObject({reason:'reply_rate_limited'});expect(mocks.send).not.toHaveBeenCalled();
});
it('does not infer an agency from an unrelated outbound message on the shared mailbox',async()=>{
  mocks.identity.mockResolvedValue({id:5,identity_key:'exchange_noreply',from_email:'no-reply@auricwell.com'});
  mocks.execute.mockImplementation(async sql=>sql.includes('FROM user_communications')?[[{agency_id:2,recipient_address:'different@example.com'}]]:[[]]);
  const headers=humanHeaders();headers.set('to','no-reply@auricwell.com');await handleUnmonitoredMailboxReply({headers,fromEmail:'provider@example.com',gmailMessageId:'gmail-3'});
  expect(mocks.send.mock.calls[0][0].text).toContain('choose your agency');expect(mocks.send.mock.calls[0][0].text).not.toContain('support@itsco.health');
});
