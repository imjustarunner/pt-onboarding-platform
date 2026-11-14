import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),cancelOffice:vi.fn(),cancelPrimary:vi.fn(),allowed:vi.fn(),event:vi.fn(),roomExecute:vi.fn(),release:vi.fn(),usage:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>{}}));
vi.mock('../googleCalendar.service.js',()=>({default:{cancelBookedOfficeEvent:m.cancelOffice,cancelProviderPrimaryCalendarEvent:m.cancelPrimary}}));
vi.mock('../scheduleCalendarPolicy.service.js',()=>({googleScheduleAllowedForEmail:m.allowed}));
vi.mock('../../models/OfficeEvent.model.js',()=>({default:{findById:m.event,withRoomSlotLock:async(args,work)=>work({execute:m.roomExecute})}}));
vi.mock('../../models/BookingPackage.model.js',()=>({default:{applyAppointmentUsage:m.usage}}));
vi.mock('../appointmentCalendarMaintenance.service.js',()=>({releaseAppointmentCalendar:m.release}));
import {cleanupGuardianCancellationCalendar} from '../guardianCancellationCalendar.service.js';
beforeEach(()=>{vi.resetAllMocks();m.cancelOffice.mockResolvedValue({ok:true});m.cancelPrimary.mockResolvedValue({ok:true});m.event.mockResolvedValue(null);m.execute.mockResolvedValue([[{google_event_id:'google-copy',email:'provider@example.test'}]]);});
it('does not call Google for a password/non-SSO provider calendar',async()=>{
 m.allowed.mockResolvedValue(false);await cleanupGuardianCancellationCalendar({id:1,agencyId:377,providerScheduleEventId:9});expect(m.cancelPrimary).not.toHaveBeenCalled();
});
it('removes the existing SSO copy without per-date guest emails',async()=>{
 m.allowed.mockResolvedValue(true);await cleanupGuardianCancellationCalendar({id:1,agencyId:377,providerScheduleEventId:9});
 expect(m.cancelPrimary).toHaveBeenCalledWith({subjectEmail:'provider@example.test',googleEventId:'google-copy',sendUpdates:'none'});
});
it('preserves an active provider’s standing room reservation without copying client context into it',async()=>{
 m.event.mockResolvedValue({id:18510,status:'CANCELLED',room_id:10,standing_assignment_id:283,assigned_provider_id:501,office_location_id:1,start_at:'2027-01-01 22:00:00',end_at:'2027-01-01 23:00:00',session_context_json:{agencyId:377,clientId:81}});
 m.roomExecute.mockImplementation(async sql=>sql.startsWith('SELECT s.id')?[[{id:283,provider_id:501}]]:sql.startsWith('SELECT id')?[[]]:[{affectedRows:1}]);
 await cleanupGuardianCancellationCalendar({id:1,agencyId:377,officeEventId:18510},9);
 expect(m.cancelOffice).toHaveBeenCalledWith({officeEventId:18510,sendUpdates:'none'});
 const insert=m.roomExecute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO office_events'));
 expect(insert[1]).toContain(501);expect(insert[1]).not.toContain(81);expect(JSON.parse(insert[1].at(-1))).toEqual({agencyId:377,bookingSource:'office_assignment'});
 expect(m.roomExecute.mock.calls.some(([sql])=>sql.startsWith('UPDATE office_standing_assignments'))).toBe(false);
});
it('finishes credits and calendar release if a previous attempt stopped after saving cancellation status',async()=>{
 await cleanupGuardianCancellationCalendar({id:1,agencyId:377,status:'late_canceled',packageEntitlementId:21,cancellationRecommendationJson:{recommendedPackageAction:'release'}},9);
 expect(m.usage).toHaveBeenCalledWith({entitlementId:21,agencyId:377,appointmentId:1,mode:'release',actorUserId:9});
 expect(m.release).toHaveBeenCalledWith(expect.objectContaining({id:1}),9,{preserveProviderReservation:true});
});
