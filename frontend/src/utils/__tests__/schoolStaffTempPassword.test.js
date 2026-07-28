import { describe, expect, it } from 'vitest';
import {
  extractSchoolNumberSuffix,
  generateStaffTempPassword,
  schoolInitials
} from '../schoolStaffTempPassword.js';

describe('schoolStaffTempPassword', () => {
  it('builds initials from school name', () => {
    expect(schoolInitials('Riverdale High School')).toBe('RH');
    expect(schoolInitials('Cheyenne Mountain Middle School')).toBe('CMM');
  });

  it('prefers school number suffix over address number', () => {
    const password = generateStaffTempPassword({
      schoolName: 'Riverdale High School',
      schoolNumber: '12345678',
      schoolAddress: '999 Main St',
      academicYear: '2026-2027'
    });
    expect(password.toLowerCase()).toContain('2026');
    expect(password).toMatch(/5678$/);
  });

  it('uses address number when school number is missing', () => {
    expect(extractSchoolNumberSuffix('')).toBeNull();
    const password = generateStaffTempPassword({
      schoolName: 'Rudy Elementary School',
      schoolAddress: '4521 Oak Avenue',
      academicYear: '2026-2027'
    });
    expect(password).toMatch(/4521$/);
  });
});
