import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:9}))}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn()}}));
vi.mock('../../models/ProviderVirtualWorkingHours.model.js',()=>({default:{listForProvider:vi.fn(async()=>[])}}));
vi.mock('../../models/UserExternalCalendar.model.js',()=>({default:{}}));
vi.mock('../externalBusyCalendar.service.js',()=>({default:{}}));
vi.mock('../googleCalendar.service.js',()=>({default:{}}));
vi.mock('../officeScheduleMaterializer.service.js',()=>({default:{}}));
vi.mock('../publicProviderHold.service.js',()=>({readActiveHolds:vi.fn(async()=>[]),expandWeeklyHold:vi.fn(()=>[])}));
import pool from '../../config/database.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
import Hours from '../../models/ProviderVirtualWorkingHours.model.js';
import Availability from '../providerAvailability.service.js';
const open={seesClients:true,acceptingNewClients:true,inPerson:true,virtual:true,school:true,scheduleAgencyId:1,officeIds:[7]};
const event={id:1,start_at:'2030-01-07 17:00:00',end_at:'2030-01-07 18:00:00',status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE',in_person_intake_enabled:1,room_available:1,building_timezone:'UTC',office_location_id:7,room_id:1};
let policy,bookings;
beforeEach(()=>{vi.clearAllMocks();policy={...open};bookings=[];Profile.getForProvider.mockImplementation(async()=>({agencyAvailability:policy}));Hours.listForProvider.mockResolvedValue([{dayOfWeek:'Monday',startTime:'17:00',endTime:'18:00',availableForIntake:true}]);pool.execute.mockImplementation(async(sql,args)=>[sql.includes('SELECT ol.timezone')?[{timezone:'UTC'}]:sql.includes('SELECT ua.agency_id')?[{agency_id:1}]:sql.includes('FROM office_events e')?[event]:sql.includes('SELECT start_at,end_at,client_id')?bookings:[]]);});
const compute=agencyId=>Availability.computeWeekAvailability({agencyId,providerId:9,weekStartYmd:'2030-01-07',intakeOnly:true,includeGoogleBusy:false,includeExternalBusy:false,materializeOfficeEvents:false});
describe('agency calendar projection',()=>{
 it('reads four weeks once with the same openings as weekly reads across DST, cadence, school and appointment conflicts', async () => {
  Hours.listForProvider.mockResolvedValue([
    {dayOfWeek:'Monday',startTime:'09:00',endTime:'12:00',availableForIntake:true,frequency:'WEEKLY'},
    {dayOfWeek:'Friday',startTime:'09:00',endTime:'10:00',availableForIntake:true,frequency:'BIWEEKLY',startDate:'2026-10-30'},
    {dayOfWeek:'Tuesday',startTime:'09:00',endTime:'10:00',availableForIntake:true,frequency:'ONCE',startDate:'2026-11-03'}
  ]);
  pool.execute.mockImplementation(async sql => [sql.includes('SELECT ol.timezone') ? [{timezone:'America/Denver'}]
    : sql.includes('SELECT ua.agency_id') ? [{agency_id:1}]
    : sql.includes('FROM provider_school_assignments') ? [{day_of_week:'Monday',start_time:'10:00',end_time:'11:00'}]
    : sql.includes('SELECT start_at, end_at FROM appointments') ? [{start_at:'2026-11-09 16:00:00',end_at:'2026-11-09 17:00:00'}] : []]);
  const args = {agencyId:2,providerId:9,intakeOnly:true,materializeOfficeEvents:false,includeExternalBusy:false};
  const combined = await Availability.computeWeekAvailability({...args,weekStartYmd:'2026-10-26',weekCount:4});
  expect(Hours.listForProvider).toHaveBeenCalledTimes(1);
  const weekly = [];
  for (const weekStartYmd of ['2026-10-26','2026-11-02','2026-11-09','2026-11-16']) weekly.push(...(await Availability.computeWeekAvailability({...args,weekStartYmd})).virtualSlots);
  expect(combined.virtualSlots).toEqual(weekly);
  expect(combined.virtualSlots).toHaveLength(10);
  expect(combined.virtualSlots.map(s=>s.startAt)).toContain('2026-10-26T15:00:00.000Z');
  expect(combined.virtualSlots.map(s=>s.startAt)).toContain('2026-11-02T16:00:00.000Z');
  expect(combined.virtualSlots.map(s=>s.startAt)).not.toContain('2026-11-09T16:00:00.000Z');
  expect(combined.weekEnd).toBe('2026-11-23');
 });
 it('rejects unbounded or mutating multiweek reads', async () => {
  for (const weekCount of [0,5,1.5]) await expect(Availability.computeWeekAvailability({agencyId:2,providerId:9,weekStartYmd:'2026-10-26',weekCount,materializeOfficeEvents:false})).rejects.toThrow('weekCount');
  await expect(Availability.computeWeekAvailability({agencyId:2,providerId:9,weekStartYmd:'2026-10-26',weekCount:4})).rejects.toThrow('cannot materialize');
 });
 it('shares source virtual hours and same-office intake across agencies while keeping tenant office membership in the query',async()=>{
 const result=await compute(2);expect(result.virtualSlots).toHaveLength(1);expect(result.inPersonSlots).toHaveLength(1);
 expect(Hours.listForProvider).toHaveBeenCalledWith({agencyId:1,providerId:9});
 const officeQuery=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM office_events e'));
 expect(officeQuery[0]).toContain('ola.agency_id = ?');expect(officeQuery[1].slice(0,5)).toEqual([2,1,9,true,2]);
 });
 it('suppresses tenant closure or non-participation despite shared published slots',async()=>{
 policy.acceptingNewClients=false;expect((await compute(2)).virtualSlots).toEqual([]);expect((await compute(2)).inPersonSlots).toEqual([]);
 policy={...open,seesClients:false};expect((await compute(2)).inPersonSlots).toEqual([]);
 policy={...open,virtual:false,officeIds:[8]};expect((await compute(2)).virtualSlots).toEqual([]);expect((await compute(2)).inPersonSlots).toEqual([]);
 });
 it('a booked office appointment at another agency blocks both formats',async()=>{
 bookings=[{client_id:10,start_at:event.start_at,end_at:event.end_at}];const result=await compute(2);expect(result.virtualSlots).toEqual([]);expect(result.inPersonSlots).toEqual([]);
 });
 it('stops sharing a source calendar after that agency membership is removed',async()=>{
 const original=pool.execute.getMockImplementation();pool.execute.mockImplementation((sql,args)=>sql.includes('SELECT ua.agency_id')?Promise.resolve([[]]):original(sql,args));
 await compute(2);expect(Hours.listForProvider).toHaveBeenCalledWith({agencyId:2,providerId:9});
 });
});
