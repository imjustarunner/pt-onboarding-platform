import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn()}));
vi.mock('../schoolOnboardingEmail.service.js',()=>({sendSchoolOnboardingMessage:m.send}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../email.service.js',()=>({default:{sendEmail:m.send}}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolvePreferredSenderIdentityForAgency:async()=>null}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../schoolOnboarding.service.js',()=>({buildOnboardingLink:token=>`https://app.example.test/school-onboarding/${token}`}));
import { deliverOnboardingEmail, runSchoolOnboardingReminders } from '../schoolOnboardingReminder.service.js';
import { onboardingReminderDue, onboardingReminderKey, onboardingEmailStatus } from '../../utils/schoolOnboardingReminder.js';
const invite={id:18,agency_id:2,primary_user_id:44,status:'invited',contact_email:'school@district.test',contact_first_name:'School',school_name:'Example School',agency_name:'Agency',token:'saved-link',invite_email_sent_at:'2026-10-01T16:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([{affectedRows:1,insertId:50}]);m.send.mockResolvedValue({id:'gmail-receipt',communicationId:51});});
it('sends weekly from the last actual email, and stops after completion',()=>{
 expect(onboardingReminderDue(invite,new Date('2026-10-08T15:59:59Z'))).toBe(false);
 expect(onboardingReminderDue(invite,new Date('2026-10-08T16:00:00Z'))).toBe(true);
 for(const patch of [{status:'submitted'},{status:'revoked'},{submitted_at:'2026-10-10'},{contact_email:''}])expect(onboardingReminderDue({...invite,...patch},new Date('2026-10-30'))).toBe(false);
});
it.each([[{queued:true,communicationId:51},'queued'],[{skipped:true},'failed'],[{blocked:true,id:'log-only'},'failed'],[{redirected:true,id:'test-mail'},'redirected'],[{},'review']])('does not report %j as a sent invitation',async(result,status)=>{
 const delivery=await deliverOnboardingEmail({invite,send:async()=>result});
 expect(delivery).toMatchObject({sent:false,status});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE school_onboarding_invites'))).toBe(false);
});
it('records a confirmed send and starts the reminder timer only then',async()=>{
 const delivery=await deliverOnboardingEmail({invite,send:m.send});expect(delivery.sent).toBe(true);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('invite_email_sent_at=UTC_TIMESTAMP()'))).toBe(true);
});
it('claims a reminder once across competing workers and leaves uncertain attempts for review',async()=>{
 m.execute.mockResolvedValueOnce([{affectedRows:1,insertId:50}]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:0}]);
 expect((await deliverOnboardingEmail({invite,kind:'reminder',deliveryKey:'reminder',send:m.send})).sent).toBe(true);
 expect(await deliverOnboardingEmail({invite,kind:'reminder',deliveryKey:'reminder',send:m.send})).toMatchObject({sent:false,reason:'already_attempted'});
 expect(m.send).toHaveBeenCalledTimes(1);
 m.execute.mockResolvedValue([{affectedRows:1,insertId:52}]);m.send.mockRejectedValue(new Error('connection lost'));
 await expect(deliverOnboardingEmail({invite,kind:'reminder',send:m.send})).rejects.toThrow('connection lost');
 expect(m.execute.mock.calls.at(-1)[0]).toContain("delivery_status='review'");
});
it('rechecks completion before sending a due reminder',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT i.*')?(sql.includes('AND i.id=?')?[[{...invite,status:'submitted'}]]:[[invite]]):[{affectedRows:1}]);
 expect(await runSchoolOnboardingReminders({now:new Date('2026-10-30')})).toEqual([]);expect(m.send).not.toHaveBeenCalled();
});
it('dry run lists due invitations without sending or writing delivery state',async()=>{
 m.execute.mockResolvedValue([[invite]]);
 expect(await runSchoolOnboardingReminders({now:new Date('2026-10-30'),dryRun:true})).toEqual([{inviteId:18,status:'due'}]);
 expect(m.execute).toHaveBeenCalledTimes(1);expect(m.send).not.toHaveBeenCalled();
});

it('includes a never-emailed draft after seven days without confusing it with a closed school',()=>{
 const draft={...invite,invite_email_sent_at:null,created_at:'2026-10-01T16:00:00Z'};
 expect(onboardingReminderDue(draft,new Date('2026-10-08T15:59:59Z'))).toBe(false);
 expect(onboardingReminderDue(draft,new Date('2026-10-08T16:00:00Z'))).toBe(true);
 expect(onboardingReminderDue({...draft,contact_email:'someone@email.com'},new Date('2026-11-01'))).toBe(false);
 expect(onboardingReminderDue({...draft,unresolved_reminder_count:1},new Date('2026-11-01'))).toBe(false);
});
it('does not send twice around a calendar week boundary; successful sends restart the seven-day interval',()=>{
 const last={...invite,last_onboarding_email_sent_at:'2026-11-08T23:59:00Z'};
 expect(onboardingReminderDue(last,new Date('2026-11-09T00:00:00Z'))).toBe(false);
 expect(onboardingReminderDue(last,new Date('2026-11-15T23:59:00Z'))).toBe(true);
 expect(onboardingReminderKey(last)).not.toBe(onboardingReminderKey(invite));
});
it('sends a pending draft with a direct continuation link, and claims it against its last email',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT i.*')?[[invite]]:[{affectedRows:1,insertId:50}]);
 const result=await runSchoolOnboardingReminders({now:new Date('2026-10-30')});
 expect(result[0].sent).toBe(true);
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({kind:'reminder',link:'https://app.example.test/school-onboarding/saved-link',text:expect.stringContaining('please complete your school onboarding on SchoolCareBridge')}));
 expect(m.execute.mock.calls.find(([sql])=>sql.includes('INSERT IGNORE'))[1][2]).toBe(onboardingReminderKey(invite));
});
