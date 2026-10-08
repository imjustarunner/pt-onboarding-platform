import {afterEach,expect,it,vi} from 'vitest';
import {expandRecurrenceDates,occurrenceDatesSimple} from '../scheduleRecurrence.js';
afterEach(()=>vi.useRealTimers());
it('shows no more than a year even for an explicit multi-year count',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T18:00:00Z'));
 const dates=occurrenceDatesSimple('2026-10-08','WEEKLY',260);
 expect(dates.length).toBe(53);expect(dates.at(-1)).toBe('2027-10-07');
 expect(occurrenceDatesSimple('2028-01-01','WEEKLY',2)).toEqual([]);
});
it('keeps multiple weekdays for a rolling year rather than stopping after 53 total dates',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T18:00:00Z'));
 const dates=expandRecurrenceDates({startYmd:'2026-10-08',frequency:'WEEKLY',endMode:'indefinite',weekdays:['Mon','Thu']});
 expect(dates.length).toBeGreaterThan(100);expect(dates.every(d=>d<'2027-10-08')).toBe(true);
});
it('keeps a January 31 monthly anchor after February',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T18:00:00Z'));
 expect(expandRecurrenceDates({startYmd:'2026-01-31',frequency:'MONTHLY',occurrenceCount:3})).toEqual(['2026-01-31','2026-02-28','2026-03-31']);
});
