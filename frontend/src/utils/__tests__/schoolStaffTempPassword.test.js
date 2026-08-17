import { describe, expect, it } from 'vitest';
import {
  extractSchoolNumberSuffix,
  generateStaffTempPassword,
  schoolInitials,
  canSetCustomSchoolStaffTempPassword,
  validateCustomSchoolStaffTempPassword
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
    expect(password).toMatch(/5678[#$%*&]$/);
    expect(password).toMatch(/[#$%*&]$/);
  });

  it('uses address number when school number is missing', () => {
    expect(extractSchoolNumberSuffix('')).toBeNull();
    const password = generateStaffTempPassword({
      schoolName: 'Rudy Elementary School',
      schoolAddress: '4521 Oak Avenue',
      academicYear: '2026-2027'
    });
    expect(password).toMatch(/4521[#$%*&]$/);
  });

  it('changes on repeated generation', () => {
    const input = {
      schoolName: 'Riverdale High School',
      schoolNumber: '12345678',
      schoolAddress: '999 Main St',
      academicYear: '2026-2027'
    };
    const passwords = new Set(
      Array.from({ length: 12 }, () => generateStaffTempPassword(input))
    );
    expect(passwords.size).toBeGreaterThan(1);
  });
});

describe('custom school staff temp passwords', () => {
  it('allows only admin, super_admin, and support', () => {
    expect(canSetCustomSchoolStaffTempPassword('admin')).toBe(true);
    expect(canSetCustomSchoolStaffTempPassword('super_admin')).toBe(true);
    expect(canSetCustomSchoolStaffTempPassword('support')).toBe(true);
    expect(canSetCustomSchoolStaffTempPassword('staff')).toBe(false);
    expect(canSetCustomSchoolStaffTempPassword('school_staff')).toBe(false);
    expect(canSetCustomSchoolStaffTempPassword('provider_plus')).toBe(false);
  });

  it('requires 8+ characters and a letter', () => {
    expect(validateCustomSchoolStaffTempPassword('short')).toMatch(/at least 8/);
    expect(validateCustomSchoolStaffTempPassword('12345678')).toMatch(/letter/);
    expect(validateCustomSchoolStaffTempPassword('TempPass1')).toBe('');
  });
});
