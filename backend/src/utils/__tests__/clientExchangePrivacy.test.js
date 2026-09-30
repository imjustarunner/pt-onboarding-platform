import { expect, it } from 'vitest';
import { buildExchangeEmail } from '../clientExchangeSummary.js';
import { exchangeSafeText } from '../clientExchangePrivacy.js';
it('excludes client name, initials and chart identifiers even when they appear inside clinical or schedule text', () => {
  const client = { full_name: 'Al Smith', initials: 'AS', identifier_code: '123456' };
  const { text, html } = buildExchangeEmail({ client, link: 'https://example.test/exchange?listingId=4', listing: {
    clientInitials: 'AS', clientFullName: 'Al Smith', demographics: { ageBand: '9', gender: 'female' },
    diagnoses: ['F41.1 — Anxiety'], presentingProblems: ['Al Smith has worry; AS attends school.'],
    preferences: { providerGender: 'female', schedule: { days: ['Monday'], periods: ['after_school'], windows: [], notes: 'Al can attend; reference 123456.' } }
  } });
  for (const output of [text, html]) { expect(output).not.toMatch(/\bAl\b|\bSmith\b|\bAS\b|123456/); expect(output).toContain('F41.1'); expect(output).toContain('After school'); }
});
it('removes identity labels rather than generating initials in email prose', () => {
  expect(exchangeSafeText('Name: Example Person\nClient: Example Person\nPresenting problem: Worry')).not.toContain('Example');
  expect(exchangeSafeText('Name: Example Person\nPresenting problem: Worry')).toContain('Worry');
});
