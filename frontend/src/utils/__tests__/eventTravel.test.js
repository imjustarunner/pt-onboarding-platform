import { expect, it } from 'vitest';
import { normalizeEventTravelClaims, normalizeTimeClaims, normalizeMileageClaims } from '../submitSubmissionHistory';
import { mileageUsesTier, mileageEstimate } from '../payrollSubmissionReview';
import { SUBMIT_ROOT_GROUPS } from '../../config/submitDisplayCategories';
const time = { id: 1, event_travel_report_id: 9, status: 'approved', payload: { eventTravelReport: { eventTitle: 'School fair', eventDate: '2026-10-24' } } };
const miles = { id: 2, event_travel_report_id: 9, claim_type: 'standard', status: 'submitted', miles: 10, round_trip: 0 };
it('shows a combined report once in Submit history, pending until both parts are reviewed', () => {
  expect(normalizeTimeClaims([time])).toEqual([]); expect(normalizeMileageClaims([miles])).toEqual([]);
  expect(normalizeEventTravelClaims([time], [miles])).toMatchObject([{ id: 'event_travel:9', groupId: 'payroll', title: 'School fair', status: 'submitted' }]);
  expect(normalizeEventTravelClaims([time], [{ ...miles, status: 'approved' }])[0].status).toBe('approved');
});
it('uses the event flat mileage rate even when optional other mileage tiers are enabled', () => {
  const settings = { standardMileageUsesTierRates: true, standardMileageRatePerMile: 0.7 };
  expect(mileageUsesTier(miles, settings)).toBe(false);
  expect(mileageEstimate(miles, { settings, rates: [{ tierLevel: 1, ratePerMile: 0 }] }, 1)).toBe(7);
  expect(mileageUsesTier({ claim_type: 'school_travel' }, settings)).toBe(true);
});
it('replaces generic mileage with event travel in Submit without making it a featured action', () => {
  const actions = SUBMIT_ROOT_GROUPS.flatMap(g => g.actions);
  expect(actions.some(a => a.event === 'mileage')).toBe(false);
  expect(actions.find(a => a.event === 'event-travel')).toMatchObject({ title: 'Event travel reimbursement' });
  expect(actions.find(a => a.event === 'event-travel').featured).toBeUndefined();
});
