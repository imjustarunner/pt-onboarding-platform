import { describe, it, expect } from 'vitest';
import { extractTempPasswordFromAccessEmailBody } from '../schoolStaffAccountAccessEmail.service.js';

describe('schoolStaffAccountAccessEmail.service', () => {
  it('extracts labeled temp passwords from portal access email bodies', () => {
    const body = 'Hello,\n\nTemp password: InTheSchools26\n\nPortal: https://example.com/login';
    expect(extractTempPasswordFromAccessEmailBody(body)).toBe('InTheSchools26');
  });

  it('returns null when no labeled password is present', () => {
    expect(extractTempPasswordFromAccessEmailBody('Use the reset link only.')).toBeNull();
  });
});
