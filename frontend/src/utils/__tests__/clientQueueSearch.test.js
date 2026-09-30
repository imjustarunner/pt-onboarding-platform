import { describe, expect, it } from 'vitest';
import {
  buildExchangeListingSearchContext,
  buildIntakeClientSearchContext,
  matchesQueueSearch
} from '../clientQueueSearch.js';

describe('clientQueueSearch', () => {
  it('matches numeric age inside age band', () => {
    const listing = { demographics: { ageBand: '14-17' }, presentingProblems: ['anxiety'] };
    const ctx = buildExchangeListingSearchContext(listing);
    expect(matchesQueueSearch(ctx.haystack, ['14'], { ageBands: ctx.ageBands })).toBe(true);
    expect(matchesQueueSearch(ctx.haystack, ['20'], { ageBands: ctx.ageBands })).toBe(false);
  });

  it('matches teen and adult terms against bands', () => {
    const teen = buildExchangeListingSearchContext({ demographics: { ageBand: '14-17' } });
    const adult = buildExchangeListingSearchContext({ demographics: { ageBand: '18-25' } });
    expect(matchesQueueSearch(teen.haystack, ['teen'], { ageBands: teen.ageBands })).toBe(true);
    expect(matchesQueueSearch(adult.haystack, ['adult'], { ageBands: adult.ageBands })).toBe(true);
  });

  it('matches intake age from birthdate', () => {
    const client = {
      adaptiveMeta: { birthdate: '2011-08-05' },
      fullName: 'Test Client'
    };
    const ctx = buildIntakeClientSearchContext(client);
    expect(ctx.numericAges.length).toBe(1);
    expect(matchesQueueSearch(ctx.haystack, ['teen'], { numericAges: ctx.numericAges })).toBe(true);
  });
});
it('finds exchange referrals by requested days and time ranges', () => {
  const ctx = buildExchangeListingSearchContext({ preferences: { schedule: { days: ['Monday'], periods: ['after_school'], windows: [{ day: 'Monday', start: '15:30', end: '17:00' }], timezone: 'America/Denver' } } });
  expect(ctx.haystack).toContain('After school'); expect(ctx.haystack).toContain('Monday: 3:30 PM–5:00 PM');
});
