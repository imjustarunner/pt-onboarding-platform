import { describe, expect, it } from 'vitest';
import {
  extractSlotTotal,
  formatSlotsTotalDisplay,
  hoursChanged,
  parseSchoolRequestNotes,
  scheduleAdjustmentHasChanges,
  slotsChanged
} from '../schoolRequestNotes.js';

describe('schoolRequestNotes', () => {
  const noOpNotes =
    'School: Rudy | Provider: Nicole Porter (user_id=1) | Day: Wednesday | Current slots: 7 total | Requested slots total: 7 (delta +0) | Current hours: 8:00 AM to 3:00 PM | Requested hours: 8:00 AM – 3:00 PM';

  it('parses slot totals from mixed formats', () => {
    expect(extractSlotTotal('7 total')).toBe(7);
    expect(extractSlotTotal('3 assigned / 7 total')).toBe(7);
    expect(extractSlotTotal('7')).toBe(7);
    expect(formatSlotsTotalDisplay('7')).toBe('7 total');
  });

  it('does not treat identical slot totals as changed', () => {
    const parsed = parseSchoolRequestNotes(noOpNotes);
    expect(slotsChanged(parsed)).toBe(false);
    expect(hoursChanged(parsed)).toBe(false);
    expect(scheduleAdjustmentHasChanges(parsed)).toBe(false);
  });

  it('detects real slot and hour changes', () => {
    const parsed = parseSchoolRequestNotes(
      'Current slots: 7 total | Requested slots total: 8 (delta +1) | Current hours: 8:00 AM – 3:00 PM | Requested hours: 8:00 AM – 3:00 PM'
    );
    expect(slotsChanged(parsed)).toBe(true);
    expect(scheduleAdjustmentHasChanges(parsed)).toBe(true);

    const hoursParsed = parseSchoolRequestNotes(
      'Current slots: 7 total | Requested slots total: 7 (delta +0) | Current hours: 8:00 AM – 3:00 PM | Requested hours: 9:00 AM – 3:00 PM'
    );
    expect(hoursChanged(hoursParsed)).toBe(true);
  });
});
