import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ byId: vi.fn(), membership: vi.fn(), agency: vi.fn(), recovery: vi.fn(), access: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.byId, getAgencyMembership: m.membership } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../../services/passwordRecovery.service.js', () => ({ requestPasswordRecoveryEmail: m.recovery }));
import { createSchoolStaffRecoveryHandler } from '../schoolStaffRecovery.controller.js';
let req, res, next, user;
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: 42, email: 'staff@school.example', role: 'school_staff', status: 'ACTIVE_EMPLOYEE', password_hash: 'unchanged' };
  req = { params: { organizationId: '20', userId: '42' }, user: { id: 3, role: 'school_staff' }, body: { sendEmail: true } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  m.byId.mockResolvedValue(user); m.membership.mockResolvedValue({ agency_id: 20 }); m.access.mockResolvedValue(true);
  m.agency.mockResolvedValue({ id: 20, slug: 'school' }); m.recovery.mockResolvedValue({ outcome: 'sent', resetLink: 'secret-reset-link' });
});
const run = () => createSchoolStaffRecoveryHandler(m.access)(req, res, next);
describe('school portal optional account recovery', () => {
  it('lets a fellow staff member send email without returning a reset token', async () => {
    await run();
    expect(m.recovery).toHaveBeenCalledWith(expect.objectContaining({ targetUser: user, organizationSlug: 'school', generatedByUserId: 3 }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ emailSent: true });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret-reset-link');
    expect(user.password_hash).toBe('unchanged');
  });
  it('allows recovery for their own school account', async () => {
    req.user.id = 42; await run(); expect(m.recovery).toHaveBeenCalled();
  });
  it.each(['PENDING_SETUP', 'ARCHIVED'])('supports %s without changing account status', async (status) => {
    user.status = status; await run(); expect(m.recovery).toHaveBeenCalled(); expect(user.status).toBe(status);
  });
  it('checks school access for agency admins too', async () => {
    req.user.role = 'admin'; m.access.mockResolvedValue(false); await run();
    expect(res.status).toHaveBeenCalledWith(403); expect(m.recovery).not.toHaveBeenCalled();
  });
  it('rejects accounts outside the school', async () => {
    m.membership.mockResolvedValue(null); await run(); expect(res.status).toHaveBeenCalledWith(400); expect(m.recovery).not.toHaveBeenCalled();
  });
  it('rejects non-school accounts', async () => {
    user.role = 'provider'; await run(); expect(res.status).toHaveBeenCalledWith(400); expect(m.recovery).not.toHaveBeenCalled();
  });
  it('reports delivery failure instead of claiming an email was sent', async () => {
    m.recovery.mockResolvedValue({ outcome: 'failed' }); await run(); expect(res.status).toHaveBeenCalledWith(502);
  });
  it('confirms manual review without claiming a recovery email was sent', async () => {
    m.recovery.mockResolvedValue({ outcome: 'support_requested', ticketId: 81 });
    await run();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, emailSent: false, message: expect.stringContaining('24–48 hours') }));
    expect(res.status).not.toHaveBeenCalled();
  });
  it('rejects SSO recovery', async () => {
    m.recovery.mockResolvedValue({ outcome: 'sso_required' }); await run(); expect(res.status).toHaveBeenCalledWith(409);
  });
  it('does not expose tokens to old clients requesting a copy', async () => {
    req.body.sendEmail = false; await run();
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('tokenLink'); expect(m.recovery).toHaveBeenCalled();
  });
});
