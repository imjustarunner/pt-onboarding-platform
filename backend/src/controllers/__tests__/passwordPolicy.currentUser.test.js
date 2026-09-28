import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ byId: vi.fn(), agencies: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(() => { throw new Error('Unexpected database access'); }) }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.byId, getAgencies: mocks.agencies } }));
vi.mock('../../utils/capabilities.js', async original => ({ ...await original(), buildAgencyAccessCaps: vi.fn(async () => ({})) }));
import { getCurrentUser } from '../user.controller.js';

let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.byId.mockResolvedValue({ id: 7, role: 'super_admin', email: 'member@example.test', password_hash: 'old-password', password_changed_at: '2020-01-01', sso_password_override: 1 });
  mocks.agencies.mockResolvedValue([]);
  req = { user: { id: 7 }, authClaims: { authMethod: 'google', sessionId: 'verified-session' }, query: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() }; next = vi.fn();
});
async function response() {
  await getCurrentUser(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
}
describe('current-user password policy', () => {
  it.each([{}, { loginBootstrap: '1' }])('clears expiry for a verified Google session on refresh and bootstrap (%j)', async query => {
    req.query = query;
    expect(await response()).toMatchObject({ authMethod: 'google', requiresPasswordChange: false, passwordExpired: false, passwordExpiresAt: null, passwordExpiresSoon: false });
  });
  it('preserves Google provenance through a signed brand switch', async () => {
    req.authClaims = { brandSwitch: true, loginMethod: 'google' };
    expect(await response()).toMatchObject({ authMethod: 'google', requiresPasswordChange: false, passwordExpired: false });
  });
  it('does not manufacture password expiry when the optional SSO policy lookup fails', async () => {
    mocks.agencies.mockRejectedValue(new Error('Temporary lookup failure'));
    expect(await response()).toMatchObject({ requiresPasswordChange: false, passwordExpired: false });
  });
  it('still requires rotation for a password login, regardless of caller-supplied Google hints', async () => {
    req.authClaims = {};
    req.query = { authMethod: 'google', sso: '1' };
    req.body = { authMethod: 'google' };
    req.user.authMethod = 'google';
    expect(await response()).toMatchObject({ authMethod: null, requiresPasswordChange: true, passwordExpired: true });
  });
});
