import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../providerAvailability.service.js',()=>({default:{}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
import {parseAvailabilitySearch,slotMatchesSearch,ageEvidence,findProviderAvailability,formatAvailabilitySearch} from '../agents/availabilitySearch.service.js';
import {availabilityOccursOn} from '../../utils/availabilityRecurrence.js';
import {expandWeeklyHold} from '../publicProviderHold.service.js';
const now=new Date('2026-09-28T15:00:00Z');
const parse=(query,previousQueries=[])=>parseAvailabilitySearch({query,previousQueries,now,timeZone:'America/Denver'});
describe('availability constraints and follow-ups',()=>{
 it('keeps Wednesday/time range when narrowing to kids then a specific age',()=>{
  const queries=['Who has availability Wednesday between 2 and 5 PM?','Which of those see kids?'];
  const result=parse('A 12 year old',queries);expect(result.filters).toMatchObject({dateFrom:'2026-09-30',dateTo:'2026-09-30',timeFrom:'14:00',timeTo:'17:00',ageBucket:'Preteen (11-13)',children:false});expect(result.questions).toEqual([]);
 });
 it('interprets monthly as four weeks',()=>expect(parse('Who has availability monthly on Thursday at 7 AM?').filters).toMatchObject({frequency:'EVERY_4_WEEKS',exactTime:'07:00',dateFrom:'2026-10-01'}));
 it('uses agency-local day rather than UTC for late evening slots',()=>{
  const f=parse('Who has availability Wednesday after 5 PM?').filters;
  expect(slotMatchesSearch({startAt:'2026-10-01T01:00:00Z',endAt:'2026-10-01T02:00:00Z'},f,'America/Denver')).toBe(true);
 });
 it('requires the whole session inside a requested range and excludes wrong cadence',()=>{
  const f=parse('Who has availability Wednesday 2 to 4 PM weekly?').filters;
  expect(slotMatchesSearch({startAt:'2026-09-30T21:30:00Z',endAt:'2026-09-30T22:30:00Z',frequency:'WEEKLY'},f,'America/Denver')).toBe(false);
  expect(slotMatchesSearch({startAt:'2026-09-30T20:00:00Z',endAt:'2026-09-30T21:00:00Z',frequency:'ONCE'},f,'America/Denver')).toBe(false);
 });
 it('does not treat missing ages as confirmation that a provider sees children',()=>expect(ageEvidence([],{children:true}).matches).toBe(false));
 it('asks for an identifiable client and ambiguous time',()=>{expect(parse('Match the submitted client preferences').questions).not.toEqual([]);expect(parse('Who is available at 3?').questions).not.toEqual([]);});
 it('rejects invalid dates and excessive search ranges',()=>{expect(()=>parse('Who is available 2026-02-30?')).toThrow();expect(()=>parse('Who has openings 2026-10-01 to 2027-10-01?')).toThrow();});
});
describe('anchored publication and hold recurrence',()=>{
 it('alternates from the first date and honors end date',()=>{
  const row={frequency:'BIWEEKLY',startDate:'2026-10-01',endDate:'2026-11-01'};
  expect(['2026-09-24','2026-10-01','2026-10-08','2026-10-15','2026-11-12'].map(d=>availabilityOccursOn(row,d))).toEqual([false,true,false,true,false]);
 });
 it('every four weeks remains 28 days, not calendar monthly',()=>{const row={frequency:'EVERY_4_WEEKS',startDate:'2026-10-01'};expect(availabilityOccursOn(row,'2026-10-29')).toBe(true);expect(availabilityOccursOn(row,'2026-11-01')).toBe(false);});
 it('one-time openings do not recur',()=>{expect(availabilityOccursOn({frequency:'ONCE',startDate:'2026-10-01'},'2026-10-08')).toBe(false);expect(expandWeeklyHold({startAt:'2026-10-01T13:00:00Z',endAt:'2026-10-01T14:00:00Z',frequency:'ONCE'},'2026-10-08','2026-10-09')).toEqual([]);});
 it('four-week holds preserve wall time across DST',()=>{
  const rows=expandWeeklyHold({startAt:'2026-10-08T13:00:00Z',endAt:'2026-10-08T14:00:00Z',timeZone:'America/Denver',frequency:'EVERY_4_WEEKS'},'2026-10-01','2026-12-10');
  expect(rows.map(r=>r.start.toISOString())).toEqual(['2026-10-08T13:00:00.000Z','2026-11-05T14:00:00.000Z','2026-12-03T14:00:00.000Z']);
 });
});
describe('live matching permissions and partial results',()=>{
 const db={execute:vi.fn(async sql=>[sql.includes('FROM users')?[{id:1,first_name:'A'},{id:2,first_name:'B'}]:[{user_id:1,field_key:'age_specialty',value_option:'Children (6-10)'},{user_id:2,field_key:'age_specialty',value_option:'Children (6-10)'}]])};
 it('runs conflicts read-only and reports failed calendars rather than no openings',async()=>{
  const compute=vi.fn(async options=>{if(options.providerId===2)throw Error('calendar down');return {virtualSlots:[{startAt:'2026-09-30T20:00:00Z',endAt:'2026-09-30T21:00:00Z',frequency:'WEEKLY'}]};});
  const out=await findProviderAvailability({agencyId:2,actor:{id:9},query:'Who has availability Wednesday 2 to 5 PM and sees kids?',now},{db,compute,timeZone:'America/Denver'});
  expect(out.providers).toHaveLength(1);expect(out.failedProviderIds).toEqual([2]);expect(compute.mock.calls[0][0]).toMatchObject({includeGoogleBusy:true,includeExternalBusy:true,materializeOfficeEvents:false,intakeOnly:true});expect(formatAvailabilitySearch(out)).toContain('could not complete');
 });
 it('denies client details before looking up providers',async()=>{
  const denied=vi.fn(async()=>({ok:false,status:403,message:'Denied'}));const database={execute:vi.fn()};
  await expect(findProviderAvailability({agencyId:2,actor:{id:9},query:'Match client #123 preferences',now},{db:database,timeZone:'America/Denver',clientAccess:denied})).rejects.toMatchObject({status:403});expect(database.execute).not.toHaveBeenCalled();
 });
 it('applies saved preferences and explicitly lists suitability still needing review',async()=>{
  const access=async()=>({ok:true,client:{agency_id:2,date_of_birth:'2018-02-01',intake_preferences_json:{preferredDays:['Wednesday'],preferredModality:'virtual',preferredTimeOfDay:'afternoon',insuranceOrPayment:'Aetna'}}});
  const out=await findProviderAvailability({agencyId:2,actor:{id:9},query:'Match client #123 preferences',now},{db,timeZone:'America/Denver',clientAccess:access,compute:async()=>({virtualSlots:[]})});
  expect(out.filters).toMatchObject({days:['wednesday'],modality:'VIRTUAL',ageBucket:'Children (6-10)',timeFrom:'12:00'});expect(out.filters.insurance).toBe('Aetna');
 });
});
it('offers half-hour start times only when a full uninterrupted appointment fits',async()=>{
 const {appointmentWindows}=await import('../agents/availabilitySearch.service.js');
 const quarter=m=>({startAt:new Date(Date.UTC(2026,8,30,20,m)).toISOString(),endAt:new Date(Date.UTC(2026,8,30,20,m+15)).toISOString(),frequency:'WEEKLY'});
 expect(appointmentWindows([0,15,30,45,60,75].map(quarter)).map(s=>s.startAt)).toContain('2026-09-30T20:30:00.000Z');
 expect(appointmentWindows([0,15,45,60].map(quarter))).toEqual([]);
});
