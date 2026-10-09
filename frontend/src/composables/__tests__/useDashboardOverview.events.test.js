import { afterEach, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { flushPromises } from '@vue/test-utils';
import api from '../../services/api';
import { useDashboardOverview } from '../useDashboardOverview';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
let scope;
afterEach(() => { scope?.stop(); vi.useRealTimers(); vi.clearAllMocks(); });

it('includes calendar-only staffing discoveries and filters after adding capacity and request status', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-09T12:00:00Z'));
  const base = { agencyId: 2, startsAt: '2030-10-10T14:00:00Z', endsAt: '2030-10-10T18:00:00Z' };
  const session = { sessionDateId: 20, ...base, requiredProviders: 1, approvedProvidersCount: 1 };
  const company = { ...base, id: 1, eventType: 'company_event', title: 'Company invitation' };
  const full = { ...base, id: 2, eventType: 'school_outreach', title: 'Full outreach', canRequestOutreachShift: true };
  const dayOff = { ...base, id: 3, eventType: 'school_day_off', title: 'No school' };
  const available = { ...base, id: 4, eventType: 'school_outreach', title: 'Available outreach', canRequestOutreachShift: true, sessions: [{ ...session, approvedProvidersCount: 0 }] };
  api.get.mockImplementation(async (url) => ({ data: url === '/me/company-events/calendar'
    ? [company, { ...full, sessions: [session] }, dayOff, available] : [] }));
  scope = effectScope();
  const state = scope.run(() => useDashboardOverview({ userId: 7, agencyId: 2, companyEvents: [company, full, dayOff], includeSubmissionUpdates: false }));
  await flushPromises();
  expect(state.upcomingEvents.value.map((event) => event.title)).toEqual(['Company invitation', 'Available outreach']);
});
