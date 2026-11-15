import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),create:vi.fn(),queue:vi.fn(),event:vi.fn(),link:vi.fn(),reminders:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../careInvitation.service.js',()=>({notifyCareInvitation:vi.fn()}));
vi.mock('../appointment.service.js',()=>({createAppointment:m.create,linkProviderScheduleEvent:m.link}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{create:m.event}}));
vi.mock('../appointmentClinicalLink.service.js',()=>({ensureAppointmentClinicalLink:vi.fn()}));
vi.mock('../sessionNotification.service.js',()=>({scheduleSessionNotifications:m.reminders}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{queue:m.queue}}));
import {bookCareInvitation} from '../careInvitationWorker.service.js';
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2029-12-01T00:00:00Z'));m.execute.mockResolvedValue([[]]);let id=0;m.create.mockImplementation(async data=>({...data,id:++id,status:'scheduled'}));m.event.mockResolvedValue({id:100});});
afterEach(()=>vi.useRealTimers());
it('uses the next-session booking policy for a virtual care-invitation series while retaining normal reminders',async()=>{
 const ids=await bookCareInvitation({id:12,agency_id:2,client_id:8,provider_user_id:5,created_by_user_id:6,modality:'TELEHEALTH',start_at:'2030-01-02 17:00:00',time_zone:'UTC',frequency:'WEEKLY',occurrence_count:3,service_code:'90837'});
 expect(ids).toEqual([1,2,3]);expect(m.reminders).toHaveBeenCalledTimes(3);expect(m.queue).toHaveBeenCalledTimes(3);
 for(const [,options] of m.queue.mock.calls)expect(options.facts.recurringBooking).toMatchObject({id:'care-invitation:12',nextAppointmentId:1,occurrenceCount:3});
 expect(m.link.mock.invocationCallOrder.at(-1)).toBeLessThan(m.queue.mock.invocationCallOrder[0]);
});
