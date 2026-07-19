import { describe, expect, it } from 'vitest';
import {
  appointmentEditorTitleForKind,
  expandRecurrenceDates
} from '../appointmentEditorShared.js';

describe('appointmentEditorShared', () => {
  it('titles clinical and meeting kinds', () => {
    expect(appointmentEditorTitleForKind('individual_session')).toBe('Clinical Session');
    expect(appointmentEditorTitleForKind('agency_meeting', { hideOfficeAndCalendarIntegration: true }))
      .toBe('Team Meeting');
    expect(appointmentEditorTitleForKind('supervision')).toBe('Supervision');
  });

  it('expands weekly multi-day until count', () => {
    const dates = expandRecurrenceDates({
      startYmd: '2026-07-20', // Monday
      frequency: 'WEEKLY',
      endMode: 'count',
      occurrenceCount: 4,
      weekdays: ['Mon', 'Wed']
    });
    expect(dates[0]).toBe('2026-07-20');
    expect(dates).toContain('2026-07-22');
    expect(dates.length).toBe(4);
  });

  it('expands until end date', () => {
    const dates = expandRecurrenceDates({
      startYmd: '2026-07-20',
      frequency: 'WEEKLY',
      endMode: 'until',
      untilDate: '2026-08-03',
      weekdays: ['Mon']
    });
    expect(dates).toEqual(['2026-07-20', '2026-07-27', '2026-08-03']);
  });

  it('returns single date for ONCE', () => {
    expect(expandRecurrenceDates({ startYmd: '2026-07-18', frequency: 'ONCE' })).toEqual(['2026-07-18']);
  });
});
