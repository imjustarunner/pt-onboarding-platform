import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../safetyPlans/access.js',()=>({recipientAccess:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({guardianReminderPreferences:vi.fn()}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn()}}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
vi.mock('../portalShareNotice.service.js',()=>({shareEventStillOpen:vi.fn()}));
vi.mock('../clientUpdate.service.js',()=>({currentClientUpdateRecipient:vi.fn()}));
vi.mock('../familyNotificationChoices.service.js',()=>({familyNotificationDeliveryGate:vi.fn()}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn(),sendClientPortalEmail:vi.fn()}));
vi.mock('../familyPortalLocale.service.js',async importOriginal=>({...await importOriginal(),familyEnrollmentContext:vi.fn()}));
import {familyEnrollmentContext} from '../familyPortalLocale.service.js';
import {renderPortalEmail} from '../portalEmailBranding.service.js';
import {familyNotificationCategory} from '../../utils/familyNotificationChoices.js';
import main from '../../config/database.js';
import {recipientAccess} from '../safetyPlans/access.js';
import {guardianReminderPreferences} from '../guardianAppointments.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {resolveRegisteredSmsSender} from '../smsCompliance.service.js';
import Vonage from '../vonage.service.js';
import {shareEventStillOpen} from '../portalShareNotice.service.js';
import {currentClientUpdateRecipient} from '../clientUpdate.service.js';
import {familyNotificationDeliveryGate} from '../familyNotificationChoices.service.js';
import {clientEmailContext,sendClientPortalEmail} from '../clientPortalEmail.service.js';
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
 clientEmailContext.mockResolvedValue({url:path=>`https://example.test/synthetic/${path}`});
 familyEnrollmentContext.mockResolvedValue({locale:'en'});
 familyNotificationDeliveryGate.mockResolvedValue({allowed:true});
 sendClientPortalEmail.mockResolvedValue({id:'mail-1'});
 guardianReminderPreferences.mockResolvedValue({channels:{sms:true},providerPushedUpdatesEnabled:true});
 ClientGuardian.listForClient.mockResolvedValue([{guardian_user_id:20,phone:'+13035550123'}]);
 resolveRegisteredSmsSender.mockResolvedValue('+13035550124');
 Vonage.sendSms.mockResolvedValue({sid:'sms-1'});
});
afterEach(()=>vi.unstubAllEnvs());
describe('grouped clinical portal notifications',()=>{
 it('uses shared portal delivery and the tenant portal link with consent-checked SMS',async()=>{
  await createClinicalFormNotifier({db})();
  expect(clientEmailContext).toHaveBeenCalledWith({agencyId:2,clientId:41});
  expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:41,userId:20,source:'auto',locale:'en',templateType:'clinical_portal_documents',linkUrl:'https://example.test/synthetic/guardian?panel=documents&clientId=41&lang=en',subject:'Documents and forms are waiting in your portal'}));
  expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,purpose:'reminders',to:'+13035550123',from:'+13035550124'}));
  expect(batches[0]).toMatchObject({email_state:'sent',sms_state:'sent'});expect(recipientAccess).toHaveBeenCalledTimes(2);
 });
 it('does not duplicate alerts across concurrent workers or later polls',async()=>{
  const process=createClinicalFormNotifier({db});await Promise.all([process(),process()]);await process();expect(sendClientPortalEmail).toHaveBeenCalledTimes(1);expect(Vonage.sendSms).toHaveBeenCalledTimes(1);
 });
 it.each([{channels:{sms:false}},{channels:{sms:true},providerPushedUpdatesEnabled:false}])('does not text when preferences disable updates: %j',async preferences=>{
  guardianReminderPreferences.mockResolvedValue(preferences);await createClinicalFormNotifier({db})();expect(Vonage.sendSms).not.toHaveBeenCalled();expect(batches[0].sms_state).toBe('skipped');expect(sendClientPortalEmail).toHaveBeenCalledTimes(1);
 });
 it('suppresses delivery after disclosure permission is withdrawn',async()=>{
  recipientAccess.mockRejectedValue(Object.assign(Error('Revoked'),{status:403}));await createClinicalFormNotifier({db})();expect(sendClientPortalEmail).not.toHaveBeenCalled();expect(Vonage.sendSms).not.toHaveBeenCalled();expect(batches[0]).toMatchObject({email_state:'skipped',sms_state:'skipped'});
 });
 it('rechecks permission between channels',async()=>{
  recipientAccess.mockResolvedValueOnce('Synthetic').mockRejectedValue(Object.assign(Error('Revoked'),{status:403}));await createClinicalFormNotifier({db})();expect(sendClientPortalEmail).toHaveBeenCalledTimes(1);expect(Vonage.sendSms).not.toHaveBeenCalled();
 });
 it('does not resend ambiguous failures automatically',async()=>{
  sendClientPortalEmail.mockRejectedValue(Error('Transport timed out'));const process=createClinicalFormNotifier({db});await process();await process();expect(sendClientPortalEmail).toHaveBeenCalledTimes(1);expect(batches[0].email_state).toBe('review');
 });
 it('uses an atomic recipient cooldown without extending it with every addition',async()=>{
  await queueClinicalFormNotification(db,2,20);const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([2,20]);expect(sql).toContain('ON DUPLICATE KEY UPDATE');expect(sql).toContain('batch_key<UNIX_TIMESTAMP()-1800');expect(sql).toContain("email_state<>'sending'");expect(sql).toContain('INTERVAL 2 MINUTE');expect(sql).not.toContain('FLOOR');
 });
 it('escapes branding and uses generic notification wording',()=>{
  const notice=clinicalPortalNotice({agencyName:'A <script> & B',portalUrl:'https://example.test/portal'});expect(notice.html).not.toContain('<script>');expect(notice.html).toContain('A &lt;script&gt; &amp; B');expect(notice.text).toContain('AuricWell');expect(notice.subject).not.toMatch(/safety|suicide|screening|ROI/i);
 });
});

it('selects an email-eligible child in a shared batch when another child declined document notices',async()=>{
 vi.stubEnv('CLIENT_UPDATE_WORKFLOWS_ENABLED','true');
 const execute=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,p)=>sql.startsWith('SELECT p.*')?[[]]:execute(sql,p));
 main.execute.mockImplementation(async sql=>sql.includes('FROM client_portal_share_events')?[[{id:1,kind:'deliverable',client_id:41,agency_id:2,reference_id:101},{id:2,kind:'deliverable',client_id:42,agency_id:2,reference_id:102}]]:sql.includes('FROM users')?[[{email:'example@example.test'}]]:[[{name:'Synthetic agency',slug:'synthetic'}]]);
 shareEventStillOpen.mockResolvedValue(true);currentClientUpdateRecipient.mockResolvedValue({});
 familyNotificationDeliveryGate.mockImplementation(async input=>({allowed:Number(input.clientId)===42}));
 clientEmailContext.mockResolvedValue({url:path=>`https://example.test/synthetic/${path}`});sendClientPortalEmail.mockResolvedValue({id:'synthetic-share-email'});
 await createClinicalFormNotifier({db})();
 expect(sendClientPortalEmail).toHaveBeenCalledOnce();expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({clientId:42,templateType:'client_portal_share',linkUrl:'https://example.test/synthetic/guardian?panel=documents&clientId=42&lang=en'}));
 expect(familyNotificationDeliveryGate).toHaveBeenCalledWith(expect.objectContaining({clientId:41}));expect(familyNotificationDeliveryGate).toHaveBeenCalledWith(expect.objectContaining({clientId:42}));
 expect(Vonage.sendSms).not.toHaveBeenCalled();
});

it('localizes the notice and destination using the recipient language',async()=>{
 familyEnrollmentContext.mockResolvedValue({locale:'es'});await createClinicalFormNotifier({db})();
 expect(sendClientPortalEmail).toHaveBeenCalledWith(expect.objectContaining({locale:'es',subject:'Hay documentos y formularios esperando en su portal',linkLabel:'Abrir documentos y formularios',linkUrl:expect.stringContaining('lang=es')}));
 expect(Vonage.sendSms.mock.calls[0][0].body).toContain('Hay documentos o formularios esperando');
});
it('honors document email opt-outs independently of text permissions',async()=>{
 familyNotificationDeliveryGate.mockResolvedValue({allowed:false,reason:'documents_off'});await createClinicalFormNotifier({db})();
 expect(sendClientPortalEmail).not.toHaveBeenCalled();expect(batches[0].email_state).toBe('skipped');expect(Vonage.sendSms).toHaveBeenCalledOnce();
 expect(familyNotificationDeliveryGate).toHaveBeenCalledWith(expect.objectContaining({notificationCategory:'documents',channel:'email'}));
});
it('retries a disconnected database before transport without duplicating delivery',async()=>{
 const context=vi.fn().mockRejectedValueOnce(Object.assign(Error('Disconnected'),{code:'PROTOCOL_CONNECTION_LOST'}))
  .mockResolvedValue({recipient:{email:'example@example.test'},share:{client_id:41},agency:{name:'Synthetic'},portalUrl:'https://example.test/guardian'});
 const email=vi.fn().mockResolvedValue({id:'accepted'}),sms=vi.fn().mockResolvedValue({skipped:true});
 const process=createClinicalFormNotifier({db,context,email,sms});await process();
 expect(batches[0].email_state).toBe('pending');expect(email).not.toHaveBeenCalled();
 await process();await process();expect(batches[0].email_state).toBe('sent');expect(email).toHaveBeenCalledOnce();
});
it('does not replay a database failure raised inside delivery transport',async()=>{
 sendClientPortalEmail.mockRejectedValue(Object.assign(Error('Uncertain'),{code:'PROTOCOL_CONNECTION_LOST'}));
 const process=createClinicalFormNotifier({db});await process();await process();expect(sendClientPortalEmail).toHaveBeenCalledOnce();expect(batches[0].email_state).toBe('review');
});
it('retains queued email for review without claiming delivery or sending another message',async()=>{
 sendClientPortalEmail.mockResolvedValue({id:'approval-1',queued:true});const process=createClinicalFormNotifier({db});await process();await process();
 expect(sendClientPortalEmail).toHaveBeenCalledOnce();expect(batches[0].email_state).toBe('review');
});
it('renders the same agency and AuricWell frame as the shared QA-tested sender',()=>{
 const notice=clinicalPortalNotice({agencyName:'Synthetic agency',portalUrl:'https://example.test/guardian',locale:'es'});
 const html=renderPortalEmail({brand:{clinical:true,name:'Synthetic agency',agencyLogo:'https://example.test/logo.png',displayName:'AuricWell Portal',replyTo:'support@example.test',products:[]},...notice,linkUrl:'https://example.test/guardian'});
 expect(html).toContain('data-portal-email="v2"');expect(html).toContain('auricwell.com/auricwell/logo.png');expect(html).toContain('Synthetic agency');expect(html).toContain('lang="es"');expect(html).toContain('Abrir documentos y formularios');expect(html).not.toContain('#175b48');
});

it('applies the documents preference category to both clinical and operational assignment notices',()=>{
 expect(familyNotificationCategory('clinical_portal_documents')).toBe('documents');
 expect(familyNotificationCategory('client_portal_share')).toBe('documents');
});
