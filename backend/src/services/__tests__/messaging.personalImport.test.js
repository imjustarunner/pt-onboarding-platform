import {beforeEach, expect, it, vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:()=>{}}));
vi.mock('../workspaceMailboxType.service.js',()=>({workspaceMailboxType:vi.fn()}));
vi.mock('../communicationAttachments.service.js',()=>({prepareInboundAttachments:vi.fn(async()=>[])}));
vi.mock('../personalThreadReminder.service.js',()=>({queuePersonalReminderReply:vi.fn(async()=>null)}));
vi.mock('../inboundEmailPersistence.service.js',()=>({persistInboundEmail:vi.fn(async()=>({conversationId:9,messageId:12}))}));
vi.mock('../inboundEventInvitation.service.js',()=>({forwardInboundEventInvitation:vi.fn()}));
vi.mock('../inboundCommunication.service.js',()=>({processInboundCommunicationEvent:vi.fn()}));
import pool from '../../config/database.js';
import {workspaceMailboxType} from '../workspaceMailboxType.service.js';
import {persistInboundEmail} from '../inboundEmailPersistence.service.js';
import {ingestPersonalMailboxInbound} from '../personalMailbox.service.js';
const args={agencyId:2,identity:{id:1,agency_id:2,identity_key:'personal_5',from_email:'staff@itsco.health'},fromEmail:'sender@example.test',bodyText:'Hello',messageIdHeader:'<message@test>',gmailPayload:{mimeType:'text/html',body:{data:Buffer.from('<h1>Hello</h1>').toString('base64url')}}};
beforeEach(()=>{vi.clearAllMocks();workspaceMailboxType.mockResolvedValue('group');pool.execute.mockImplementation(async sql=>[sql.includes('SELECT * FROM communication_inboxes')?[{id:3,owner_user_id:5,from_email:'staff@itsco.health'}]:[]]);});
it('does not import individual Workspace email even when the owner has an app inbox',async()=>{
 workspaceMailboxType.mockResolvedValue('user');
 expect(await ingestPersonalMailboxInbound(args)).toEqual({ingested:false,ignored:true,reason:'workspace_user_mailbox'});
 expect(pool.execute).not.toHaveBeenCalled();expect(persistInboundEmail).not.toHaveBeenCalled();
});
it('preserves branded HTML for a verified Group mailbox',async()=>{
 expect(await ingestPersonalMailboxInbound(args)).toMatchObject({ingested:true});
 expect(persistInboundEmail).toHaveBeenCalledWith(expect.objectContaining({bodyHtml:'<h1>Hello</h1>',bodyText:'Hello',inboxId:3}));
});
it('retains explicitly matched replies to app conversations without enabling general Gmail import',async()=>{
 workspaceMailboxType.mockResolvedValue('user');
 expect(await ingestPersonalMailboxInbound({...args,conversationId:9})).toMatchObject({ingested:true});
 expect(persistInboundEmail).toHaveBeenCalledWith(expect.objectContaining({conversationId:9}));
});
it('defers on directory failure rather than guessing or losing a Group delivery',async()=>{
 workspaceMailboxType.mockRejectedValue(new Error('directory offline'));
 await expect(ingestPersonalMailboxInbound(args)).rejects.toThrow('directory offline');
 expect(persistInboundEmail).not.toHaveBeenCalled();
});
