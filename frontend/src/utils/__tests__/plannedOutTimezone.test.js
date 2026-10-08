import { describe, expect, it } from 'vitest';
import { formatPlannedOutWhen } from '../plannedOuts.js';
import { parseUtcInstant } from '../timezones.js';

describe('parseUtcInstant', () => {
  it('treats naked MySQL DATETIME as UTC', () => {
    const d = parseUtcInstant('2025-08-11 15:45:00');
    expect(d?.toISOString()).toBe('2025-08-11T15:45:00.000Z');
  });

  it('parses ISO-Z strings', () => {
    const d = parseUtcInstant('2025-08-11T15:45:00.000Z');
    expect(d?.toISOString()).toBe('2025-08-11T15:45:00.000Z');
  });
});

describe('formatPlannedOutWhen', () => {
  it('shows the end date of a multi-day timed out instead of making it look like one day', () => {
    const label = formatPlannedOutWhen({ span_type: 'hours', start_at: '2026-10-06T16:00:00Z', end_at: '2026-10-13T19:00:00Z' });
    expect(label).toContain('10/6');
    expect(label).toContain('10/13');
  });
  it('shows actual half-day times and keeps all-day exclusive ends out of the displayed range', () => {
    const label = formatPlannedOutWhen({ span_type: 'half_day', start_date: '2026-10-06', half_day_part: 'am', start_at: '2026-10-06T14:00:00Z', end_at: '2026-10-06T18:00:00Z' });
    expect(label).toContain('half day');
    expect(label).toContain(' – ');
    expect(formatPlannedOutWhen({ all_day: true, start_date: '2026-10-06', end_date: '2026-10-07' })).toBe('10/6');
  });
  it('uses planned_out instants (what the submitter booked), not drifted schedule blocks', () => {
    const booked = {
      span_type: 'timed',
      start_at: '2025-08-11T17:45:00.000Z',
      end_at: '2025-08-11T21:30:00.000Z',
      schedule_event_start_at: '2025-08-11T15:45:00.000Z',
      schedule_event_end_at: '2025-08-11T19:30:00.000Z'
    };
    const canonical = {
      span_type: 'timed',
      start_at: '2025-08-11T17:45:00.000Z',
      end_at: '2025-08-11T21:30:00.000Z'
    };
    expect(formatPlannedOutWhen(booked)).toBe(formatPlannedOutWhen(canonical));
    expect(formatPlannedOutWhen(booked)).not.toBe(formatPlannedOutWhen({
      span_type: 'timed',
      start_at: '2025-08-11T15:45:00.000Z',
      end_at: '2025-08-11T19:30:00.000Z'
    }));
  });
});
