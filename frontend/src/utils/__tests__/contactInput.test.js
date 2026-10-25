import { describe, expect, it } from 'vitest';
import {
  applyEmailDomainHint,
  formatUsPhoneInput,
  isValidEmailAddress,
  isValidUsPhone,
  normalizeUsPhoneForSubmit
} from '../contactInput.js';

describe('contactInput', () => {
  it('accepts modern TLDs like .health', () => {
    expect(isValidEmailAddress('name@itsco.health')).toBe(true);
    expect(isValidEmailAddress('name@gmail.com')).toBe(true);
    expect(isValidEmailAddress('emi@emi')).toBe(false);
  });

  it('applies email domain hints', () => {
    expect(applyEmailDomainHint('john', '@gmail.com')).toBe('john@gmail.com');
    expect(applyEmailDomainHint('john@yahoo.com', '@gmail.com')).toBe('john@gmail.com');
    expect(applyEmailDomainHint('', '@gmail.com')).toBe('@gmail.com');
  });

  it('formats US phone numbers while typing', () => {
    expect(formatUsPhoneInput('5551002121')).toBe('(555) 100-2121');
    expect(formatUsPhoneInput('555')).toBe('(555');
  });

  it('validates and normalizes phone for submit', () => {
    expect(isValidUsPhone('(555) 100-2121')).toBe(true);
    expect(normalizeUsPhoneForSubmit('(555) 100-2121')).toBe('5551002121');
  });
  it('keeps the reported US country-code paste intact and rejects unsupported lengths', () => {
    expect(formatUsPhoneInput('+1 618 910 7000')).toBe('(618) 910-7000');
    expect(formatUsPhoneInput('16189107000')).toBe('(618) 910-7000');
    for (const input of ['+44 20 7946 0958', '6189107000123']) {
      expect(formatUsPhoneInput(input)).toBe(input);
      expect(isValidUsPhone(formatUsPhoneInput(input))).toBe(false);
    }
  });
});
