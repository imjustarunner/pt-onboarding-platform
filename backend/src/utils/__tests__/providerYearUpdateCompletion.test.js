import { describe, expect, it } from 'vitest';
import { validateRemindersForFinalize } from '../../services/providerYearUpdate.service.js';

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
