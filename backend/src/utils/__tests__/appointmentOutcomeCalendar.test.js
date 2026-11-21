import {it,expect} from 'vitest';import {missingAppointmentOutcomeEvents} from '../appointmentOutcomeCalendar.js';
const a={id:371,agencyId:453,providerUserId:1496,businessType:'tutoring',status:'no_show',startAt:'2026-11-17 21:00:00',endAt:'2026-11-17 22:00:00',learningContext:{subjectLabel:'Reading'}};
it('keeps a released office visit visible without inventing an office reservation or editable event',()=>{const [event]=missingAppointmentOutcomeEvents([a]);expect(event).toMatchObject({appointmentId:371,canonicalOutcome:true,canEdit:false,draggable:false,title:'Reading tutoring · No-show'});expect(event.id).toBeLessThan(0);expect(event).not.toHaveProperty('clientName');expect(event).not.toHaveProperty('bookedProviderId');});
it('does not duplicate a current calendar representation or fabricate a past outcome',()=>{expect(missingAppointmentOutcomeEvents([a],[{appointmentId:371}])).toEqual([]);expect(missingAppointmentOutcomeEvents([{...a,status:'scheduled'}])).toEqual([]);});

it('restores a missed appointment when its room now represents an opening',()=>{
 const opening={appointmentId:371,buildingId:5,roomId:18,status:'AVAILABLE'};
 expect(missingAppointmentOutcomeEvents([a],[opening])).toHaveLength(1);
 expect(missingAppointmentOutcomeEvents([a],[{...opening,status:'BOOKED'}])).toHaveLength(0);
});
