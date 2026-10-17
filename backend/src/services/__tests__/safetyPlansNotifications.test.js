import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../safetyPlans/access.js',()=>({recipientAccess:vi.fn()}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantFormsMailbox:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({guardianReminderPreferences:vi.fn()}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn()}}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
import main from '../../config/database.js';
import {recipientAccess} from '../safetyPlans/access.js';
import {ensureTenantFormsMailbox} from '../tenantMessageMailboxes.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {guardianReminderPreferences} from '../guardianAppointments.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {resolveRegisteredSmsSender} from '../smsCompliance.service.js';
import Vonage from '../vonage.service.js';
import {createClinicalFormNotifier,clinicalPortalNotice} from '../safetyPlans/notifications.js';
import {queueClinicalFormNotification} from '../safetyPlans/notificationQueue.js';
let batches,db;
beforeEach(()=>{
 vi.clearAllMocks();
 batches=[{id:1,agency_id:2,recipient_user_id:20,batch_key:10000,email_state:'pending',sms_state:'pending'}];
 db={execute:vi.fn(async(sql,p=[])=>{
  if(sql.startsWith('SELECT * FROM clinical_form_notification_batches'))return [structuredClone(batches)];
  if(sql.includes("WHERE id=? AND batch_key=? AND")){
   const channel=sql.includes('SET email_state')?'email':'sms';
   const row=batches.find(b=>b.id===p[0]&&b.batch_key===p[1]&&b[channel+'_state']==='pending');
   if(row)row[channel+'_state']='sending';return [{affectedRows:row?1:0}];
  }
  if(sql.includes('_provider_ref=?')){const channel=sql.includes('SET email_state')?'email':'sms';const row=batches.find(b=>b.id===p[2]&&b.batch_key===p[3]);if(row)row[channel+'_state']=p[0];return [{affectedRows:row?1:0}];}
  if(sql.startsWith('SELECT p.*'))return [[{id:31,client_id:41,agency_id:2,signer_kind:'guardian'}]];
  return [{affectedRows:0}];
 })};
 recipientAccess.mockResolvedValue('Synthetic guardian');
 main.execute.mockImplementation(async(sql)=>sql.includes('FROM users')?[[{email:'example@example.test'}]]:[[{name:'Synthetic agency',slug:'synthetic'}]]);
 ensureTenantFormsMailbox.mockResolvedValue({forms:{id:11},domain:'example.test'});
 sendEmailFromIdentity.mockResolvedValue({id:'mail-1'});
 guardianReminderPreferences.mockResolvedValue({channels:{sms:true},providerPushedUpdatesEnabled:true});
 ClientGuardian.listForClient.mockResolvedValue([{guardian_user_id:20,phone:'+13035550123'}]);
 resolveRegisteredSmsSender.mockResolvedValue('+13035550124');
 Vonage.sendSms.mockResolvedValue({sid:'sms-1'});
});
describe('grouped clinical portal notifications',()=>{
 it('sends co-branded email through the forms identity with support replies and consent-checked SMS',async()=>{
  await createClinicalFormNotifier({db})();
  expect(ensureTenantFormsMailbox).toHaveBeenCalledWith(2);
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:11,replyToOverride:'support@example.test',fromDisplayNameOverride:'Synthetic agency · AuricWell',subject:'Documents and forms are ready in your portal'}));
  expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,purpose:'reminders',to:'+13035550123',from:'+13035550124'}));
  expect(batches[0]).toMatchObject({email_state:'sent',sms_state:'sent'});expect(recipientAccess).toHaveBeenCalledTimes(2);
 });
 it('does not duplicate alerts across concurrent workers or later polls',async()=>{
  const process=createClinicalFormNotifier({db});await Promise.all([process(),process()]);await process();expect(sendEmailFromIdentity).toHaveBeenCalledTimes(1);expect(Vonage.sendSms).toHaveBeenCalledTimes(1);
 });
 it.each([{channels:{sms:false}},{channels:{sms:true},providerPushedUpdatesEnabled:false}])('does not text when preferences disable updates: %j',async preferences=>{
  guardianReminderPreferences.mockResolvedValue(preferences);await createClinicalFormNotifier({db})();expect(Vonage.sendSms).not.toHaveBeenCalled();expect(batches[0].sms_state).toBe('skipped');expect(sendEmailFromIdentity).toHaveBeenCalledTimes(1);
 });
 it('suppresses delivery after disclosure permission is withdrawn',async()=>{
  recipientAccess.mockRejectedValue(Object.assign(Error('Revoked'),{status:403}));await createClinicalFormNotifier({db})();expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();expect(batches[0]).toMatchObject({email_state:'skipped',sms_state:'skipped'});
 });
 it('rechecks permission between channels',async()=>{
  recipientAccess.mockResolvedValueOnce('Synthetic').mockRejectedValue(Object.assign(Error('Revoked'),{status:403}));await createClinicalFormNotifier({db})();expect(sendEmailFromIdentity).toHaveBeenCalledTimes(1);expect(Vonage.sendSms).not.toHaveBeenCalled();
 });
 it('does not resend ambiguous failures automatically',async()=>{
  sendEmailFromIdentity.mockRejectedValue(Error('Transport timed out'));const process=createClinicalFormNotifier({db});await process();await process();expect(sendEmailFromIdentity).toHaveBeenCalledTimes(1);expect(batches[0].email_state).toBe('review');
 });
 it('uses an atomic recipient cooldown without extending it with every addition',async()=>{
  await queueClinicalFormNotification(db,2,20);const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([2,20]);expect(sql).toContain('ON DUPLICATE KEY UPDATE');expect(sql).toContain('batch_key<UNIX_TIMESTAMP()-1800');expect(sql).toContain("email_state<>'sending'");expect(sql).toContain('INTERVAL 2 MINUTE');expect(sql).not.toContain('FLOOR');
 });
 it('escapes branding and uses generic notification wording',()=>{
  const notice=clinicalPortalNotice({agencyName:'A <script> & B',portalUrl:'https://example.test/portal'});expect(notice.html).not.toContain('<script>');expect(notice.html).toContain('A &lt;script&gt; &amp; B');expect(notice.text).toContain('AuricWell');expect(notice.subject).not.toMatch(/safety|suicide|screening|ROI/i);
 });
});
