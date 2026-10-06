import { beforeEach, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ getCredentialPacketForPortal: vi.fn(), revealPortalTempPassword: vi.fn() }));
vi.mock('../onboardingCredentialPacket.service.js', () => service);
import { getMyAccountAccess, revealMyAccountTempPassword } from '../../controllers/myAccountAccess.controller.js';
let res, next;
beforeEach(() => {
  vi.clearAllMocks();
  res = { set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  service.getCredentialPacketForPortal.mockResolvedValue({ systems: [{ key: 'therapynotes', hasTempPassword: true }] });
});
it('loads only the signed-in employee despite supplied user IDs and forbids caching', async () => {
  await getMyAccountAccess({ user: { id: 7 }, query: { userId: 9 }, params: { userId: 9 } }, res, next);
  expect(service.getCredentialPacketForPortal).toHaveBeenCalledWith(7, { employeeAccount: true });
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
it('requires an authenticated identity', async () => {
  await getMyAccountAccess({ query: { userId: 9 } }, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(service.getCredentialPacketForPortal).not.toHaveBeenCalled();
});
it('reveals only the signed-in employee’s enabled system', async () => {
  service.revealPortalTempPassword.mockResolvedValue({ revealed: true, password: 'example' });
  await revealMyAccountTempPassword({ user: { id: 7 }, params: { systemKey: 'therapynotes' }, body: { userId: 9 } }, res, next);
  expect(service.revealPortalTempPassword).toHaveBeenCalledWith(7, 'therapynotes');
});
it('rejects disabled or unknown systems without revealing a password', async () => {
  await revealMyAccountTempPassword({ user: { id: 7 }, params: { systemKey: 'workspace' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(400); expect(service.revealPortalTempPassword).not.toHaveBeenCalled();
});
