import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canRequestCompanyEventShift, companyEventDisplayWindow, primaryCompanyEventSession,
  shouldShowOnProviderDashboardEvents, isUpcomingCompanyEvent
} from '../companyEventStaffing';

const session = (overrides = {}) => ({
  sessionDateId: 20, startsAt: '2030-10-10T14:00:00Z', endsAt: '2030-10-10T18:00:00Z',
  requiredProviders: 1, approvedProvidersCount: 0, ...overrides
});
const event = (overrides = {}) => ({
  id: 1, eventType: 'school_outreach', startsAt: '2030-10-10T14:00:00Z', endsAt: '2030-10-10T18:00:00Z',
  canRequestOutreachShift: true, sessions: [session()], ...overrides
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-09T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('provider event relevance', () => {
  it.each(['school_day_off', 'school_holiday', 'school_first_day', 'school_fall_check_in', 'school_spring_event'])
    ('keeps %s off the dashboard and disallows shifts even with stale staffing flags', (eventType) => {
      expect(shouldShowOnProviderDashboardEvents(event({ eventType }))).toBe(false);
      expect(canRequestCompanyEventShift(event({ eventType }))).toBe(false);
      expect(isUpcomingCompanyEvent(event({ eventType }))).toBe(true);
    });
  it('keeps company invitations and available outreach but hides unstaffed school dates', () => {
    expect(shouldShowOnProviderDashboardEvents(event({ eventType: 'company_event', canRequestOutreachShift: false, sessions: [] }))).toBe(true);
    expect(shouldShowOnProviderDashboardEvents(event())).toBe(true);
    expect(shouldShowOnProviderDashboardEvents(event({ eventType: 'school_other', canRequestOutreachShift: false, sessions: [] }))).toBe(false);
  });
  it('hides full shifts unless the provider is assigned or has an active request', () => {
    expect(shouldShowOnProviderDashboardEvents(event({ sessions: [session({ approvedProvidersCount: 1 })] }))).toBe(false);
    expect(shouldShowOnProviderDashboardEvents(event({ sessions: [session({ approvedProvidersCount: 1, myRequest: { status: 'pending' } })] }))).toBe(true);
    expect(shouldShowOnProviderDashboardEvents(event({ canRequestOutreachShift: false, sessions: [session({ myAssignment: { assignmentStatus: 'finalized' } })] }))).toBe(true);
  });
  it('selects the available upcoming session instead of an expired or full first session', () => {
    const expired = session({ sessionDateId: 10, startsAt: '2029-10-10T14:00:00Z', endsAt: '2029-10-10T18:00:00Z' });
    const available = session({ sessionDateId: 30 });
    const row = event({ sessions: [expired, session({ approvedProvidersCount: 1 }), available] });
    expect(primaryCompanyEventSession(row)).toEqual(available);
    expect(canRequestCompanyEventShift(row, expired)).toBe(false);
    expect(canRequestCompanyEventShift(row)).toBe(true);
    expect(companyEventDisplayWindow(row)).toEqual({ startsAt: available.startsAt, endsAt: available.endsAt });
  });
  it('hides canceled and completed events but uses the next recurrence window', () => {
    expect(shouldShowOnProviderDashboardEvents(event({ schoolEventStatus: 'canceled' }))).toBe(false);
    const past = event({ eventType: 'company_event', canRequestOutreachShift: false, sessions: [], startsAt: '2029-10-10T14:00:00Z', endsAt: '2029-10-10T18:00:00Z' });
    expect(shouldShowOnProviderDashboardEvents(past)).toBe(false);
    expect(shouldShowOnProviderDashboardEvents({ ...past, nextOccurrenceStart: '2030-10-10T14:00:00Z', nextOccurrenceEnd: '2030-10-10T18:00:00Z' })).toBe(true);
  });
});
