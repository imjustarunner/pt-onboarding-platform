import { describe, expect, it } from 'vitest';
import {
  D11_BACKGROUND_EXPIRATION_YEARS,
  D11_SECURITY_OFFICE,
  isDistrict11Name,
} from '../districtCompliance.js';

describe('districtCompliance (frontend)', () => {
  it('matches D11 and rejects D12/DPS', () => {
    expect(isDistrict11Name('District 11')).toBe(true);
    expect(isDistrict11Name('D12')).toBe(false);
    expect(isDistrict11Name('DPS')).toBe(false);
  });

  it('exposes D11 security office copy for PYU', () => {
    expect(D11_BACKGROUND_EXPIRATION_YEARS).toBe(3);
    expect(D11_SECURITY_OFFICE.address).toContain('1104 North Franklin');
    expect(D11_SECURITY_OFFICE.hours).toMatch(/Monday through Friday/i);
  });
});
