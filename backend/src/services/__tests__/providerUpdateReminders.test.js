import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../providerUpdate.service.js',()=>({buildProviderUpdatePublicUrl:vi.fn()}));
vi.mock('../providerUpdateRecipient.service.js',()=>({resolveProviderUpdateRecipients:vi.fn()}));
vi.mock('../providerUpdateEmailSender.service.js',()=>({resolveProviderUpdateSender:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../smsCompliance.service.js',()=>({resolveRegisteredSmsSender:vi.fn(),prepareSmsDelivery:vi.fn()}));
vi.mock('../vonage.service.js',()=>({default:{sendSms:vi.fn()}}));
vi.mock('../../models/NotificationSmsLog.model.js',()=>({default:{}}));
import {createProviderUpdateReminders} from '../providerUpdateReminders.service.js';
import {assertProviderUpdateReminderDelivery} from '../providerUpdateReminderGuard.service.js';
import {reminderDay,reminderRecipientSql,providerUpdateReminderMessage} from '../../utils/providerUpdateReminders.js';
import {phoneFingerprint} from '../../utils/staffCommunicationChoices.js';
let db,service,deps,eligible,settings,ledger,prefs,push;
const now=new Date('2026-10-13T15:01:00Z');
const person={id:1,push_id:5,agency_id:2,provider_user_id:10,token:'saved-token',first_name:'Sample',email:'personal@example.org',work_email:'staff@itsco.health',personal_phone:'+17195550123',slug:'itsco',sms_enabled:1};
beforeEach(()=>{
 eligible=true;settings={push_id:5,enabled:1,sms_enabled:1,timezone:'America/Denver',local_hour:9};ledger=[];push={id:5,status:'sent',title:'Staff Update'};
 prefs={sms_enabled:1,notification_categories:{staff_communications_2:{choices:{notifications:true},phoneHash:phoneFingerprint(person.personal_phone)}}};
 db={execute:vi.fn(async(sql,args=[])=>{
   if(sql.startsWith('SELECT id,status,title'))return [[push].filter(Boolean)];
   if(sql.startsWith('SELECT enabled,sms_enabled'))return [[settings]];
   if(sql.startsWith('SELECT d.channel'))return [[]];
   if(sql.startsWith('INSERT INTO provider_update_reminder_settings')){settings.enabled=args[1];settings.sms_enabled=args[2];return [{affectedRows:1}];}
   if(sql.startsWith('SELECT s.*'))return [[settings].filter(s=>s.enabled)];
   if(sql.startsWith('SELECT r.*'))return [[{...person,sms_enabled:settings.sms_enabled}].filter(()=>eligible&&settings.enabled)];
   if(sql.startsWith('SELECT r.id'))return [[{id:1}].filter(()=>eligible&&settings.enabled)];
   if(sql.startsWith('SELECT sms_enabled'))return [[prefs]];
   if(sql.startsWith('INSERT IGNORE INTO provider_update_reminder_deliveries')){
     if(ledger.some(d=>d.recipient===args[0]&&d.channel===args[2]&&(d.date===args[1]||['sending','pending'].includes(d.status))))return [{affectedRows:0}];
     ledger.push({id:ledger.length+1,recipient:args[0],date:args[1],channel:args[2],status:'sending'});return [{affectedRows:1,insertId:ledger.length}];
   }
   if(sql.startsWith('UPDATE provider_update_reminder_deliveries SET')){Object.assign(ledger.find(d=>d.id===args[5]),{status:args[0],reason:args[1],communicationId:args[2]});return [{affectedRows:1}];}
   if(sql.startsWith('UPDATE provider_update_reminder_deliveries d JOIN'))return [{affectedRows:0}];
   throw Error('Unexpected SQL: '+sql);
 })};
 deps={db,resolveRecipients:vi.fn(async()=>[{...person,work_email:'staff@itsco.health'}]),resolveSender:vi.fn(async()=>({identity:{id:7},replyTo:'po@itsco.health'})),sendEmail:vi.fn(async()=>({id:'email-id',communicationId:22})),resolveSmsSender:vi.fn(async()=>'+17195559999'),prepareSms:vi.fn(async()=>({})),sendSms:vi.fn(async()=>({sid:'sms-id'})),smsLog:{create:vi.fn(async()=>({id:33})),updateStatus:vi.fn(async()=>{})},buildLink:vi.fn((token,slug)=>`https://app.itsco.health/${slug}/provider-update/${token}`)};
 service=createProviderUpdateReminders(deps);
});
it.each(['2026-10-13T14:59:00Z','2026-10-14T00:00:00Z'])('does not send before 9am or overnight: %s',async date=>{await service.run({now:new Date(date)});expect(deps.sendEmail).not.toHaveBeenCalled();expect(deps.sendSms).not.toHaveBeenCalled();});
it.each([['2026-10-13T15:00:00Z','2026-10-13'],['2026-11-03T16:00:00Z','2026-11-03'],['2026-10-17T15:00:00Z','2026-10-17']])('handles daylight saving and weekends: %s',(date,day)=>{expect(reminderDay(new Date(date))).toEqual({due:true,date:day});});
it('emails the work address with the existing secure link and People Operations reply address',async()=>{await service.run({now});expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({to:'staff@itsco.health',replyToOverride:'po@itsco.health',templateType:'provider_update_reminder',text:expect.stringContaining('/itsco/provider-update/saved-token')}));expect(deps.sendEmail.mock.calls[0][0]).not.toHaveProperty('bcc');expect(ledger.map(d=>d.status)).toEqual(['sent','sent']);});
it('suppresses duplicates across overlapping workers and ticks, then sends the next day',async()=>{await Promise.all([service.run({now}),service.run({now})]);await service.run({now});expect(deps.sendEmail).toHaveBeenCalledOnce();expect(deps.sendSms).toHaveBeenCalledOnce();await service.run({now:new Date('2026-10-14T15:01:00Z')});expect(deps.sendEmail).toHaveBeenCalledTimes(2);});
it('stops when the recipient completes, including between email and SMS',async()=>{deps.sendEmail.mockImplementation(async()=>{eligible=false;return {id:'sent'};});await service.run({now});expect(deps.sendEmail).toHaveBeenCalledOnce();expect(deps.sendSms).not.toHaveBeenCalled();await service.run({now:new Date('2026-10-14T15:01:00Z')});expect(deps.sendEmail).toHaveBeenCalledOnce();});
it('rechecks eligibility after slow sender/address resolution',async()=>{deps.resolveSender.mockImplementation(async()=>{eligible=false;return {identity:{id:7}};});await service.run({now});expect(deps.sendEmail).not.toHaveBeenCalled();});
it('does not send anything when reminders are paused',async()=>{settings.enabled=0;await service.run({now});expect(deps.sendEmail).not.toHaveBeenCalled();expect(deps.sendSms).not.toHaveBeenCalled();});
it('does not fall back to a personal email when work email is missing',async()=>{deps.resolveRecipients.mockResolvedValue([{...person,work_email:null}]);await service.run({now});expect(deps.sendEmail).not.toHaveBeenCalled();expect(ledger[0].reason).toBe('missing_work_email');});
it('requires a matching saved phone and staff-reminder choice',async()=>{prefs.notification_categories.staff_communications_2.phoneHash='old-phone';await service.run({now});expect(deps.sendSms).not.toHaveBeenCalled();expect(deps.sendEmail).toHaveBeenCalledOnce();});
it.each([false,undefined])('never infers staff SMS opt-in: %s',async choice=>{prefs.notification_categories.staff_communications_2.choices.notifications=choice;await service.run({now});expect(deps.sendSms).not.toHaveBeenCalled();});
it.each(['sms_consent_required','sms_opted_out','sms_carrier_campaign_blocked'])('respects SMS restriction %s without blocking email',async code=>{deps.prepareSms.mockRejectedValue(Object.assign(Error('blocked'),{code}));await service.run({now});expect(deps.sendSms).not.toHaveBeenCalled();expect(deps.sendEmail).toHaveBeenCalledOnce();expect(ledger[1].reason).toBe(code);});
it('rechecks carrier and consent in transport and logs an accepted text',async()=>{await service.run({now});expect(deps.prepareSms).toHaveBeenCalledWith(expect.objectContaining({purpose:'workforce',staffNotificationKind:'notifications'}));expect(deps.sendSms).toHaveBeenCalledWith(expect.objectContaining({body:expect.stringContaining('saved-token')}));expect(deps.smsLog.updateStatus).toHaveBeenCalledWith(33,expect.objectContaining({status:'sent',providerRef:'sms-id'}));});
it('does not pile up pending approval emails on subsequent days',async()=>{deps.sendEmail.mockResolvedValue({queued:true,communicationId:22});await service.run({now});await service.run({now:new Date('2026-10-14T15:01:00Z')});expect(deps.sendEmail).toHaveBeenCalledOnce();expect(ledger[0].status).toBe('pending');});
it('keeps an ambiguous transport failure for review rather than sending it again',async()=>{deps.sendEmail.mockRejectedValue(Object.assign(Error('timeout'),{code:'ETIMEDOUT'}));await service.run({now});await service.run({now:new Date('2026-10-14T15:01:00Z')});expect(deps.sendEmail).toHaveBeenCalledOnce();expect(ledger[0].status).toBe('sending');expect(deps.sendSms).toHaveBeenCalledTimes(2);});
it('distinguishes an email policy block from a successful send',async()=>{deps.sendEmail.mockResolvedValue({blocked:true,reason:'quality_gate'});const result=await service.run({now});expect(result.email.failed).toBe(1);expect(ledger[0].status).toBe('failed');});
it.each([{status:'draft',title:'Update'},{status:'sent',title:'[PREVIEW] Update'},{status:'closed',title:'Update'}])('rejects activation for $status $title',async invalid=>{push=invalid;await expect(service.saveSettings({pushId:5,agencyId:2,enabled:true,smsEnabled:true,actorUserId:1})).rejects.toMatchObject({status:409});});
it('requires the update to belong to the agency',async()=>{push=null;await expect(service.getSettings(5,999)).rejects.toMatchObject({status:404});expect(db.execute.mock.calls[0][1]).toEqual([5,999]);});
it('requires explicit booleans for schedule changes',async()=>{await expect(service.saveSettings({pushId:5,agencyId:2,enabled:'true',smsEnabled:true,actorUserId:1})).rejects.toMatchObject({status:400});});
it('escapes names and links in the email and does not claim an attachment',()=>{const message=providerUpdateReminderMessage({firstName:'<script>',link:'https://example.org/?x="&y=2'});expect(message.html).not.toContain('<script>');expect(message.html).toContain('&lt;script&gt;');expect(message.text).not.toMatch(/attached/i);});
it('guards completed or paused reminders when an approval is released later',async()=>{eligible=false;await expect(assertProviderUpdateReminderDelivery({templateType:'provider_update_reminder',existingCommunicationId:22,userId:10,agencyId:2},db)).rejects.toMatchObject({code:'PROVIDER_UPDATE_REMINDER_CANCELLED'});expect(db.execute.mock.calls[0][1]).toEqual([10,2,22]);});
it('leaves other email workflows alone',async()=>{await assertProviderUpdateReminderDelivery({templateType:'other',existingCommunicationId:22},db);expect(db.execute).not.toHaveBeenCalled();});
it('keeps draft, uninvited, inactive, expired, locked, completed, and preview rows out of SQL selection',()=>{for(const clause of ["p.status='sent'","r.finalized_at IS NULL","r.locked_at IS NULL","r.expires_at>UTC_TIMESTAMP()","LEFT(r.token,8)<>'preview_'","u.is_demo","u.is_active","ua.is_active","u.is_archived","provider_update_sends","IN ('sent','delivered')"])expect(reminderRecipientSql).toContain(clause);});
