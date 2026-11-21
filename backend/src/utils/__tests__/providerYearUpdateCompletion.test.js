import { describe, expect, it } from 'vitest';
import {
  cycleIsPushed,
  isProviderFallUpdateOpen,
  persistedPyuActorType,
  validateRemindersForFinalize,
} from '../../services/providerYearUpdate.service.js';

describe('provider Fall Update eligibility', () => {
  const campaign = { status: 'pushed', pushed_at: '2026-08-03T18:00:00Z' };
  const launchSchools = [{ firstAssignedAt: '2026-07-10T16:00:00Z' }];
  const lateSchools = [{ firstAssignedAt: '2026-09-01T16:00:00Z' }];

  it('only includes the original school roster on a bulk push and supports an explicit push to a new provider', () => {
    expect(cycleIsPushed(null, campaign, launchSchools)).toBe(true);
    expect(cycleIsPushed(null, campaign, lateSchools)).toBe(false);
    const automaticCycle = { pushed_at: '2026-09-01T16:00:00Z', pushed_by_user_id: null };
    expect(cycleIsPushed(automaticCycle, campaign, lateSchools)).toBe(false);
    expect(cycleIsPushed({ ...automaticCycle, pushed_by_user_id: 12 }, campaign, lateSchools)).toBe(true);
  });

  it('allows both year formats for the active fall and closes all prior and future years', () => {
    const fall = new Date('2026-09-20T16:00:00Z');
    expect(isProviderFallUpdateOpen('2026-27', fall)).toBe(true);
    expect(isProviderFallUpdateOpen('2026-2027', fall)).toBe(true);
    expect(isProviderFallUpdateOpen('2025-26', fall)).toBe(false);
    expect(isProviderFallUpdateOpen('2027-28', fall)).toBe(false);
    expect(isProviderFallUpdateOpen('2026-27', new Date('2026-11-21T16:12:00Z'))).toBe(false);
  });
});

describe('persistedPyuActorType', () => {
  it('maps magic-link and auto actors to supported enum values', () => {
    expect(persistedPyuActorType('token_guest')).toBe('token_guest');
    expect(persistedPyuActorType('auto')).toBe('auto');
    expect(persistedPyuActorType('admin')).toBe('admin');
    expect(persistedPyuActorType('provider')).toBe('provider');
    expect(persistedPyuActorType(undefined)).toBe('provider');
  });
});

describe('providerYearUpdate completion', () => {
  it('allows finalize when reminders section is marked done even if item flags are stale', () => {
    expect(() =>
      validateRemindersForFinalize({
        sectionKey: 'reminders',
        reviewed: true,
        completed: true,
        data: {
          items: [
            {
              key: 'first_day_back_meeting',
              mode: 'complete',
              completed: false,
              reviewed: false,
            },
          ],
        },
      })
    ).not.toThrow();
  });

  it('requires reminder items when section is not marked done', () => {
    expect(() =>
      validateRemindersForFinalize({
        sectionKey: 'reminders',
        reviewed: false,
        completed: false,
        data: {
          items: [
            {
              key: 'first_day_dates',
              mode: 'reviewed',
              completed: false,
              reviewed: false,
            },
          ],
        },
      })
    ).toThrow(/Reminder not reviewed/i);
  });
});
