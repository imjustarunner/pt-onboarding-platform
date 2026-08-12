import { describe, it, expect } from 'vitest';
import {
  normalizeAppPath,
  resolveCommandSurface,
  surfaceBoostForNavItem
} from '../resolveCommandSurface.js';
import { searchNav } from '../navSearchIndex.js';

describe('resolveCommandSurface', () => {
  it('strips org slug from nested paths', () => {
    expect(normalizeAppPath('/itsco/workforce-operations')).toBe('/workforce-operations');
    expect(normalizeAppPath('/workforce-operations')).toBe('/workforce-operations');
  });

  it('detects workforce, school, people, operations, admin, and my dashboard', () => {
    expect(resolveCommandSurface({ path: '/itsco/workforce-operations' })?.key).toBe('workforce_operations');
    expect(resolveCommandSurface({ path: '/school-operations' })?.key).toBe('school_operations');
    expect(resolveCommandSurface({ path: '/people-operations' })?.key).toBe('people_operations');
    expect(resolveCommandSurface({ path: '/itsco/admin/employee-relations' })?.key).toBe('people_operations');
    expect(resolveCommandSurface({ path: '/operations-dashboard' })?.key).toBe('operations_dashboard');
    expect(resolveCommandSurface({ path: '/admin-dashboard' })?.key).toBe('admin_dashboard');
    expect(resolveCommandSurface({ name: 'OrganizationAdminDashboard' })?.key).toBe('admin_dashboard');
    expect(resolveCommandSurface({ path: '/dashboard?tab=my' })?.key).toBe('my_dashboard');
  });

  it('boosts school-ops pages when on school operations', () => {
    const surface = resolveCommandSurface({ path: '/school-operations' });
    const schoolItem = { section: 'School Ops › Caseloads', path: '/admin/caseload-hub/schools-staff', title: 'Coverage Needs' };
    const payrollItem = { section: 'Workforce Ops › Payroll', path: '/admin/payroll', title: 'Payroll' };
    expect(surfaceBoostForNavItem(schoolItem, surface)).toBeGreaterThan(
      surfaceBoostForNavItem(payrollItem, surface)
    );
  });

  it('ranks school tools above unrelated when searching from school ops', () => {
    const surface = resolveCommandSurface({ path: '/school-operations' });
    const results = searchNav('coverage', { surface });
    expect(results.length).toBeGreaterThan(0);
    expect(String(results[0].section || '').toLowerCase()).toMatch(/school|workforce/);
  });
});
