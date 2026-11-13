import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import {buildCancellationNotification} from '../appointmentCancellationNotification.service.js';
import {buildScheduleNoticeMessage} from '../scheduleNoticeMessage.service.js';
const appointment={id:1,agencyId:2,status:'canceled_by_client',startAt:'2030-01-02T17:00:00Z',sourceTimezone:'America/Denver'};
const facts={eventType:'canceled',clientFacingReason:'Changing provider',followUpAction:'none',cancellationActorRole:'guardian',cancellationActorUserId:9,
 guardianCancellationOperationId:'operation-1',guardianSummary:{count:26,endsService:true,serviceLabel:'counseling',totalFeeCents:8000,teamNotified:true,notificationsDisabled:true},personalNote:'Thank you.\n<script>private note</script>'};
it('renders one full-series confirmation with total fees and an escaped italic personal note for its author',()=>{
 const cancellation=buildCancellationNotification(appointment,facts);
 const message=buildScheduleNoticeMessage([{appointment,payload:{eventType:'canceled',facts},cancellation}],'https://portal.example.test',{recipientUserId:9});
 expect(message.text).toContain('26 future appointments');expect(message.text).toContain('$80.00');expect(message.html).toContain('<em>Thank you.<br>&lt;script&gt;private note&lt;/script&gt;</em>');
 expect(message.html).not.toContain('<script>');expect(message.text).not.toContain('next scheduled appointment remains');
 expect(message.subject).toBe('Confirmation: your services have ended');expect(message.text).toContain('Our team has been notified');
 expect(message.text).toContain('Future email and text notifications for this service have been disabled');
 expect(message.html).toContain('serviceExit=operation-1');expect(message.text).toContain('Feedback is optional and does not restart');
});
it('gives another authorized guardian a consolidated schedule update without the author’s private reason or note',()=>{
 const cancellation=buildCancellationNotification(appointment,facts);
 const message=buildScheduleNoticeMessage([{appointment,payload:{eventType:'canceled',facts},cancellation}],'https://portal.example.test',{recipientUserId:10});
 expect(message.text).toContain('26 future appointments');expect(message.text).toContain('service with this provider has ended');expect(message.text).not.toContain(facts.clientFacingReason);expect(message.html).not.toContain('private note');
 expect(message.html).not.toContain('serviceExit=');
});
it('confirms the service ended without pretending to cancel more dates when the visible appointments were already canceled',()=>{
 const cancellation=buildCancellationNotification(appointment,{...facts,guardianSummary:{count:0,endsService:true,serviceLabel:'counseling',totalFeeCents:0}});
 expect(cancellation.text).toContain('No future appointments remained to cancel');expect(cancellation.text).toContain('You have ended counseling');expect(cancellation.text).not.toContain('0 future appointments');
});
