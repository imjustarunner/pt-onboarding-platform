import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({context:vi.fn(),recipient:vi.fn(),persist:vi.fn(),resolve:vi.fn(),sender:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../familyNotificationChoices.service.js',async original=>({...await original(),familyNotificationInvitationContext:m.context,currentRecipient:m.recipient,persistFamilyNotificationChoices:m.persist}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:m.resolve,getSmsSender:m.sender}));
import {familyContactHash} from '../familyNotificationChoices.service.js';
import {requestQuickFamilyTexts,activateQuickFamilyTexts,QUICK_TEXT_VERSION} from '../familyQuickTextEnrollment.service.js';
import {encryptChatText} from '../chatEncryption.service.js';
const context=()=>({scope:{id:1,token_hash:'invitation-hash',agency_id:2,client_id:10,guardian_user_id:20,recipient_hash:'email-hash',expires_at:new Date(Date.now()+86400000)},revision:3,choices:{appointments:'off',documents:'email',messages:'off',insurance:'email',billing:'off',enrollment:'off'},recipient:{phone:'+13035550100',client_type:'school'},sender:{id:4,agency_id:2,phone_number:'+13035550999',registration:{brandName:'Example'}}});
beforeEach(()=>{vi.clearAllMocks();process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');m.recipient.mockResolvedValue(context().recipient);});
it('records only an encrypted opt-in request before the carrier confirms the entered phone',async()=>{
 const db={execute:vi.fn(async()=>[{}])};
 const result=await requestQuickFamilyTexts({token:'email-token',input:{confirm:'yes',version:QUICK_TEXT_VERSION,phone:'303-555-0101',revision:3}}, {db,loadContext:async()=>context()});
 expect(result).toMatchObject({pendingStart:true,phoneLastFour:'0101',smsUrl:'sms:+13035550999?body=START'});
 expect(db.execute).toHaveBeenCalledTimes(1);expect(db.execute.mock.calls[0][0]).toContain('INSERT INTO sms_consent_requests');
 expect(m.persist).not.toHaveBeenCalled();expect(JSON.stringify(db.execute.mock.calls)).not.toContain('UPDATE users');
});
it.each([{confirm:'no'},{phone:'bad'},{version:'old'},{revision:2}])('refuses invalid or stale opt-in %j before writing',async patch=>{
 const db={execute:vi.fn()};
 await expect(requestQuickFamilyTexts({token:'email-token',input:{confirm:'yes',version:QUICK_TEXT_VERSION,phone:'3035550101',revision:3,...patch}},{db,loadContext:async()=>context()})).rejects.toHaveProperty('status');
 expect(db.execute).not.toHaveBeenCalled();
});
function activationFixture({revision=3,phone='+13035550100',invitation=true}={}) {
 const c=context(),requestedAt=Date.now()-10000;
 const payload={scope:c.scope,phone:'+13035550101',priorPhoneHash:familyContactHash(c.recipient.phone),revision:3,choices:c.choices,requestedAt:new Date(requestedAt).toISOString()};
 const row={id:50,signed_payload_json:JSON.stringify(encryptChatText(JSON.stringify(payload)))};
 const db={execute:vi.fn(async sql=>{
   if(sql.includes('FROM sms_consent_requests'))return [[row]];
   if(sql.includes('FROM family_notification_invitations'))return [invitation?[{id:1}]:[]];
   if(sql.includes('FROM users'))return [[{phone_number:phone}]];
   if(sql.includes('FROM family_notification_choices'))return [[{revision}]];
   return [[]];
 })};
 return {db,args:{sender:c.sender,phone:payload.phone,messageId:'verified-carrier-event',receivedAt:Date.now()},requestedAt};
}
it('saves the verified phone and both update categories only for the email recipient after START',async()=>{
 const f=activationFixture();await activateQuickFamilyTexts(f.args,f.db);
 expect(f.db.execute).toHaveBeenCalledWith('UPDATE users SET phone_number=? WHERE id=?',['+13035550101',20]);
 expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({scope:expect.objectContaining({client_id:10,guardian_user_id:20}),revision:4,choices:expect.objectContaining({appointments:'both',documents:'both',messages:'both',school_sessions:'both',insurance:'email',billing:'off',enrollment:'off'})}),f.db);
 expect(f.db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE sms_consent_requests'))).toHaveLength(1);
});
it.each([{revision:4},{phone:'+13035550102'},{invitation:false}])('does not overwrite later preferences, a corrected phone, or revoked email invitation: %j',async patch=>{
 const f=activationFixture(patch);await activateQuickFamilyTexts(f.args,f.db);
 expect(m.persist).not.toHaveBeenCalled();expect(f.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
});
it('does not activate an opt-in from an older START or for a guardian whose access was revoked',async()=>{
 const f=activationFixture();await activateQuickFamilyTexts({...f.args,receivedAt:f.requestedAt-1},f.db);expect(m.persist).not.toHaveBeenCalled();
 m.recipient.mockRejectedValue(Object.assign(new Error('expired access'),{status:410}));await activateQuickFamilyTexts(f.args,f.db);expect(m.persist).not.toHaveBeenCalled();
});
