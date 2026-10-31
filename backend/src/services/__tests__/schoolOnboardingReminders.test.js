import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../email.service.js',()=>({default:{sendEmail:m.send}}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolvePreferredSenderIdentityForAgency:async()=>null}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../schoolOnboarding.service.js',()=>({buildOnboardingLink:token=>`https://app.example.test/school-onboarding/${token}`}));
import { deliverOnboardingEmail, runSchoolOnboardingReminders } from '../schoolOnboardingReminder.service.js';
import { onboardingReminderDue, onboardingEmailStatus } from '../../utils/schoolOnboardingReminder.js';
const invite={id:18,agency_id:2,primary_user_id:44,status:'invited',contact_email:'school@example.test',contact_first_name:'School',school_name:'Example School',agency_name:'Agency',token:'saved-link',invite_email_sent_at:'2026-10-01T16:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([{affectedRows:1,insertId:50}]);m.send.mockResolvedValue({id:'gmail-receipt',communicationId:51});});
it('sends after ten days from the actual invitation, not creation or last view, and stops after completion',()=>{
 expect(onboardingReminderDue(invite,new Date('2026-10-11T15:59:59Z'))).toBe(false);
 expect(onboardingReminderDue(invite,new Date('2026-10-11T16:00:00Z'))).toBe(true);
 for(const patch of [{status:'submitted'},{status:'revoked'},{submitted_at:'2026-10-10'},{invite_email_sent_at:null},{contact_email:''}])expect(onboardingReminderDue({...invite,...patch},new Date('2026-10-30'))).toBe(false);
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
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT i.*')?[[invite]]:sql.startsWith('SELECT * FROM school_onboarding_invites')?[[{...invite,status:'submitted'}]]:[{affectedRows:1}]);
 expect(await runSchoolOnboardingReminders({now:new Date('2026-10-30')})).toEqual([]);expect(m.send).not.toHaveBeenCalled();
});
it('dry run lists due invitations without sending or writing delivery state',async()=>{
 m.execute.mockResolvedValue([[invite]]);
 expect(await runSchoolOnboardingReminders({now:new Date('2026-10-30'),dryRun:true})).toEqual([{inviteId:18,status:'due'}]);
 expect(m.execute).toHaveBeenCalledTimes(1);expect(m.send).not.toHaveBeenCalled();
});
