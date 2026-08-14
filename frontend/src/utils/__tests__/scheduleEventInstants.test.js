import { describe, expect, it } from 'vitest';
import {
  parseScheduleUtcInstant,
  toSummaryInstantIso,
  toZonedDatetimeLocalValue,
  wallDatetimeEndFromStart,
  wallDatetimeFromParts,
  buildScheduleWritePayload
} from '../scheduleEventInstants.js';

describe('parseScheduleUtcInstant', () => {
  it('treats naked MySQL datetime as UTC', () => {
    const d = parseScheduleUtcInstant('2026-08-11 18:00:00');
    expect(d?.toISOString()).toBe('2026-08-11T18:00:00.000Z');
  });
});

describe('toSummaryInstantIso', () => {
  it('never appends Z to naked wall clock for UTC-stored meetings', () => {
    const iso = toSummaryInstantIso('2026-08-11T12:00:00', {
      storesUtcInstant: true,
      wallTimeZone: 'America/Denver'
    });
    expect(iso).toBe('2026-08-11T18:00:00.000Z');
  });

  it('passes through values that already have Z', () => {
    expect(toSummaryInstantIso('2026-08-11T18:00:00.000Z', { storesUtcInstant: true, wallTimeZone: 'America/Denver' }))
      .toBe('2026-08-11T18:00:00.000Z');
  });
});

describe('toZonedDatetimeLocalValue', () => {
  it('converts UTC instant to office wall for datetime-local', () => {
    const local = toZonedDatetimeLocalValue('2026-08-11T18:00:00.000Z', 'America/Denver');
    expect(local).toBe('2026-08-11T12:00');
  });
});

describe('wallDatetimeFromParts', () => {
  it('builds wall string without browser local conversion', () => {
    expect(wallDatetimeFromParts('2026-08-12', 14, 30)).toBe('2026-08-12T14:30:00');
  });

  it('adds duration in zone', () => {
    const end = wallDatetimeEndFromStart('2026-08-12T12:00:00', 60 * 60 * 1000, 'America/Denver');
    expect(end).toBe('2026-08-12T13:00:00');
  });
});

describe('buildScheduleWritePayload', () => {
  it('normalizes wall times and requires timeZone', () => {
    expect(buildScheduleWritePayload({
      startAt: '2026-08-12 09:00:00',
      endAt: '2026-08-12T10:00',
      timeZone: 'America/Denver'
    })).toEqual({
      startAt: '2026-08-12T09:00:00',
      endAt: '2026-08-12T10:00:00',
      timeZone: 'America/Denver'
    });
  });
});
