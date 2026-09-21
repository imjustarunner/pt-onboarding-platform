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
const event={id:1,start_at:'2030-01-07 17:00:00',end_at:'2030-01-07 18:00:00',status:'RELEASED',slot_state:'ASSIGNED_AVAILABLE',in_person_intake_enabled:1,building_timezone:'UTC',office_location_id:7,room_id:1};
let policy,bookings;
beforeEach(()=>{vi.clearAllMocks();policy={...open};bookings=[];Profile.getForProvider.mockImplementation(async()=>({agencyAvailability:policy}));Hours.listForProvider.mockResolvedValue([{dayOfWeek:'Monday',startTime:'17:00',endTime:'18:00',availableForIntake:true}]);pool.execute.mockImplementation(async(sql,args)=>[sql.includes('SELECT ol.timezone')?[{timezone:'UTC'}]:sql.includes('SELECT ua.agency_id')?[{agency_id:1}]:sql.includes('FROM office_events e')?[event]:sql.includes('SELECT start_at,end_at FROM office_events')?bookings:[]]);});
const compute=agencyId=>Availability.computeWeekAvailability({agencyId,providerId:9,weekStartYmd:'2030-01-07',intakeOnly:true,includeGoogleBusy:false,includeExternalBusy:false,materializeOfficeEvents:false});
describe('agency calendar projection',()=>{
 it('shares source virtual hours and same-office intake across agencies while keeping tenant office membership in the query',async()=>{
 const result=await compute(2);expect(result.virtualSlots).toHaveLength(1);expect(result.inPersonSlots).toHaveLength(1);
 expect(Hours.listForProvider).toHaveBeenCalledWith({agencyId:1,providerId:9});
 const officeQuery=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM office_events e'));
 expect(officeQuery[0]).toContain('ola.agency_id = ?');expect(officeQuery[1].slice(0,4)).toEqual([2,1,9,2]);
 });
 it('suppresses tenant closure or non-participation despite shared published slots',async()=>{
 policy.acceptingNewClients=false;expect((await compute(2)).virtualSlots).toEqual([]);expect((await compute(2)).inPersonSlots).toEqual([]);
 policy={...open,seesClients:false};expect((await compute(2)).inPersonSlots).toEqual([]);
 policy={...open,virtual:false,officeIds:[8]};expect((await compute(2)).virtualSlots).toEqual([]);expect((await compute(2)).inPersonSlots).toEqual([]);
 });
 it('a booked office appointment at another agency blocks both formats',async()=>{
 bookings=[{start_at:event.start_at,end_at:event.end_at}];const result=await compute(2);expect(result.virtualSlots).toEqual([]);expect(result.inPersonSlots).toEqual([]);
 });
 it('stops sharing a source calendar after that agency membership is removed',async()=>{
 const original=pool.execute.getMockImplementation();pool.execute.mockImplementation((sql,args)=>sql.includes('SELECT ua.agency_id')?Promise.resolve([[]]):original(sql,args));
 await compute(2);expect(Hours.listForProvider).toHaveBeenCalledWith({agencyId:2,providerId:9});
 });
});
