import PhoneNumber from '../PhoneNumber.model.js';

describe('PhoneNumber.normalizePhone', () => {
  test('normalizes 10-digit US numbers to E.164', () => {
    expect(PhoneNumber.normalizePhone('415-555-1212')).toBe('+14155551212');
  });

  test('preserves leading + and strips non-digits', () => {
    expect(PhoneNumber.normalizePhone('+1 (650) 555-0000')).toBe('+16505550000');
  });

  test('returns null for empty input', () => {
    expect(PhoneNumber.normalizePhone(null)).toBe(null);
    expect(PhoneNumber.normalizePhone('')).toBe(null);
  });
});
