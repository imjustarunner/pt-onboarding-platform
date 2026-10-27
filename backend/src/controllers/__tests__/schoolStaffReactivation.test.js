import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../services/schoolStaffReactivation.service.js', () => ({ restoreSchoolStaffAccess: vi.fn() }));
import { restoreSchoolStaffAccess } from '../../services/schoolStaffReactivation.service.js';
import { createSchoolStaffReactivationHandler } from '../schoolStaffReactivation.controller.js';

let req, res, next, access, flags, run;
beforeEach(() => {
  vi.resetAllMocks();
  req = { params: { organizationId: '20', userId: '42' }, user: { id: 3, role: 'admin' } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  access = vi.fn().mockResolvedValue(true); flags = vi.fn().mockResolvedValue({ isSchoolAdmin: true });
  run = () => createSchoolStaffReactivationHandler({ hasSchoolAccess: access, getSchoolRoleFlags: flags })(req, res, next);
});

it('restores only the selected school identity and returns no credentials', async () => {
  await run();
  expect(restoreSchoolStaffAccess).toHaveBeenCalledExactlyOnceWith({ userId: 42, schoolOrganizationId: 20, actorUserId: 3 });
  expect(res.json).toHaveBeenCalledWith({ ok: true, message: expect.stringContaining('password and school permissions are unchanged') });
});
it('requires school access even for an agency administrator', async () => {
  access.mockResolvedValue(false); await run();
  expect(res.status).toHaveBeenCalledWith(403); expect(restoreSchoolStaffAccess).not.toHaveBeenCalled();
});
it('permits a school admin to restore another staff member', async () => {
  req.user.role = 'school_staff'; await run(); expect(flags).toHaveBeenCalled(); expect(restoreSchoolStaffAccess).toHaveBeenCalled();
});
it('rejects ordinary school staff', async () => {
  req.user.role = 'school_staff'; flags.mockResolvedValue({ isSchoolAdmin: false }); await run();
  expect(res.status).toHaveBeenCalledWith(403); expect(restoreSchoolStaffAccess).not.toHaveBeenCalled();
});
it.each(['provider', 'client_guardian'])('rejects the %s role', async role => {
  req.user.role = role; await run(); expect(res.status).toHaveBeenCalledWith(403); expect(restoreSchoolStaffAccess).not.toHaveBeenCalled();
});
it('prevents self-reactivation from an old session', async () => {
  req.user = { id: 42, role: 'school_staff' }; await run();
  expect(res.status).toHaveBeenCalledWith(403); expect(restoreSchoolStaffAccess).not.toHaveBeenCalled();
});
it('does not claim success when the transaction fails', async () => {
  const error = new Error('Audit storage unavailable'); restoreSchoolStaffAccess.mockRejectedValue(error);
  await run(); expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
});
it('rejects invalid identifiers before checking access', async () => {
  req.params.userId = '42x'; await run(); expect(res.status).toHaveBeenCalledWith(400); expect(access).not.toHaveBeenCalled();
});
