import { describe, expect, it } from 'vitest';
import { availabilityMonday, addAvailabilityDays, providerAvailabilityWeek, hasWeekendOpenings } from '../providerAvailabilityWeek';
const virtual={startAt:'2030-01-09T17:00:00Z',endAt:'2030-01-09T18:00:00Z',format:'VIRTUAL',frequency:'WEEKLY'};
const options={weekStart:'2030-01-07',timeZone:'America/Denver',now:Date.parse('2030-01-09T15:00:00Z')};
describe('public availability weeks',()=>{
 it('renders every weekday, marks past dates and merges only equivalent appointment choices',()=>{
  const office={...virtual,format:'IN_PERSON',buildingId:7};
  const days=providerAvailabilityWeek({...options,slots:[virtual,office,office,{...office,frequency:'BIWEEKLY'},{...office,endAt:'2030-01-09T19:00:00Z'}]});
  expect(days).toHaveLength(5);expect(days.map(day=>day.past)).toEqual([true,true,false,false,false]);expect(days[2].today).toBe(true);
  expect(days[2].openings).toHaveLength(3);expect(days[2].openings[0].choices.map(slot=>slot.format)).toEqual(['VIRTUAL','IN_PERSON']);
 });
 it('groups evening slots into their local day and excludes expired, invalid and out-of-week times',()=>{
  const slots=[{...virtual,startAt:'2030-01-10T02:00:00Z',endAt:'2030-01-10T03:00:00Z'},{...virtual,startAt:'2030-01-09T14:00:00Z'},{...virtual,endAt:'invalid'},{...virtual,startAt:'2030-02-01T17:00:00Z',endAt:'2030-02-01T18:00:00Z'}];
  const days=providerAvailabilityWeek({...options,slots});expect(days[2].openings).toHaveLength(1);expect(days[3].openings).toEqual([]);
 });
 it('uses calendar dates across year boundaries and daylight saving changes',()=>{
  expect(availabilityMonday('2027-01-01')).toBe('2026-12-28');expect(addAvailabilityDays('2026-10-26',7)).toBe('2026-11-02');
  expect(availabilityMonday('2026-11-01')).toBe('2026-10-26');
  const saturday={...virtual,startAt:'2030-01-13T02:00:00Z',endAt:'2030-01-13T03:00:00Z'};
  expect(hasWeekendOpenings([saturday],'America/Denver')).toBe(true);
  const days=providerAvailabilityWeek({...options,weekends:true,slots:[saturday]});expect(days).toHaveLength(7);expect(days[5].openings).toHaveLength(1);expect(days[6].openings).toEqual([]);
 });
});
