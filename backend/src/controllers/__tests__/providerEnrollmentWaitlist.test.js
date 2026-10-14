import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), load: vi.fn(), findUser: vi.fn(), isSupervisor: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.findUser, isSupervisor: mocks.isSupervisor } }));
vi.mock('../../services/providerEnrollmentWaitlist.service.js', () => ({ loadEnrollmentWaitlist: mocks.load }));
import { getEnrollmentWaitlist } from '../providerEnrollmentWaitlist.controller.js';
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockResolvedValue([[{ user_id: 8 }]]);
  mocks.isSupervisor.mockReturnValue(false);
  mocks.load.mockResolvedValue([{ clientId: 30, providerId: 8, clientName: 'Test Client', status: 'WAITLIST', providerEmail: 'internal@example.test', contactEmail: 'contact@example.test', submissionId: 90, contact: { email: 'contact@example.test' } }]);
  req = { user: { id: 8, role: 'provider' }, params: { providerId: '8' }, query: { agencyId: '2' } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  next = vi.fn();
});
describe('provider waitlist scheduling access', () => {
  it('allows a provider to see only their own waitlist in an active membership', async () => {
    await getEnrollmentWaitlist(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledWith({ agencyId: 2, providerId: 8 });
    const result = res.json.mock.calls[0][0];
    expect(result).toMatchObject({ count: 1, canManage: false, requests: [{ clientId: 30, contact: { email: 'contact@example.test' } }] });
    expect(result.requests[0]).not.toHaveProperty('submissionId');
    expect(result.requests[0]).not.toHaveProperty('providerEmail');
  });
  it.each([{}, { providerId: '9' }])('rejects a provider requesting other providers or all waitlists', async params => {
    req.params = params;
    await getEnrollmentWaitlist(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects cross-tenant support access and inactive memberships', async () => {
    req.user.role = 'support'; req.params = {};
    mocks.execute.mockResolvedValue([[]]);
    await getEnrollmentWaitlist(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('allows authorized support to see the agency aggregate without granting a clinical assignment', async () => {
    req.user.role = 'support'; req.params = {};
    await getEnrollmentWaitlist(req, res, next);
    expect(mocks.load).toHaveBeenCalledWith({ agencyId: 2, providerId: null });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canManage: true }));
    expect(mocks.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it('matches existing office-client supervisor access without treating every Provider Plus as a manager', async () => {
    req.user.role = 'provider_plus'; req.params = {};
    await getEnrollmentWaitlist(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    mocks.isSupervisor.mockReturnValue(true);
    await getEnrollmentWaitlist(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canManage: true }));
  });
});
