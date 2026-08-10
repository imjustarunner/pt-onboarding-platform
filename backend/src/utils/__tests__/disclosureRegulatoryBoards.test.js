import { describe, expect, it } from 'vitest';
import {
  extractLicenseTypeKey,
  mergeRegulatoryBoardSettings,
  resolveRegulatoryBoard
} from '../disclosureRegulatoryBoards.js';

describe('extractLicenseTypeKey', () => {
  it('parses labeled Colorado license strings', () => {
    expect(extractLicenseTypeKey({
      licenseNumber: 'Licensed Professional Counselor: LPC.0014518'
    })).toBe('LPC');
    expect(extractLicenseTypeKey({
      licenseNumber: 'Marriage and Family Therapist: MFT.0001715'
    })).toBe('MFT');
    expect(extractLicenseTypeKey({
      licenseNumber: 'Licensed Clinical Social Worker: CSW.09925201'
    })).toBe('CSW');
  });

  it('detects candidate credentials', () => {
    expect(extractLicenseTypeKey({ licenseNumber: 'LPCC.0021843' })).toBe('LPCC');
    expect(extractLicenseTypeKey({ licenseNumber: 'MFTC.0014602' })).toBe('MFTC');
    expect(extractLicenseTypeKey({ licenseNumber: 'SWC.0000001985' })).toBe('SWC');
  });

  it('prefers LCSW over LSW', () => {
    expect(extractLicenseTypeKey({ credential: 'LCSW' })).toBe('LCSW');
    expect(extractLicenseTypeKey({ credential: 'LSW' })).toBe('LSW');
  });
});

describe('resolveRegulatoryBoard', () => {
  it('returns Colorado default boards for licensed types', () => {
    expect(resolveRegulatoryBoard({
      licenseTypeKey: 'LPC',
      category: 'FULLY_LICENSED'
    })).toContain('Professional Counselor');

    expect(resolveRegulatoryBoard({
      licenseTypeKey: 'MFTC',
      category: 'PRE_LICENSED'
    })).toContain('Marriage and Family Therapist');
  });

  it('skips unlicensed providers', () => {
    expect(resolveRegulatoryBoard({
      credential: 'Intern',
      category: 'UNLICENSED'
    })).toBeNull();
  });

  it('honors tenant overrides', () => {
    const custom = 'Custom Board Name';
    const merged = mergeRegulatoryBoardSettings({ LPC: custom });
    expect(merged.LPC).toBe(custom);
    expect(resolveRegulatoryBoard({
      licenseTypeKey: 'LPC',
      tenantBoards: { LPC: custom },
      category: 'FULLY_LICENSED'
    })).toBe(custom);
  });
});
