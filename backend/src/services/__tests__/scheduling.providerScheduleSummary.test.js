import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn()}}));
vi.mock('../providerAvailability.service.js',()=>({default:{computeWeekAvailability:vi.fn()}}));
import pool from '../../config/database.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
import Availability from '../providerAvailability.service.js';
import {readPublicProviderSchedule} from '../publicProviderSchedule.service.js';
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-06T12:00:00Z'));
 Profile.getForProvider.mockResolvedValue({details:{virtualEnabled:true,officeAvailability:'waitlist',typicalAvailability:['Saturday mornings']}});
 pool.execute.mockImplementation(async sql=>[sql.includes('FROM users')?[{provider_accepting_new_clients:0,in_office_available:1}]:sql.includes('FROM office_locations l')?[{id:7,name:'Public office',city:'Denver',state:'CO',street_address:'123 Example St',postal_code:'80202'}]:sql.includes('FROM provider_virtual_working_hours')?[{day_of_week:'Tuesday',start_time:'09:00:00',end_time:'11:00:00'}]:sql.includes('FROM office_standing_assignments s')?[{weekday:6,hour:10,name:'Public office'}]:[]]);
 Availability.computeWeekAvailability.mockResolvedValue({timeZone:'America/Denver',virtualSlots:[{startAt:'2030-01-08T16:00:00Z',endAt:'2030-01-08T17:00:00Z'}],inPersonSlots:[]});
});
afterEach(()=>vi.useRealTimers());
describe('public provider schedule summaries',()=>{
 it('uses actual openings, deduplicates weeks, and includes public locations and typical hours',async()=>{
  const result=await readPublicProviderSchedule(9,2);
  expect(result.virtual.status).toBe('accepting');expect(result.inPerson.status).toBe('waitlist');expect(result.slots).toHaveLength(1);
  expect(result.waitlistFormats).toEqual(['IN_PERSON']);expect(result.locations[0].address).toBe('123 Example St, Denver, CO, 80202');
  expect(result.typicalAvailability).toEqual(['Saturday mornings']);
 });
 it('does not invent typical hours from available appointments when the profile has no summary',async()=>{
  Profile.getForProvider.mockResolvedValue({details:{}});
  const result=await readPublicProviderSchedule(9,2);
  expect(result.slots).toHaveLength(1);expect(result.typicalAvailability).toEqual([]);
 });
 it('does not report no openings when a schedule service fails',async()=>{
  Availability.computeWeekAvailability.mockRejectedValueOnce(new Error('Calendar unavailable'));
  await expect(readPublicProviderSchedule(9,2)).rejects.toThrow('Calendar unavailable');
 });
 it('reports capacity per school and does not imply that a full school accepts clients',async()=>{
  const original=pool.execute.getMockImplementation();pool.execute.mockImplementation((sql,args)=>sql.includes('FROM provider_school_assignments p')?Promise.resolve([[{id:1,name:'Open school',slots_available:0},{id:1,name:'Open school',slots_available:2},{id:2,name:'Full school',slots_available:0}]]):original(sql,args));
  let result=await readPublicProviderSchedule(9,2);expect(result.schools).toHaveLength(2);expect(result.schools.map(s=>s.status)).toEqual(['accepting','unavailable']);
  Profile.getForProvider.mockResolvedValue({details:{schoolAvailability:'waitlist'}});result=await readPublicProviderSchedule(9,2);expect(result.schools.map(s=>s.status)).toEqual(['accepting','waitlist']);
 });
 it('allows a closed provider to take waitlist requests for enabled agency formats',async()=>{
  const policy={seesClients:true,acceptingNewClients:false,waitlistEnabled:true,inPerson:true,virtual:true,school:false,officeIds:null};
  Profile.getForProvider.mockResolvedValue({agencyAvailability:policy,details:{waitlistEnabled:true,inPersonEnabled:true,virtualEnabled:true,officeAvailability:'waitlist',virtualAvailability:'waitlist',availabilityByAgency:{'2':policy}}});
  const result=await readPublicProviderSchedule(9,2);expect(result.slots).toEqual([]);expect(result.inPerson.status).toBe('waitlist');expect(result.virtual.status).toBe('waitlist');expect(result.waitlistFormats).toEqual(['IN_PERSON','VIRTUAL']);
 });

});
