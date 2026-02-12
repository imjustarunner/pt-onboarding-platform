import { isBookedOfficeEventForLearningLink, wallMySqlToUtcDateTime } from '../learningBillingTime.utils.js';

describe('learningBillingTime.utils', () => {
  test('converts provider wall time to UTC around DST spring-forward', () => {
    const utc = wallMySqlToUtcDateTime('2026-03-09 09:00:00', 'America/Denver');
    expect(utc).toBe('2026-03-09 15:00:00');
  });

  test('converts provider wall time to UTC around DST fall-back', () => {
    const utc = wallMySqlToUtcDateTime('2026-11-03 09:00:00', 'America/Denver');
    expect(utc).toBe('2026-11-03 16:00:00');
  });

  test('recognizes booked office events without blocking assigned recurrence flow', () => {
    expect(isBookedOfficeEventForLearningLink({ slot_state: 'ASSIGNED_BOOKED', status: 'OPEN' })).toBe(true);
    expect(isBookedOfficeEventForLearningLink({ slot_state: 'ASSIGNED_AVAILABLE', status: 'BOOKED' })).toBe(true);
    expect(isBookedOfficeEventForLearningLink({ slot_state: 'ASSIGNED_AVAILABLE', status: 'OPEN' })).toBe(false);
  });
});
