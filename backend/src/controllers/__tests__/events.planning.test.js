import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/vonage.service.js', () => ({ default: {} }));
import { parseEventPayload } from '../companyEvents.controller.js';

describe('planning a company gathering before choosing its date', () => {
  it('accepts an explicit date-to-be-decided event without inventing timestamps', () => {
    const event = parseEventPayload({ title: 'Our second anniversary', eventType: 'company_event', dateToBeDecided: true, startsAt: null, endsAt: null });
    expect(event.error).toBeUndefined();
    expect(event).toMatchObject({ startsAt: null, endsAt: null, dateToBeDecided: true });
  });
  it('still requires two valid ordered timestamps for a confirmed event', () => {
    expect(parseEventPayload({ title: 'Anniversary' }).error).toContain('valid dates');
    expect(parseEventPayload({ title: 'Anniversary', startsAt: '2026-11-12T17:00:00Z', endsAt: null }).error).toContain('valid dates');
    expect(parseEventPayload({ title: 'Anniversary', startsAt: '2026-11-12T17:00:00Z', endsAt: '2026-11-12T16:00:00Z' }).error).toContain('after startsAt');
  });
  it.each([
    { eventType: 'skills_group' },
    { eventType: 'school_outreach' },
    { recurrence: { frequency: 'weekly', byWeekday: [1] } },
    { registrationEligible: true }
  ])('preserves real schedule requirements for programs, registration and recurrence %j', extra => {
    expect(parseEventPayload({ title: 'Scheduled service', dateToBeDecided: true, ...extra }).error).toContain('confirmed date');
  });
});
