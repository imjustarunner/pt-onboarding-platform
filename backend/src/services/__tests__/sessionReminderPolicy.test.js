import {expect,it} from 'vitest';
import {sessionRsvpState,scheduledReminderSpacing,sessionReminderMessage} from '../sessionReminderPolicy.js';
const now=new Date('2026-11-13T20:00:00Z');
it('keeps a scheduled reminder spaced by 24 hours outside the final five hours',()=>{
 expect(scheduledReminderSpacing({startAt:'2026-11-15 20:00:00',lastSentAt:'2026-11-13 19:00:00',now})).toEqual({allowed:false,availableAt:new Date('2026-11-14T19:00:00Z')});
 expect(scheduledReminderSpacing({startAt:'2026-11-15 20:00:00',lastSentAt:'2026-11-12 20:00:00',now}).allowed).toBe(true);
});
it.each([300,120,60,5])('allows a scheduled reminder %s minutes before the session despite a recent delivery',minutes=>{
 expect(scheduledReminderSpacing({startAt:new Date(+now+minutes*60000),lastSentAt:new Date(+now-60000),now}).allowed).toBe(true);
});
it.each(['confirmed','client_confirmed'])('sends friendly copy after %s without asking for another RSVP',status=>{
 const text=sessionReminderMessage({appointment:{status},when:'Sunday at 11 AM',requiresConfirmation:true,nearSession:true});
 expect(text).toContain('Sunday at 11 AM');expect(text).toContain('seeing you soon');expect(text).not.toContain('Reply Y');
});
it('asks an unanswered client to RSVP and does not append the shortcut twice',()=>{
 const options={appointment:{status:'scheduled'},when:'Sunday at 11 AM',requiresConfirmation:true};const text=sessionReminderMessage(options);
 expect(text).toContain('Reply Y to confirm, N to cancel, R to request a reschedule.');expect(sessionReminderMessage({...options,message:text})).toBe(text);
});
it.each(['cancel','cancel_blocked','declined','no'])('treats %s as declined even while cancellation policy review is pending',clientReply=>{
 expect(sessionRsvpState({status:'scheduled',cancellationRecommendationJson:{clientReply}})).toBe('declined');
});
