import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {appointmentJoinEmail,appointmentGoogleConference} from '../appointmentJoinEmail.service.js';
import {guardianAppointmentJoin} from '../guardianVirtualJoin.js';
const appointment={id:1,agencyId:6,providerUserId:20,status:'scheduled',modality:'TELEHEALTH',businessType:'tutoring',videoRoomMode:'external',externalMeetingUrl:'https://video.example.test/session'};
const client={client_id:22,agency_id:6};
const context={url:path=>'https://tenant.example/'+path};
function fixture(){const db={execute:vi.fn(async()=>[[{id:9}]])},authorize=vi.fn(async()=>client),conference=vi.fn();return {db,authorize,conference};}
it('uses the same saved external destination in the reminder and the authorized portal join',async()=>{
 const d=fixture();const result=await appointmentJoinEmail({appointment,clientId:22,to:'guardian@example.test',context},d);
 expect(result.url).toBe(await guardianAppointmentJoin(appointment,client,d.db));expect(result.text).toContain(appointment.externalMeetingUrl);expect(result.text).not.toContain('/tutoring-session/');expect(d.conference).not.toHaveBeenCalled();
});
it('omits room links and telephone credentials for contacts, disabled relationships, and limited service access',async()=>{
 for(const mode of ['contact','revoked','limited','billing']){
  const d=fixture();if(mode==='contact')d.db.execute.mockResolvedValue([[]]);
  if(mode==='revoked')d.authorize.mockRejectedValue(Object.assign(Error('Denied'),{status:403}));
  if(mode==='limited')d.authorize.mockResolvedValue({...client,portal_access:{limited:true}});
  if(mode==='billing')d.authorize.mockResolvedValue({...client,permissions_json:{billingOnly:true}});
  expect(await appointmentJoinEmail({appointment:{...appointment,includeGoogleDialIn:true},clientId:22,to:'other@example.test',context},d)).toBeNull();expect(d.conference).not.toHaveBeenCalled();
 }
});
it('includes phone instructions only after opt-in and verified Google availability',async()=>{
 const d=fixture();d.db.execute.mockImplementation(async sql=>sql.includes('google_meet_link')?[[{google_meet_link:'https://meet.google.com/abc-defg-hij'}]]:[[{id:9}]]);
 d.conference.mockResolvedValue({status:'available',phones:[{number:'+15555550100',pin:'123456789',telephoneUrl:'tel:+15555550100'}]});
 const google={...appointment,videoRoomMode:'unique_session',externalMeetingUrl:null,providerScheduleEventId:55};
 const input={appointment:google,clientId:22,to:'guardian@example.test',context};
 expect((await appointmentJoinEmail(input,d)).text).not.toContain('PIN');expect(d.conference).not.toHaveBeenCalled();
 const result=await appointmentJoinEmail({...input,appointment:{...google,includeGoogleDialIn:true}},d);
 expect(result.url).toBe('https://meet.google.com/abc-defg-hij');expect(result.text).toContain('Google Meet PIN: 123456789');
 d.conference.mockResolvedValue({status:'not_verified',phones:[]});expect((await appointmentJoinEmail({...input,appointment:{...google,includeGoogleDialIn:true}},d)).text).not.toContain('PIN');
});
it('never includes joining details for canceled or in-person appointments',async()=>{
 for(const changed of [{status:'canceled_by_provider'},{modality:'IN_PERSON'}]){const d=fixture();expect(await appointmentJoinEmail({appointment:{...appointment,...changed},clientId:22,to:'guardian@example.test',context},d)).toBeNull();expect(d.db.execute).not.toHaveBeenCalled();}
});
it('uses an actual attached counseling room for native client sessions',async()=>{
 const db={execute:vi.fn(async()=>[[{guest_invite_token:'synthetic-room-token'}]])};
 const native={...appointment,businessType:'mental_health',videoRoomMode:'unique_session',externalMeetingUrl:null};
 expect(await guardianAppointmentJoin(native,client,db)).toBe('/counseling/invite/synthetic-room-token');
 expect(await guardianAppointmentJoin({...native,status:'canceled_by_provider'},client,db)).toBeNull();
 expect(db.execute).toHaveBeenCalledTimes(1);
});
