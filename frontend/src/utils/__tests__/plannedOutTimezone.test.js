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
  it('prefers linked schedule block times over stale planned_out instants', () => {
    const canonical = {
      span_type: 'timed',
      start_at: '2025-08-11T15:45:00.000Z',
      end_at: '2025-08-11T19:30:00.000Z'
    };
    const drifted = {
      span_type: 'timed',
      start_at: '2025-08-11T17:45:00.000Z',
      end_at: '2025-08-11T21:30:00.000Z',
      schedule_event_start_at: '2025-08-11T15:45:00.000Z',
      schedule_event_end_at: '2025-08-11T19:30:00.000Z'
    };
    expect(formatPlannedOutWhen(drifted)).toBe(formatPlannedOutWhen(canonical));
  });
});
