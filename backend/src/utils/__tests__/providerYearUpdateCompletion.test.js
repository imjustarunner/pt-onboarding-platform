import { describe, expect, it } from 'vitest';
import {
  persistedPyuActorType,
  validateRemindersForFinalize,
} from '../../services/providerYearUpdate.service.js';

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
