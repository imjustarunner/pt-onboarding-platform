import {describe,it,expect} from 'vitest';
import {guardianReminderDue,guardianReminderNextDate} from '../coGuardianReminderPolicy.js';
const now=new Date('2026-10-29T18:00:00Z');
const fixture=()=>({now,schedule:{state:'active',reminders_attempted:0,recipient_email:'parent@example.com',next_due_at:now},invite:{status:'pending',expires_at:'2026-11-17T18:00:00Z',invited_email:'parent@example.com'},lastDelivery:{delivery_status:'sent',created_at:'2026-10-27T18:00:00Z'}});
it('allows the first reminder after two full days',()=>expect(guardianReminderDue(fixture())).toBe(true));
it.each(['accepted','revoked','expired'])('never reminds a %s enrollment',status=>{const f=fixture();f.invite.status=status;expect(guardianReminderDue(f)).toBe(false);});
it.each(['failed','bounced','pending','sending'])('does not chase a %s delivery',status=>{const f=fixture();f.lastDelivery.delivery_status=status;expect(guardianReminderDue(f)).toBe(false);});
it('stops after two automatic attempts and does not enroll historical invitations',()=>{expect(guardianReminderDue({...fixture(),schedule:null})).toBe(false);const f=fixture();f.schedule.reminders_attempted=2;expect(guardianReminderDue(f)).toBe(false);});
it('rejects changed recipients, expiration and held schedules',()=>{for(const change of [f=>f.invite.invited_email='different@example.com',f=>f.invite.expires_at='2026-10-28',f=>f.schedule.state='held']){const f=fixture();change(f);expect(guardianReminderDue(f)).toBe(false);}});
it('waits two days after a manual resend even if the original reminder was due',()=>{const f=fixture();f.lastDelivery.created_at='2026-10-28T18:00:00Z';expect(guardianReminderDue(f)).toBe(false);});
it('schedules the final reminder at day seven, or at least two days after a delayed first reminder',()=>{
 expect(guardianReminderNextDate('2026-10-27T18:00:00Z',1,now).toISOString()).toBe('2026-11-03T18:00:00.000Z');
 expect(guardianReminderNextDate('2026-10-27T18:00:00Z',1,new Date('2026-11-04T18:00:00Z')).toISOString()).toBe('2026-11-06T18:00:00.000Z');
 expect(guardianReminderNextDate('2026-10-27T18:00:00Z',2,now)).toBeNull();
});
