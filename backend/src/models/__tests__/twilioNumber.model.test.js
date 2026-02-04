import TwilioNumber from '../TwilioNumber.model.js';

describe('TwilioNumber.normalizePhone', () => {
  test('normalizes 10-digit US numbers to E.164', () => {
    expect(TwilioNumber.normalizePhone('415-555-1212')).toBe('+14155551212');
  });

  test('preserves leading + and strips non-digits', () => {
    expect(TwilioNumber.normalizePhone('+1 (650) 555-0000')).toBe('+16505550000');
  });

  test('returns null for empty input', () => {
    expect(TwilioNumber.normalizePhone(null)).toBe(null);
    expect(TwilioNumber.normalizePhone('')).toBe(null);
  });
});
