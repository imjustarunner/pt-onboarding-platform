import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),findById:vi.fn(),list:vi.fn(),identity:vi.fn(),sync:vi.fn(),notify:vi.fn(),people:vi.fn(),mailbox:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.connection}}));
vi.mock('../../models/ReferralDirectoryEntry.model.js',()=>({default:{findById:mocks.findById,listForAgency:mocks.list}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:mocks.identity}}));
vi.mock('../ticketEmailInboxAdapter.service.js',()=>({syncEmailTicketsToInbox:mocks.sync}));
vi.mock('../referralSupportNotifications.service.js',()=>({notifyReferralSupport:mocks.notify}));
vi.mock('../messagesHub.service.js',()=>({searchHubPeople:mocks.people}));
vi.mock('../emailSendMailbox.service.js',()=>({resolveEmailSendMailbox:mocks.mailbox}));
import {detectReferralServices,matchReferrals,referralEmailContent} from '../../utils/referralMatching.js';
import {authorizeReferralOutreach,prepareReferralEmail,sendReferralEmail,referralOutreachOptions,searchReferralRecipients} from '../referralOutreach.service.js';
import {encryptChatText,decryptChatText} from '../chatEncryption.service.js';
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
 it('rejects cross-tenant membership and roles without directory access',async()=>{
  mocks.execute.mockResolvedValue([[]]);await expect(authorizeReferralOutreach(377,42)).rejects.toMatchObject({status:403});
  mocks.execute.mockResolvedValue([[{role:'client',agency_role:'client'}]]);await expect(authorizeReferralOutreach(377,42)).rejects.toMatchObject({status:403});
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

const person={agencyId:377,personKey:'user:99@377',displayName:'Sam Example',email:'sam@example.test'};
const personalMailbox={identity:{id:91,agency_id:377},inbox:{id:51},fromEmail:'messages@example.test',replyTo:'messages@example.test'};
function configurePersonal(actor={id:42,role:'provider',agency_role:'provider'}) {
 mocks.people.mockResolvedValue([person]);mocks.mailbox.mockResolvedValue(personalMailbox);
 mocks.execute.mockImplementation(async sql=>{
  if(sql.includes('SELECT u.id'))return [[actor]];
  if(sql.includes('SELECT name FROM agencies'))return [[{name:'Example Agency'}]];
  if(sql.includes('SELECT sender_identity_id'))return [[{sender_identity_id:81}]];
  return [{affectedRows:1}];
 });
}
function storedDraft(payload,status='draft') {
 const enc=encryptChatText(JSON.stringify(payload));
 return {id:'draft',status,created_at:new Date(),payload_ciphertext:enc.ciphertextB64,payload_iv:enc.ivB64,payload_auth_tag:enc.authTagB64,encryption_key_id:enc.keyId};
}
function useDraft(payload,actor={id:42,role:'provider',agency_role:'provider'},status='draft') {
 configurePersonal(actor);
 const previous=mocks.execute.getMockImplementation();
 mocks.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT * FROM referral_outreach')?[[storedDraft(payload,status)]]:previous(sql,args));
}
const personalPayload=()=>({to:person.email,personKey:person.personKey,from:personalMailbox.fromEmail,replyTo:personalMailbox.replyTo,inboxId:51,senderMode:'personal',senderIdentityId:91,entryIds:[7],...referralEmailContent({entries:[entry],support:false})});
describe('directory-wide referral sends',()=>{
 it.each(['staff','provider','provider_plus'])('allows %s directory users without granting support sender access',async role=>{
  configurePersonal({id:42,role,agency_role:role});
  expect(await referralOutreachOptions({agencyId:377,actorUserId:42})).toMatchObject({canSendAsSupport:false,canEmailNewPerson:false,defaultSenderMode:'personal'});
 });
 it('does not let a global admin with a provider agency role send as support',async()=>{
  configurePersonal({id:42,role:'admin',agency_role:'provider'});
  expect((await referralOutreachOptions({agencyId:377,actorUserId:42})).canSendAsSupport).toBe(false);
 });
 it('limits search results to this agency and usable email addresses',async()=>{
  configurePersonal();mocks.people.mockResolvedValue([person,{...person,agencyId:2},{...person,email:null}]);
  expect(await searchReferralRecipients({agencyId:377,actorUserId:42,query:'Sam'})).toEqual([{personKey:person.personKey,name:person.displayName,email:person.email,relationship:''}]);
  expect(mocks.people).toHaveBeenCalledWith({agencyId:377,userId:42,q:'Sam',limit:50});
 });
 it('builds an SSO preview using messages From/Reply-To and a personal closing',async()=>{
  configurePersonal();
  const draft=await prepareReferralEmail({agencyId:377,actorUserId:42,to:person.email,personKey:person.personKey,entryIds:[7]});
  expect(draft).toMatchObject({senderMode:'personal',from:'messages@example.test',replyTo:'messages@example.test',inboxId:51});
  expect(draft.text).not.toContain('support team');
 });
 it('uses the configured non-SSO personal sender and Reply-To',async()=>{
  configurePersonal();mocks.mailbox.mockResolvedValue({...personalMailbox,fromEmail:'staff@example.test',replyTo:'staff@example.test'});
  expect(await prepareReferralEmail({agencyId:377,actorUserId:42,to:person.email,personKey:person.personKey,entryIds:[7]})).toMatchObject({from:'staff@example.test',replyTo:'staff@example.test'});
 });
 it('allows support to email someone with no account or person key',async()=>{
  configurePersonal({id:42,role:'provider',agency_role:'support'});
  expect(await prepareReferralEmail({agencyId:377,actorUserId:42,to:'new@example.test',name:'New Person',entryIds:[7],senderMode:'support'})).toMatchObject({to:'new@example.test',personKey:null,senderMode:'support',replyTo:'support@example.test'});
  expect(mocks.people).not.toHaveBeenCalled();
 });
 it('rejects external recipients and support sender selection for ordinary staff',async()=>{
  configurePersonal();
  await expect(prepareReferralEmail({agencyId:377,actorUserId:42,to:'new@example.test',entryIds:[7]})).rejects.toMatchObject({status:403});
  await expect(prepareReferralEmail({agencyId:377,actorUserId:42,to:person.email,personKey:person.personKey,entryIds:[7],senderMode:'support'})).rejects.toMatchObject({status:403});
  expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 });
 it.each([{personKey:'user:99@2',to:person.email},{personKey:person.personKey,to:'changed@example.test'},{personKey:'email:new@example.test',to:'new@example.test'}])('rejects forged recipient selection %j',async input=>{
  configurePersonal();
  await expect(prepareReferralEmail({agencyId:377,actorUserId:42,entryIds:[7],...input})).rejects.toMatchObject({status:403});
 });
 it('rechecks recipient access and sender identity before claiming or sending',async()=>{
  useDraft(personalPayload());mocks.people.mockResolvedValue([]);const compose=vi.fn();
  await expect(sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).rejects.toMatchObject({status:403});
  expect(compose).not.toHaveBeenCalled();
  useDraft(personalPayload());mocks.mailbox.mockResolvedValue({...personalMailbox,replyTo:'changed@example.test'});
  await expect(sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).rejects.toMatchObject({status:409});
  expect(mocks.execute.mock.calls.some(([sql])=>sql.includes("SET status='sending'"))).toBe(false);
 });
 it('saves individual outreach in Messages without creating or notifying a support ticket',async()=>{
  useDraft(personalPayload());const compose=vi.fn().mockResolvedValue({id:101,messageId:202,sent:true});
  expect(await sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).toEqual({status:'sent',conversationId:101,messageId:202});
  expect(compose).toHaveBeenCalledWith(expect.objectContaining({agencyId:377,userId:42,inboxId:51,payload:expect.objectContaining({to:person.email,templateType:'hub_email',deferClientFiling:true})}));
  expect(mocks.connection).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
  const [,args]=mocks.execute.mock.calls.find(([sql])=>sql.includes('SET status=?,payload_ciphertext'));
  expect(JSON.parse(decryptChatText({ciphertextB64:args[1],ivB64:args[2],authTagB64:args[3],keyId:args[4]})).receipt).toEqual({status:'sent',conversationId:101,messageId:202});
 });
 it('does not send after losing the atomic reservation to another request',async()=>{
  useDraft(personalPayload());const previous=mocks.execute.getMockImplementation();
  mocks.execute.mockImplementation((sql,args)=>sql.includes("SET status='sending'")?Promise.resolve([{affectedRows:0}]):previous(sql,args));
  const compose=vi.fn();expect(await sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).toEqual({status:'sending',duplicate:true});expect(compose).not.toHaveBeenCalled();
 });
 it('does not retry ambiguous personal delivery and returns saved conversation receipts',async()=>{
  useDraft(personalPayload());const compose=vi.fn().mockRejectedValue(new Error('Transport timeout'));
  await expect(sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).rejects.toMatchObject({status:503});
  expect(mocks.execute).toHaveBeenCalledWith("UPDATE referral_outreach_drafts SET status='uncertain' WHERE id=?",['draft']);
  useDraft({...personalPayload(),receipt:{conversationId:101,messageId:202}},undefined,'sent');compose.mockClear();
  expect(await sendReferralEmail({agencyId:377,actorUserId:42,draftId:'draft'},{compose})).toMatchObject({status:'sent',conversationId:101,duplicate:true});expect(compose).not.toHaveBeenCalled();
 });
});
describe('automatic selection and recorded matching details',()=>{
 it('covers both requested disciplines before adding another option of the same kind',()=>{
  const result=matchReferrals([entry,{...entry,id:8,name:'B'},{...entry,id:9,name:'C'},{...entry,id:10,name:'Z',service_tags:['psychiatry']}],{request:'psychologist or psychiatrist'});
  expect(result.suggestedEntryIds).toHaveLength(3);expect(result.suggestedEntryIds).toContain(10);
 });
 it('uses confirmed age, language and appointment format and excludes unknown details',()=>{
  const confirmed={...entry,id:8,matching_details:{ageMin:5,ageMax:17,languages:['English','Spanish'],appointmentFormats:['telehealth']}};
  expect(matchReferrals([entry,confirmed],{services:['psychology'],age:12,language:'spanish',appointmentFormat:'telehealth'}).entries.map(e=>e.id)).toEqual([8]);
  expect(matchReferrals([confirmed],{services:['psychology'],age:18}).entries).toEqual([]);
  expect(matchReferrals([confirmed],{services:['psychology'],appointmentFormat:'in_person'}).entries).toEqual([]);
 });
 it('rejects invalid age and format filters instead of silently widening results',()=>{
  expect(()=>matchReferrals([entry],{services:['psychology'],age:-1})).toThrow('age');
  expect(()=>matchReferrals([entry],{services:['psychology'],appointmentFormat:'unknown'})).toThrow('telehealth');
 });
});
