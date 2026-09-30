import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),directory:vi.fn(),location:vi.fn(),user:vi.fn(),agencies:vi.fn(),access:vi.fn(),documents:vi.fn()}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findById:mocks.location}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:mocks.user,getAgencies:mocks.agencies}}));
vi.mock('../../models/OfficeLocationAgency.model.js',()=>({default:{userHasAccess:mocks.access}}));
vi.mock('../../models/UserComplianceDocument.model.js',()=>({default:{findByUser:mocks.documents}}));
vi.mock('../officeKioskDirectory.service.js',async original=>({...await original(),loadOfficeDirectory:mocks.directory}));
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {sameDayWindow,bookingSegments,bookOfficeToday} from '../officeSameDayBooking.service.js';
import OfficeEvent from '../../models/OfficeEvent.model.js';
const now=new Date('2026-09-30T01:00:00Z');
describe('same-day reservations',()=>{
 it('uses office-local today and preserves quarter-hour minutes',()=>{expect(sameDayWindow({date:'2026-09-29',time:'19:15',endTime:'21:45'},'America/Denver',now)).toMatchObject({startAt:'2026-09-30 01:15:00',endAt:'2026-09-30 03:45:00'});});
 it.each([{date:'2026-09-30',time:'19:00',endTime:'20:00'},{date:'2026-09-29',time:'18:00',endTime:'20:00'},{date:'2026-09-29',time:'19:00',endTime:'18:00'},{date:'2026-09-29',time:'19:00'},{endTime:'22:00'}])('rejects future, past, reversed and incomplete windows %j',input=>{expect(()=>sameDayWindow(input,'America/Denver',now)).toThrow();});
 it('retains different standing owners across a multi-hour booking',()=>{expect(bookingSegments('16:00','18:00',[{startAt:'16:30',endAt:'17:00',assignedProvider:{id:4}},{startAt:'17:00',endAt:'19:00',assignedProvider:{id:5}}])).toEqual([{startAt:'16:00',endAt:'16:30',assignedProviderId:null},{startAt:'16:30',endAt:'17:00',assignedProviderId:4},{startAt:'17:00',endAt:'18:00',assignedProviderId:5}]);});
 it('serializes overlapping ranges using the same room lock',()=>{expect(OfficeEvent.lockNameForSlot({roomId:1,startAt:'16:00',endAt:'18:00'})).toBe(OfficeEvent.lockNameForSlot({roomId:1,startAt:'17:00',endAt:'19:00'}));expect(OfficeEvent.lockNameForSlot({roomId:2})).not.toBe(OfficeEvent.lockNameForSlot({roomId:1}));});
});

describe('same-day booking writes',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(now);
  mocks.location.mockResolvedValue({id:1,is_active:1,timezone:'America/Denver'});
  mocks.user.mockResolvedValue({id:7,is_active:1,status:'ACTIVE_EMPLOYEE',role:'provider'});
  mocks.agencies.mockResolvedValue([{id:2}]);mocks.access.mockResolvedValue(true);mocks.documents.mockResolvedValue([]);
  mocks.directory.mockResolvedValue({rooms:[{id:4,occupied:false,assignments:[]}]});
  vi.spyOn(OfficeEvent,'withRoomSlotLock').mockImplementation(async(_args,fn)=>fn({execute:mocks.execute}));
  mocks.execute.mockImplementation(async(sql)=>sql.includes('FROM office_rooms')?[[{id:4}]]:sql.includes('INSERT')?[{insertId:42}]:[[]]);
 });
 afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
 const book=()=>bookOfficeToday({user:{id:7},locationId:1,roomId:4,date:'2026-09-29',time:'19:15',endTime:'21:45'});
 it('books the full range for the signed-in provider without creating an approval request',async()=>{
  expect(await book()).toMatchObject({kind:'auto_booked',eventIds:[42]});
  const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT'));
  expect(insert[1]).toEqual([1,4,'2026-09-30 01:15:00','2026-09-30 03:45:00',null,7,7,7]);
  expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('office_booking_requests'))).toBe(false);
 });
 it('rejects an overlap anywhere in the requested range',async()=>{mocks.directory.mockResolvedValue({rooms:[{id:4,occupied:true}]});await expect(book()).rejects.toMatchObject({status:409});expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);});
 it('rechecks locked event rows before changing an assignment',async()=>{mocks.execute.mockImplementation(async(sql)=>sql.includes('SELECT * FROM office_events')?[[{id:3,status:'BOOKED'}]]:sql.includes('FROM office_rooms')?[[{id:4}]]:[[]]);await expect(book()).rejects.toMatchObject({status:409});expect(mocks.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);});
 it('preserves both unbooked outside pieces without duplicating calendar event identifiers',async()=>{
  mocks.execute.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT * FROM office_events'))return [[{id:3,room_id:4,office_location_id:1,status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE',start_at:'2026-09-30 01:00:00',end_at:'2026-09-30 04:00:00',assigned_provider_id:9,google_provider_event_id:'original-calendar-event',created_by_user_id:9}]];
   return sql.includes('FROM office_rooms')?[[{id:4}]]:sql.includes('INSERT')?[{insertId:42}]:[[]];
  });
  await book();const copies=mocks.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO office_events (\x60'));
  expect(copies).toHaveLength(2);expect(copies.flatMap(c=>c[1])).not.toContain('original-calendar-event');
  expect(copies[0][1]).toContain('2026-09-30 01:15:00');expect(copies[1][1]).toContain('2026-09-30 03:45:00');
 });
 it('denies staff from an unrelated building agency',async()=>{mocks.access.mockResolvedValue(false);await expect(book()).rejects.toMatchObject({status:403});expect(OfficeEvent.withRoomSlotLock).not.toHaveBeenCalled();});
});
