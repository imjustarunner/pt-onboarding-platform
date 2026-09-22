import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ byId: vi.fn(), validate: vi.fn(), change: vi.fn(), update: vi.fn(), consume: vi.fn(), recovery: vi.fn(), execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.byId, validatePasswordlessToken: m.validate, changePassword: m.change, update: m.update, markTokenAsUsed: m.consume } }));
vi.mock('../../services/passwordRecovery.service.js', () => ({ requestPasswordRecoveryEmail: m.recovery }));
vi.mock('../../services/email.service.js', () => ({ default: { isConfigured: () => true } }));
vi.mock('../summitStats.controller.js', () => ({ getPlatformAgencyId: vi.fn() }));
import { requestPasswordReset, resetPasswordWithToken, validateResetToken, validateSetupToken, initialSetup } from '../auth.controller.js';
import { PASSWORD_RECOVERY_SUPPORT_MESSAGE } from '../../services/passwordRecoveryPolicy.service.js';
let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { params: { token: 'previously-issued-reset-token' }, body: { email: 'person@example.test', password: 'UniquePassword!9473' }, headers: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn() }; next = vi.fn();
  m.validate.mockResolvedValue({ id: 42, passwordless_token_purpose: 'reset', role: 'school_staff', status: 'ACTIVE_EMPLOYEE' });
  m.byId.mockResolvedValue({ id: 42, status: 'INACTIVE_EMPLOYEE' });
});
describe('public password recovery', () => {
  it('confirms support submission without exposing account state, ticket ID, or reset link', async () => {
    m.recovery.mockResolvedValue({ outcome: 'support_requested', ticketId: 81 });
    await requestPasswordReset(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ ok: true, message: PASSWORD_RECOVERY_SUPPORT_MESSAGE });
  });
  it('does not acknowledge a ticket that failed to save', async () => {
    const error = new Error('ticket unavailable'); m.recovery.mockRejectedValue(error);
    await requestPasswordReset(req, res, next);
    expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
  it.each([
    ['validation', validateResetToken], ['setup validation', validateSetupToken], ['reset', resetPasswordWithToken], ['initial setup', initialSetup]
  ])('blocks old links at %s before changing credentials or issuing a session', async (_name, handler) => {
    await handler(req, res, next);
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
    expect(m.change).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
    expect(m.consume).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
