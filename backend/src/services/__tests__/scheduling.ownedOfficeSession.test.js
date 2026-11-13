import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),create:vi.fn(),find:vi.fn(),bundle:vi.fn(),clients:vi.fn(),clinical:vi.fn(),window:vi.fn(),schedule:vi.fn(),notice:vi.fn(),materialize:vi.fn(),channels:vi.fn(),mirror:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,release:vi.fn()})},onTableWrite:()=>()=>{}}));
vi.mock('../../models/OfficeEvent.model.js',()=>({default:{lockNameForSlot:({roomId})=>`office_room:${roomId}`,findById:async id=>events.find(row=>row.id===id)}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findByOfficeEventId:m.find}}));
vi.mock('../googleCalendar.service.js',()=>({default:{upsertBookedOfficeEvent:m.mirror}}));
vi.mock('../appointment.service.js',()=>({createAppointment:m.create,getAppointmentBundle:m.bundle}));
vi.mock('../appointmentClinicalLink.service.js',()=>({assertAppointmentClients:m.clients,ensureAppointmentClinicalLink:m.clinical}));
vi.mock('../clientSchedulingGuard.service.js',()=>({withClientSchedulingLock:async(ids,work)=>work()}));
vi.mock('../appointmentConflict.service.js',()=>({assertAppointmentWindowAvailable:m.window}));
vi.mock('../sessionNotification.service.js',()=>({scheduleSessionNotifications:m.schedule}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{queue:m.notice}}));
vi.mock('../officeScheduleMaterializer.service.js',()=>({default:{materializeWeek:m.materialize,invalidateOffice:vi.fn()}}));
vi.mock('../appointmentNotificationCustomization.service.js',async()=>({...(await vi.importActual('../appointmentNotificationCustomization.service.js')),validateCustomReminderChannels:m.channels}));
import {bookSessionInOwnedOffice,ownedOfficeSessionOccurrences} from '../ownedOfficeSession.service.js';
let events,appointments;
const input={office:{id:1,timezone:'America/Denver'},roomId:10,providerId:501,actorUserId:501,agencyId:377,clientId:81,
 startAt:'2026-11-26 22:00:00',endAt:'2026-11-26 23:00:00',recurrence:'BIWEEKLY',occurrenceCount:2,serviceCode:'90837',modality:'IN_PERSON',serviceLocationId:44};
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
 events=['2026-11-26','2026-12-10'].map((day,i)=>({id:18510+i,office_location_id:1,room_id:10,start_at:`${day} 22:00:00`,end_at:`${day} 23:00:00`,assigned_provider_id:501,booked_provider_id:501,status:'BOOKED',slot_state:'ASSIGNED_BOOKED',standing_assignment_id:283,booking_plan_id:350,client_id:null,session_context_json:{agencyId:2}}));appointments=[];
 m.find.mockImplementation(async eventId=>appointments.find(a=>a.officeEventId===eventId));m.bundle.mockImplementation(async id=>appointments.find(a=>a.id===id));
 m.create.mockImplementation(async data=>{const a={...data,id:100+appointments.length,officeEventId:data.officeEventId,status:'scheduled'};appointments.push(a);return a;});
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT * FROM office_events'))return [events.filter(e=>e.start_at<=args[2]&&e.end_at>=args[3])];
  if(sql.startsWith('UPDATE office_events SET client_id')){const e=events.find(e=>e.id===args[7]);e.client_id=args[0];e.session_context_json=JSON.parse(args[6]);}
  if(sql.startsWith('UPDATE office_events SET session_context_json=?'))events.find(e=>e.id===args[1]).session_context_json=JSON.parse(args[0]);
  if(sql.includes("'$.reservedSessionBookingComplete'"))events.find(e=>e.id===args[0]).session_context_json.reservedSessionBookingComplete=true;
  return [{affectedRows:1}];
 });
});
afterEach(()=>vi.useRealTimers());
it('books an Inner Strength series into the provider’s ITSCO-tagged reservation, without requesting or reassigning the room',async()=>{
 const result=await bookSessionInOwnedOffice(input);
 expect(result).toMatchObject({kind:'auto_booked',officeEventId:18510,appointmentIds:[100,101]});
 expect(m.clients).toHaveBeenCalledWith(377,[{clientId:81}]);expect(m.create).toHaveBeenCalledTimes(2);
 for(const [data] of m.create.mock.calls)expect(data).toMatchObject({agencyId:377,providerUserId:501,roomId:10,source:expect.stringMatching(/^reserved_office_session:/),deferScheduleNotice:true});
 expect(events.map(e=>[e.assigned_provider_id,e.standing_assignment_id,e.booking_plan_id,e.session_context_json.agencyId])).toEqual([[501,283,350,377],[501,283,350,377]]);
 expect(m.execute.mock.calls.some(([sql])=>/UPDATE office_standing_assignments|INSERT INTO office_booking_requests|UPDATE office_booking_plans/.test(sql))).toBe(false);
});
it('validates the entire series before changing any date if a later room belongs to someone else',async()=>{
 events[1].assigned_provider_id=999;events[1].booked_provider_id=999;
 await expect(bookSessionInOwnedOffice(input)).rejects.toMatchObject({status:409,blockedDate:'2026-12-10'});
 expect(m.create).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('leaves a new or another provider’s office request in the existing approval workflow',async()=>{
 events[0].assigned_provider_id=999;events[0].booked_provider_id=999;
 expect(await bookSessionInOwnedOffice(input)).toBeNull();expect(m.create).not.toHaveBeenCalled();
});
it('never overwrites a client appointment already occupying the owner’s room',async()=>{
 events[0].client_id=99;
 await expect(bookSessionInOwnedOffice(input)).rejects.toThrow('already contains a client session');expect(m.create).not.toHaveBeenCalled();
});
it('checks the provider calendar before writing any part of a series',async()=>{
 m.window.mockRejectedValueOnce(Object.assign(new Error('A real client appointment overlaps'),{status:409}));
 await expect(bookSessionInOwnedOffice(input)).rejects.toThrow('real client appointment');expect(m.create).not.toHaveBeenCalled();m.window.mockReset();
});
it('makes an identical retry idempotent without duplicating sessions or notices',async()=>{
 await bookSessionInOwnedOffice(input);await bookSessionInOwnedOffice(input);
 expect(m.create).toHaveBeenCalledTimes(2);expect(m.notice).toHaveBeenCalledTimes(2);expect(m.clinical).toHaveBeenCalledTimes(2);
});
it('resumes an interrupted series without creating the first session twice or notifying a partial series',async()=>{
 const create=m.create.getMockImplementation();let failed=false;
 m.create.mockImplementation(async data=>{if(data.officeEventId===18511&&!failed){failed=true;throw new Error('Temporary save failure');}return create(data);});
 await expect(bookSessionInOwnedOffice(input)).rejects.toMatchObject({code:'BOOKING_INCOMPLETE',createdAppointmentIds:[100]});expect(m.notice).not.toHaveBeenCalled();
 const result=await bookSessionInOwnedOffice(input);expect(result.appointmentIds).toEqual([100,101]);expect(appointments).toHaveLength(2);expect(m.notice).toHaveBeenCalledTimes(2);
});
it('keeps the reserved wall time across daylight saving changes',()=>{
 const dates=ownedOfficeSessionOccurrences({...input,startAt:'2027-03-04 22:00:00',endAt:'2027-03-04 23:00:00',timeZone:'America/Denver'});
 expect(dates.map(row=>row.startAt)).toEqual(['2027-03-04 22:00:00','2027-03-18 21:00:00']);
});
