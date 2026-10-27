import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),findById:vi.fn(),list:vi.fn(),identity:vi.fn(),sync:vi.fn(),notify:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.connection}}));
vi.mock('../../models/ReferralDirectoryEntry.model.js',()=>({default:{findById:mocks.findById,listForAgency:mocks.list}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:mocks.identity}}));
vi.mock('../ticketEmailInboxAdapter.service.js',()=>({syncEmailTicketsToInbox:mocks.sync}));
vi.mock('../referralSupportNotifications.service.js',()=>({notifyReferralSupport:mocks.notify}));
import {detectReferralServices,matchReferrals,referralEmailContent} from '../../utils/referralMatching.js';
import {authorizeReferralOutreach,prepareReferralEmail,sendReferralEmail} from '../referralOutreach.service.js';
import {encryptChatText} from '../chatEncryption.service.js';
const entry={id:7,agency_id:377,name:'Example Practice',is_active:1,approval_status:'approved',service_tags:['psychology','psychological_testing'],phone:'719-555-0100',website:'https://example.test/',address:'Colorado Springs',notes:'PRIVATE NOTE'};
beforeEach(()=>{vi.resetAllMocks();process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');mocks.findById.mockResolvedValue(entry);mocks.identity.mockResolvedValue({id:81,agency_id:377,from_email:'support@example.test',display_name:'Support'});mocks.sync.mockResolvedValue({});mocks.notify.mockResolvedValue();});
describe('referral matching',()=>{
 it('understands psychologists OR psychiatrists and testing without guessing services from a name',()=>{
  expect(detectReferralServices('psychologists or psychiatrists')).toEqual(['psychology','psychiatry']);
  expect(detectReferralServices('psychological testing')).toEqual(['psychological_testing']);
  const matched=matchReferrals([entry,{...entry,id:8,service_tags:[],name:'Psychiatry Center'},{...entry,id:9,is_active:0},{...entry,id:10,approval_status:'pending'}],{request:'psychological testing'});
  expect(matched.entries.map(e=>e.id)).toEqual([7]);
 });
 it('does not treat missing location or insurance as confirmed matches',()=>{
  expect(matchReferrals([entry],{services:['psychology'],insurance:'Aetna'}).entries).toEqual([]);
  expect(matchReferrals([entry],{services:['psychology'],location:'Denver'}).entries).toEqual([]);
 });
 it('escapes untrusted names and excludes private notes, raw HTML and unsafe links',()=>{
  const content=referralEmailContent({entries:[{...entry,name:'<script>bad</script>',website:'javascript:alert(1)'}],name:'<img src=x>'});
  expect(content.html).not.toContain('<script>');expect(content.html).not.toContain('javascript:');expect(content.html).toContain('&lt;img');
  expect(content.text).not.toContain('PRIVATE NOTE');expect(content.html).not.toContain('PRIVATE NOTE');
 });
});
describe('referral outreach authorization and delivery',()=>{
 it('rejects cross-tenant membership and non-support roles',async()=>{
  mocks.execute.mockResolvedValue([[]]);await expect(authorizeReferralOutreach(377,42)).rejects.toMatchObject({status:403});
  mocks.execute.mockResolvedValue([[{role:'admin',agency_role:'provider'}]]);await expect(authorizeReferralOutreach(377,42)).rejects.toMatchObject({status:403});
 });
 it('uses agency support role without replacing a global role',async()=>{
  mocks.execute.mockResolvedValue([[{id:42,role:'provider',agency_role:'support'}]]);await expect(authorizeReferralOutreach(377,42)).resolves.toMatchObject({id:42});
 });
 it('rejects a selected entry from another tenant before persisting or sending',async()=>{
  mocks.execute.mockImplementation(async sql=>sql.includes('SELECT u.id')?[[{role:'admin'}]]:sql.includes('SELECT sender_identity_id')?[[{sender_identity_id:81}]]:[[]]);
  mocks.findById.mockResolvedValue({...entry,agency_id:2});
  await expect(prepareReferralEmail({agencyId:377,actorUserId:42,to:'client@example.test',entryIds:[7]})).rejects.toMatchObject({status:409});
  expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 });
 it('does not resend a previously attempted draft',async()=>{
  mocks.execute.mockImplementation(async sql=>sql.includes('SELECT u.id')?[[{role:'admin'}]]:[[{status:'uncertain',ticket_id:19}]]);
  const send=vi.fn();expect(await sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{send})).toEqual({status:'uncertain',ticketId:19,duplicate:true});expect(send).not.toHaveBeenCalled();
 });
 it('sends once with support Reply-To and a durable outbound ticket',async()=>{
  const payload={to:'client@example.test',from:'support@example.test',senderIdentityId:81,entryIds:[7],...referralEmailContent({entries:[entry]})};
  const enc=encryptChatText(JSON.stringify(payload));
  mocks.execute.mockImplementation(async sql=>{
    if(sql.includes('SELECT u.id'))return [[{role:'admin'}]];
    if(sql.includes('SELECT * FROM referral_outreach'))return [[{id:'draft',status:'draft',created_at:new Date(),payload_ciphertext:enc.ciphertextB64,payload_iv:enc.ivB64,payload_auth_tag:enc.authTagB64,encryption_key_id:enc.keyId}]];
    if(sql.includes('SELECT sender_identity_id'))return [[{sender_identity_id:81}]];
    return [{affectedRows:1}];
  });
  const db={execute:vi.fn(async sql=>[{affectedRows:1,insertId:sql.includes('INSERT INTO support_tickets')?19:20}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.connection.mockResolvedValue(db);
  const send=vi.fn().mockResolvedValue({id:'gmail-id',threadId:'thread',communicationId:30});
  expect(await sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{send})).toMatchObject({status:'sent',ticketId:19});
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][0]).toMatchObject({replyToOverride:'support@example.test',source:'manual',senderIdentityId:81});
  expect(db.commit).toHaveBeenCalled();expect(mocks.sync).toHaveBeenCalled();
 });
});
