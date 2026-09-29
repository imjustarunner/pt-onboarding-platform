import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ byEmail: vi.fn(), agencies: vi.fn(), execute: vi.fn(), bySlug: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail: m.byEmail, getAgencies: m.agencies } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findBySlug: m.bySlug, findByPortalUrl: m.bySlug } }));
vi.mock('../../services/email.service.js', () => ({ default: { isConfigured: () => false } }));
vi.mock('../summitStats.controller.js', () => ({ getPlatformAgencyId: vi.fn() }));
import { identifyLogin } from '../auth.controller.js';
const agency = { id: 2, slug: 'itsco', organization_type: 'agency', feature_flags: {
  googleSsoEnabled: true, googleSsoRequiredRoles: ['provider', 'clinical_practice_assistant', 'provider_plus'], googleSsoAllowedDomains: ['itsco.health']
} };
let user;
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: 50, role: 'provider', status: 'ACTIVE_EMPLOYEE', email: 'provider@itsco.health', password_hash: null, temporary_password_hash: null };
  m.byEmail.mockImplementation(async () => user);
  m.execute.mockResolvedValue([[]]); m.agencies.mockResolvedValue([agency]); m.bySlug.mockResolvedValue(agency);
});
async function identify(extra = {}) {
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }, next = vi.fn();
  await identifyLogin({ body: { username: user.email, organizationSlug: 'itsco', ...extra }, headers: {}, get: () => '' }, res, next);
  expect(next).not.toHaveBeenCalled(); return res.json.mock.calls[0][0];
}
describe('employee Google and password routing', () => {
  it.each(['provider', 'clinical_practice_assistant', 'provider_plus'])('routes an existing %s to Google without requiring an app password', async role => {
    user.role = role;
    expect((await identify()).login).toEqual({ method: 'google', googleStartUrl: '/auth/google/start?orgSlug=itsco' });
  });
  it.each([{ login_is_group_email: 1 }, { login_is_group_email: '1' }, { sso_password_override: 1 }, { is_demo: 1 }])
    ('preserves password login for %j even with mandatory tenant SSO', async fields => {
      Object.assign(user, fields, { password_hash: 'existing-password' });
      expect((await identify()).login.method).toBe('password');
      expect((await identify({ rescue: true })).login.method).toBe('password');
    });
  it('respects explicitly disabled tenant SSO', async () => {
    const disabled = { ...agency, feature_flags: { ...agency.feature_flags, googleSsoEnabled: false } };
    m.bySlug.mockResolvedValue(disabled); m.agencies.mockResolvedValue([disabled]);
    expect((await identify()).login.method).toBe('password');
  });
});
