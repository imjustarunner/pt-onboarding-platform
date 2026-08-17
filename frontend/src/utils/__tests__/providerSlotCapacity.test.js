import { describe, expect, it } from 'vitest';
import {
  countFilledSoftScheduleSlots,
  providerAssignmentSummary,
  providerSlotsOpenLabel,
  withSoftScheduleOccupancy
} from '../providerSlotCapacity';

describe('soft schedule occupancy', () => {
  it('counts filled time slots instead of caseload size', () => {
    const slots = [
      { client_id: null },
      { client_id: 11 },
      { client_id: 12 },
      { client_id: '' },
      { client_id: 13 },
      { client_id: 14 },
      { client_id: 0 },
      { client_id: null }
    ];
    expect(countFilledSoftScheduleSlots(slots)).toBe(4);
  });

  it('ignores stale slot clients who are no longer on the day caseload', () => {
    const slots = [{ client_id: 11 }, { client_id: 99 }, { client_id: null }];
    const caseload = [{ id: 11 }, { id: 12 }];
    expect(countFilledSoftScheduleSlots(slots, caseload)).toBe(1);
  });

  it('shows open slots from the grid even when API caseload counts look full', () => {
    const provider = {
      first_name: 'Halle',
      slots_total: 8,
      slots_used: 7,
      slots_available: 1
    };
    const slots = [
      { client_id: null },
      { client_id: 1 },
      { client_id: 2 },
      { client_id: null },
      { client_id: 3 },
      { client_id: 4 },
      { client_id: null },
      { client_id: null }
    ];
    const overlay = withSoftScheduleOccupancy(provider, slots);
    expect(providerAssignmentSummary(overlay)).toBe('4 / 8 assigned · 4 open');
    expect(providerSlotsOpenLabel(overlay)).toBe('4 slots open');
  });
});
