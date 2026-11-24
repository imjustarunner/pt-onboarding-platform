import {expect,it} from 'vitest';
import {sessionRecurrenceLabel} from '../sessionRecurrenceLabel';
it('distinguishes calendar-month recurrence from four-week recurrence and one-time sessions',()=>{
  expect(sessionRecurrenceLabel({recurrenceFrequency:'MONTHLY'})).toContain('same day of month');
  expect(sessionRecurrenceLabel({recurrenceFrequency:'EVERY_4_WEEKS'})).toBe('Repeats · Every 4 weeks');
  expect(sessionRecurrenceLabel({recurrenceFrequency:'BIWEEKLY'})).toBe('Repeats · Every 2 weeks');
  expect(sessionRecurrenceLabel({recurrenceFrequency:'ONCE'})).toBe('One-time session');
  expect(sessionRecurrenceLabel({recurrenceSeriesId:'old-series'})).toBe('Repeats · Frequency not recorded');
});
