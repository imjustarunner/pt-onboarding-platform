import {beforeEach,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),connection:vi.fn(),find:vi.fn(),participants:vi.fn(),contacts:vi.fn(),
  guardians:vi.fn(),family:vi.fn(),sendEmail:vi.fn(),sendSms:vi.fn(),gate:vi.fn(),log:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{query:m.query,execute:m.execute,getConnection:m.connection}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:m.find,listParticipants:m.participants}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:m.guardians}}));
vi.mock('../../models/ClientContactAffiliation.model.js',()=>({default:{listReminderRecipientsForClient:m.contacts}}));
vi.mock('../../models/PhoneNumber.model.js',()=>({default:{normalizePhone:value=>value?`+${String(value).replace(/\D/g,'').replace(/^(?=\d{10}$)/,'1')}`:null}}));
vi.mock('../appointmentFamilyRecipients.service.js',()=>({appointmentFamilyRecipients:m.family}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:m.sendSms}}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn(async()=>'+13035550000'),recordedReminderConsent:vi.fn(async()=>null)}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:vi.fn(async()=>({isSchool:false})),buildSchoolReminder:vi.fn()}));
vi.mock('../appointmentReminder.service.js',()=>({logCommunication:m.log,cancelPendingReminders:vi.fn()}));
vi.mock('../appointmentReply.service.js',()=>({buildReminderMessage:vi.fn(()=> 'Clinical title and action token that must stay out of contact reminders'),buildConfirmationMessage:vi.fn(),interpretAppointmentReply:vi.fn()}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:vi.fn(async()=>null),INTAKE_COMMUNICATION_VERSION:'test'}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.sendEmail}));
vi.mock('../familyNotificationChoices.service.js',()=>({familyNotificationDeliveryGate:m.gate,latestFamilyEmailSchedulingChoice:vi.fn(async()=>null)}));
vi.mock('../appointmentCancellationNotification.service.js',()=>({processDueCancellationNotifications:vi.fn(async()=>({processed:0}))}));
vi.mock('../appointmentReplacementOffer.service.js',()=>({replacementOffers:{processBookings:vi.fn(async()=>({processed:0}))}}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{processDue:vi.fn(async()=>({processed:0}))}}));
vi.mock('../replacementOfferEvents.service.js',()=>({replacementOfferEvents:{processDue:vi.fn(async()=>({processed:0}))}}));
import {buildDeliveryPlan,processDueSessionNotifications} from '../sessionNotification.service.js';
import {contactReminderPhoneHash} from '../../utils/contactReminderConsent.js';

const appointment={id:104,agencyId:450,status:'scheduled',startAt:'2026-11-09T17:00:00Z',timeZone:'America/Denver',
 title:'SECRET clinical title',clientName:'SECRET client full name',noteBody:'SECRET clinical note',diagnosis:'SECRET diagnosis',
 actionUrl:'https://example.org/secret-token',providerUserId:1433};
const grandparent={affiliation_id:77,client_id:33,agency_id:450,contact_email:'grandparent@example.org',contact_phone:'+13035550123',
 email_reminders_enabled:1,sms_reminders_enabled:1,sms_opt_in:1,sms_consent_status:'opted_in',sms_consent_phone_hash:contactReminderPhoneHash('+13035550123')};
const row=(patch={})=>({id:17,appointment_id:104,agency_id:450,recipient_client_id:33,recipient_affiliation_id:77,channel:'email',kind:'standard_reminder',
 requires_confirmation:1,message_body:'SECRET clinical body with https://example.org/action-token',status:'pending',...patch});
let due;
beforeEach(()=>{
 vi.clearAllMocks();due=[row()];
 m.find.mockResolvedValue({...appointment});m.participants.mockResolvedValue([{clientId:33,receivesReminders:true}]);
 m.contacts.mockResolvedValue([{...grandparent}]);m.guardians.mockResolvedValue([{guardian_user_id:900,access_enabled:1,email:'parent@example.org',phone:'+13035550999'}]);
 m.family.mockResolvedValue({hasRelationships:true,recipients:[{userId:900}]});m.gate.mockResolvedValue({allowed:true});
 m.sendEmail.mockResolvedValue({id:'email-receipt'});m.sendSms.mockResolvedValue({id:'sms-receipt'});
 m.query.mockImplementation(async sql=>[sql.includes('SELECT r.* FROM appointment_reminders')?due:[]]);
 m.execute.mockImplementation(async sql=>{
   if(sql.includes('SELECT c.session_email_opt_in'))return [[{status:'ACTIVE',email:'parent@example.org',phone:'+13035550999',session_email_opt_in:0,session_sms_opt_in:0,session_phone_opt_in:0}]];
   if(sql.includes('FROM client_session_notification_preferences'))return [[{agency_id:450,client_id:33,guardian_user_id:900,channels_json:JSON.stringify({email:false,sms:false}),optional_reminders_enabled:1,confirmation_requests_enabled:0}]];
   if(sql.includes('SELECT * FROM platform_session_notification_settings'))return [[{channels_json:JSON.stringify({email:'available',sms:'consent_required',in_app:'available',phone:'disabled'}),min_rules_json:'[]'}]];
   if(sql.trimStart().startsWith('SELECT'))return [[]];
   return [{affectedRows:1}];
 });
 m.connection.mockImplementation(async()=>({execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT status')?[[{status:'pending'}]]:[[]]),release:vi.fn()}));
});

it('plans an independently authorized grandparent email when the parent has both email and SMS off',async()=>{
 const plan=await buildDeliveryPlan(104);
 expect(plan.deliveries.length).toBeGreaterThan(0);
 expect(plan.deliveries.every(item=>item.recipientAffiliationId===77 && item.recipientClientId===33 && item.channel==='email')).toBe(true);
 expect(plan.deliveries.every(item=>item.requiresConfirmation===false && item.messageBody===null)).toBe(true);
});

it('sends the grandparent email independently and includes only the minimal date/time reminder',async()=>{
 expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:1,failed:0});
 expect(m.sendEmail).toHaveBeenCalledWith(expect.objectContaining({to:'grandparent@example.org',agencyId:450,clientId:33,templateType:'appointment_affiliated_contact_reminder'}));
 const mail=m.sendEmail.mock.calls[0][0];
 expect(mail.text).toContain('Nov 9, 2026');expect(mail.text).toContain('10:00 AM');
 expect(mail.text).toContain('Please contact the account guardian for details');
 expect(`${mail.subject} ${mail.text} ${mail.html}`).not.toMatch(/SECRET|diagnosis|worksheet|90791|confirm|https?:|action-token/i);
 expect(m.sendSms).not.toHaveBeenCalled();
});

it.each([
 ['pending consent',{sms_consent_status:'pending',sms_opt_in:0}],
 ['a changed phone',{contact_phone:'+13035550124'}],
 ['STOP',{sms_consent_status:'stopped',sms_opt_in:0}]
])('does not deliver affiliated SMS with %s',async(_,change)=>{
 due=[row({channel:'sms'})];m.contacts.mockResolvedValue([{...grandparent,...change}]);
 expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:0,skipped:1});expect(m.sendSms).not.toHaveBeenCalled();expect(m.sendEmail).not.toHaveBeenCalled();
});

it('delivers only a minimal SMS for the exact currently consented phone',async()=>{
 due=[row({channel:'sms'})];expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:1});
 expect(m.sendSms).toHaveBeenCalledWith(expect.objectContaining({to:grandparent.contact_phone,agencyId:450,clientId:33,body:expect.stringContaining('Please contact the account guardian for details')}));
 expect(JSON.stringify(m.sendSms.mock.calls)).not.toContain('SECRET');
});

it.each([
 ['another appointment client',{recipient_client_id:34},null],
 ['another queued agency',{agency_id:451},null],
 ['another affiliation agency',{}, {agency_id:451}],
 ['another affiliation client',{}, {client_id:34}]
])('rejects a reminder scoped to %s',async(_,queueChange,contactChange)=>{
 due=[row(queueChange)];if(contactChange)m.contacts.mockResolvedValue([{...grandparent,...contactChange}]);
 expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:0,skipped:1});expect(m.sendEmail).not.toHaveBeenCalled();expect(m.sendSms).not.toHaveBeenCalled();
});

it('rechecks a removed authorizing guardian before a scheduled contact reminder',async()=>{
 // The model returns no authorized recipient after its guardian/self checks fail.
 m.contacts.mockResolvedValue([]);expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:0,skipped:1});
 expect(m.sendEmail).not.toHaveBeenCalled();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("skip_reason='contact_access_removed'"),[17]);
});

it('honors the recipient category opt-out at delivery instead of relying on queue-time permission',async()=>{
 m.gate.mockResolvedValue({allowed:false});expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:0,skipped:1});expect(m.sendEmail).not.toHaveBeenCalled();
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("skip_reason='contact_category_off'"),[17]);
});

it('allows an adult client own appointment but not another participant/client record',async()=>{
 m.family.mockResolvedValue({hasRelationships:false,recipients:[]});m.guardians.mockResolvedValue([]);
 expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:1});
 m.sendEmail.mockClear();due=[row({recipient_client_id:34})];
 expect(await processDueSessionNotifications({agencyId:450})).toMatchObject({sent:0,skipped:1});expect(m.sendEmail).not.toHaveBeenCalled();
});

it('expands a legacy reminder into deduplicated affiliation children using the parent reminder identity',async()=>{
 due=[row({recipient_affiliation_id:null,recipient_client_id:null})];
 await processDueSessionNotifications({agencyId:450});
 const inserted=m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT IGNORE INTO appointment_reminders') && sql.includes('recipient_affiliation_id'));
 expect(inserted).toHaveLength(1);expect(inserted[0][1].slice(-3)).toEqual([33,77,17]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("skip_reason='expanded_guardian_recipients'"),[17]);expect(m.sendEmail).not.toHaveBeenCalled();
});

it('uses the same unique parent/affiliation key if legacy expansion is retried',async()=>{
 due=[row({recipient_affiliation_id:null,recipient_client_id:null})];
 // Both workers can observe the legacy row; the child insert must remain
 // idempotent even before the legacy row's canceled state is observed.
 await processDueSessionNotifications({agencyId:450});await processDueSessionNotifications({agencyId:450});
 const inserted=m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT IGNORE INTO appointment_reminders') && sql.includes('recipient_affiliation_id'));
 expect(inserted).toHaveLength(2);expect(inserted[0][1]).toEqual(inserted[1][1]);expect(inserted[0][1].slice(-3)).toEqual([33,77,17]);
 const migration=await readFile(new URL('../../../../database/migrations/1723_contact_reminder_sms_consent.sql',import.meta.url),'utf8');
 expect(migration).toMatch(/UNIQUE KEY uq_reminder_parent_affiliation\s*\(parent_reminder_id,\s*recipient_affiliation_id\)/);
 expect(m.sendEmail).not.toHaveBeenCalled();
});

it('does not multiply a legacy email reminder when two affiliations point to the same address',async()=>{
 due=[row({recipient_affiliation_id:null,recipient_client_id:null})];m.contacts.mockResolvedValue([{...grandparent},{...grandparent,affiliation_id:78}]);
 await processDueSessionNotifications({agencyId:450});
 expect(m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT IGNORE INTO appointment_reminders') && sql.includes('recipient_affiliation_id'))).toHaveLength(1);
 expect(m.sendEmail).not.toHaveBeenCalled();
});
