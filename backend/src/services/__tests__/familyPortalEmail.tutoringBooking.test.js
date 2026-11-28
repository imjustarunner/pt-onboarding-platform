import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({link:vi.fn(),name:vi.fn(),setting:vi.fn()}));
vi.mock('../appointmentEmailActions.service.js',()=>({createAppointmentEmailLink:m.link}));
vi.mock('../appointmentEmailDetails.service.js',()=>({appointmentEmailTutorName:m.name}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:m.setting}));
import {tutoringBookingResponseEmail} from '../tutoringBookingResponse.service.js';
const appointment={id:498,agencyId:453,businessType:'tutoring',status:'scheduled',modality:'VIRTUAL',learningContext:{serviceEnrollmentId:1038}};
const input={appointment,clientId:2545,to:'qa.nlu.coparent@example.com'};
beforeEach(()=>{
 vi.resetAllMocks();
 m.link.mockResolvedValue('https://example.test/api/public/appointment-response/synthetic-only');m.name.mockResolvedValue('Finley QA');m.setting.mockResolvedValue({isSchool:false});
});
it.each(['VIRTUAL','IN_PERSON'])('offers all three initial booking responses independently of the video rollout (%s)',async modality=>{
 const result=await tutoringBookingResponseEmail({...input,appointment:{...appointment,modality}});
 expect(result.links.map(l=>l.label)).toEqual(['Confirm tutoring session','Cancel tutoring session','Request a different time']);
 expect(result.reviewUrl.endsWith('?action=review')).toBe(true);expect(result.tutorName).toBe('Finley QA');
 expect(m.link).toHaveBeenCalledWith({...input,appointment:{...appointment,modality},isSchool:false});
});
it.each([{status:'confirmed'},{status:'client_confirmed'},{cancellationRecommendationJson:{clientReply:'confirm'}}])('does not ask for confirmation again after a saved RSVP %j',async change=>{
 const result=await tutoringBookingResponseEmail({...input,appointment:{...appointment,...change}});
 expect(result.links.map(l=>l.label)).toEqual(['Cancel tutoring session','Request a different time']);
});
it('preserves school cancellation-only policy',async()=>{
 m.setting.mockResolvedValue({isSchool:true});const result=await tutoringBookingResponseEmail(input);
 expect(result.links).toEqual([{label:'Cancel school session',url:expect.stringContaining('action=cancel')}]);
});
it('withholds actions when the shared appointment email response policy returns no link',async()=>{
 m.link.mockResolvedValue(null);
 expect(await tutoringBookingResponseEmail({...input,guardianUserId:1785})).toBeNull();
 expect(m.link).toHaveBeenCalledWith({...input,guardianUserId:1785,isSchool:false});
 expect(m.name).not.toHaveBeenCalled();
});
it.each([{businessType:'mental_health'},{status:'canceled_by_provider'},{status:'completed'}])('never adds booking responses for other products or ended sessions %j',async change=>{
 expect(await tutoringBookingResponseEmail({...input,appointment:{...appointment,...change}})).toBeNull();expect(m.link).not.toHaveBeenCalled();
});
