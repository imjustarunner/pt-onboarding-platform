import { describe, expect, it, vi } from 'vitest';
import router from '../index.js';
import { hasRequiredRouteRole } from '../routeRoleAccess.js';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

describe('Support navigation permissions', () => {
  it.each(['/admin/settings', '/auricwell-qa-demo/admin/settings',
    '/admin/email-settings', '/auricwell-qa-demo/admin/email-settings'])('denies administrative settings at %s', path => {
    const route = router.resolve(path);
    expect(route.matched.length).toBeGreaterThan(0);
    expect(route.meta.requiresAuth).toBe(true);
    expect(route.meta.requiresRole).toBeTruthy();
    expect(hasRequiredRouteRole('support', route.meta.requiresRole)).toBe(false);
    expect(hasRequiredRouteRole('admin', route.meta.requiresRole)).toBe(true);
  });

  it.each(['/auricwell-qa-demo/admin/clients', '/auricwell-qa-demo/client-exchange',
    '/auricwell-qa-demo/workforce-operations', '/auricwell-qa-demo/buildings/schedule'])('retains explicit operational access at %s', path => {
    const route = router.resolve(path);
    expect(route.meta.requiresAuth).toBe(true);
    expect(route.meta.requiresRole).toBeTruthy();
    expect(hasRequiredRouteRole('support', route.meta.requiresRole)).toBe(true);
  });

  it('does not infer admin or clinical roles from support, including guardian preview', () => {
    for (const role of ['admin', 'super_admin', 'provider', 'supervisor', 'clinical_practice_assistant', 'supervisor_or_cpa', 'client_guardian']) {
      expect(hasRequiredRouteRole('support', role, { guardianPreview: true })).toBe(false);
    }
    expect(hasRequiredRouteRole('support', ['admin', 'support'])).toBe(true);
    expect(hasRequiredRouteRole('support', 'schedule_manager')).toBe(true);
  });

  it('preserves existing administrator and clinical role relationships', () => {
    expect(hasRequiredRouteRole('super_admin', 'admin')).toBe(true);
    expect(hasRequiredRouteRole('provider_plus', 'clinical_practice_assistant')).toBe(true);
    expect(hasRequiredRouteRole('supervisor', 'supervisor_or_cpa')).toBe(true);
    expect(hasRequiredRouteRole('super_admin', 'client_guardian')).toBe(false);
    expect(hasRequiredRouteRole('super_admin', 'client_guardian', { guardianPreview: true })).toBe(true);
  });
});
