import { expect, it } from 'vitest';
import { mergeCurrentExchangeSummary, mergeExchangeSummary } from '../../utils/clientExchangeSummary.js';
const previous = { preferences: { modality: 'virtual', serviceLocation: 'Denver', providerGender: 'female', insurance: 'Aetna', matchingPreferences: { specialties: ['Anxiety'] }, schedule: { days: ['Monday'] } } };
it('uses newer chart preferences for existing listings without losing referral-only choices', () => {
  const chart = { preferences: { insurance: 'Medicaid', providerGender: null, matchingPreferences: {}, schedule: { days: ['Tuesday'] } } };
  const client = { intake_preferences_json: JSON.stringify({ preferredProviderGender: null, matchingPreferences: {}, exchangeSchedule: { days: ['Tuesday'] } }) };
  expect(mergeCurrentExchangeSummary(chart, previous, client).preferences).toEqual({ ...previous.preferences, ...chart.preferences });
  // Posting still honors the choices reviewed in the referral form.
  expect(mergeExchangeSummary(chart, previous).preferences.schedule.days).toEqual(['Monday']);
});
it('does not resurrect explicit clears from the old referral snapshot', () => {
  const chart = { preferences: { serviceLocation: null, modality: null, providerQualification: null, schedule: { days: [], periods: [], windows: [] } } };
  const client = { intake_preferences_json: { serviceLocation: null, preferredModality: null, providerQualification: null, exchangeSchedule: null } };
  expect(mergeCurrentExchangeSummary(chart, previous, client).preferences).toMatchObject(chart.preferences);
});
