import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AVAILABILITY,
  isInsideSchedule,
  nextAvailableAt,
  addBusinessHours,
  formatReturnAt
} from '../availabilityWindow.service.js';

function scheduleFromDefaults(enabled = true) {
  return {
    enabled,
    timezone: 'America/New_York',
    source: enabled ? 'default' : 'disabled',
    blocks: DEFAULT_AVAILABILITY.days.map((dayOfWeek) => ({
      dayOfWeek,
      startMinutes: DEFAULT_AVAILABILITY.startMinutes,
      endMinutes: DEFAULT_AVAILABILITY.endMinutes
    }))
  };
}

describe('availabilityWindow.service', () => {
  it('exports Mon–Fri 6AM–7PM defaults', () => {
    expect(DEFAULT_AVAILABILITY.days).toEqual([1, 2, 3, 4, 5]);
    expect(DEFAULT_AVAILABILITY.startMinutes).toBe(360);
    expect(DEFAULT_AVAILABILITY.endMinutes).toBe(1140);
  });

  it('treats disabled schedule as always available', () => {
    const schedule = scheduleFromDefaults(false);
    expect(isInsideSchedule(schedule, new Date('2026-08-24T10:00:00-04:00'))).toBe(true);
    expect(isInsideSchedule(schedule, new Date('2026-08-22T10:00:00-04:00'))).toBe(true);
  });

  it('is available during weekday default window and quiet overnight', () => {
    const schedule = scheduleFromDefaults(true);
    const tueNoonEt = new Date('2026-08-25T16:00:00.000Z'); // 12:00 ET
    expect(isInsideSchedule(schedule, tueNoonEt)).toBe(true);
    const tueNightEt = new Date('2026-08-26T02:00:00.000Z'); // 22:00 ET Tue
    expect(isInsideSchedule(schedule, tueNightEt)).toBe(false);
  });

  it('nextAvailableAt jumps forward when outside window', () => {
    const schedule = scheduleFromDefaults(true);
    const fridayNight = new Date('2026-08-29T01:00:00.000Z'); // Fri 21:00 ET
    const next = nextAvailableAt(schedule, fridayNight);
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(fridayNight.getTime());
  });

  it('addBusinessHours advances only inside Availability Hours', () => {
    const schedule = scheduleFromDefaults(true);
    const friNearClose = new Date('2026-08-28T22:00:00.000Z');
    const after = addBusinessHours(schedule, friNearClose, 2);
    expect(after.getTime()).toBeGreaterThan(friNearClose.getTime());
    const day = after.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(day);
  });

  it('formatReturnAt produces readable string', () => {
    const s = formatReturnAt(new Date('2026-08-25T16:00:00.000Z'), 'America/New_York');
    expect(String(s).length).toBeGreaterThan(5);
  });
});
