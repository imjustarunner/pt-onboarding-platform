import { describe, expect, it } from 'vitest';
import {
  D11_BACKGROUND_EXPIRATION_YEARS,
  isDistrict11Name,
  isDistrict12Name,
  isDpsName,
  normalizeDistrictName,
} from '../districtCompliance.js';
import { computeExpiresAt } from '../../services/federalBackgroundCheck.service.js';

describe('districtCompliance', () => {
  it('normalizes district labels', () => {
    expect(normalizeDistrictName('  District  11 ')).toBe('district 11');
  });

  it('matches District 11 variants', () => {
    expect(isDistrict11Name('District 11')).toBe(true);
    expect(isDistrict11Name('D11')).toBe(true);
    expect(isDistrict11Name('Colorado Springs School District 11')).toBe(true);
    expect(isDistrict11Name('11')).toBe(true);
  });

  it('rejects D12, DPS, empty, and other districts', () => {
    expect(isDistrict11Name('District 12')).toBe(false);
    expect(isDistrict11Name('D12')).toBe(false);
    expect(isDistrict11Name('DPS')).toBe(false);
    expect(isDistrict11Name('Denver Public Schools')).toBe(false);
    expect(isDistrict11Name('')).toBe(false);
    expect(isDistrict11Name(null)).toBe(false);
    expect(isDistrict11Name('District 20')).toBe(false);
  });

  it('identifies D12 and DPS helpers', () => {
    expect(isDistrict12Name('District 12')).toBe(true);
    expect(isDpsName('DPS')).toBe(true);
    expect(isDpsName('District 11')).toBe(false);
  });

  it('uses 3-year D11 expiration from completion date', () => {
    expect(D11_BACKGROUND_EXPIRATION_YEARS).toBe(3);
    expect(computeExpiresAt('2023-08-15', D11_BACKGROUND_EXPIRATION_YEARS)).toBe('2026-08-15');
  });
});
