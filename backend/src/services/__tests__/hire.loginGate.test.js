import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), changePassword: vi.fn(), assertReady: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { changePassword: mocks.changePassword } }));
vi.mock('../hirePortalWorkflow.service.js', () => ({ assertOnboardingPasswordReady: mocks.assertReady }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: {} }));
vi.mock('../personalMailbox.service.js', () => ({ ensurePersonalMailboxForAddress: vi.fn() }));
import { requiresHireActivation } from '../../utils/hirePortalToken.js';
import { canLogin } from '../../utils/accessControl.js';
import { assertHireStaffAccess } from '../hireStaffAccess.service.js';
import { finalizeHireGroupPassword } from '../hireGroupAccount.service.js';
const hire = { id: 1185, role: 'provider', status: 'ONBOARDING', login_is_group_email: 1, sso_password_override: 1, password_hash: 'prepared', work_email: 'staff@example.invalid', personal_email: 'personal@example.invalid' };
beforeEach(() => { vi.resetAllMocks(); mocks.execute.mockResolvedValue([[]]); mocks.assertReady.mockResolvedValue(); });
describe('staff activation boundary', () => {
  it.each(['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'])('keeps %s in the portal even after password setup', async status => {
    const user = { ...hire, status };
    expect(requiresHireActivation(user)).toBe(true);
    expect(canLogin(user)).toBe(false);
    mocks.execute.mockResolvedValue([[user]]);
    await expect(assertHireStaffAccess({ id: hire.id, role: 'provider' })).rejects.toMatchObject({ status: 403, code: 'HIRE_ACTIVATION_REQUIRED' });
  });
  it('permits Paige after explicit activation without requiring a fabricated completion record', async () => {
    const active = { ...hire, status: 'ACTIVE_EMPLOYEE' };
    expect(canLogin(active)).toBe(true);
    mocks.execute.mockResolvedValue([[active]]);
    await expect(assertHireStaffAccess({ id: hire.id })).resolves.toBeUndefined();
  });
  it('checks live status rather than trusting a previously issued session', async () => {
    mocks.execute.mockResolvedValue([[hire]]);
    await expect(assertHireStaffAccess({ id: hire.id, status: 'ACTIVE_EMPLOYEE' })).rejects.toMatchObject({ code: 'HIRE_ACTIVATION_REQUIRED' });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('FROM users WHERE id = ?'), [hire.id]);
  });
  it('preserves legacy training logins and separate approved-employee/demo sessions', async () => {
    expect(canLogin({ ...hire, login_is_group_email: 0 })).toBe(true);
    expect(requiresHireActivation({ ...hire, login_is_group_email: 0, passwordless_token_purpose: 'prehire_portal' })).toBe(true);
    await assertHireStaffAccess({ id: 1, type: 'approved_employee' });
    await assertHireStaffAccess({ id: 1, demoMode: true });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
describe('password preparation', () => {
  const user = { ...hire, sso_password_override: 0, password_hash: null };
  const agency = { id: 2, feature_flags: { hireAccountMode: 'group_password' } };
  it('rejects unfinished onboarding before any password or login flag mutation', async () => {
    mocks.assertReady.mockRejectedValue(Object.assign(new Error('Complete every required onboarding step'), { code: 'ONBOARDING_INCOMPLETE' }));
    await expect(finalizeHireGroupPassword({ user, agency, password: 'A synthetic password' })).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
    expect(mocks.changePassword).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('prepares the password after prerequisites but leaves activation separate', async () => {
    const result = await finalizeHireGroupPassword({ user, agency, password: 'A synthetic password' });
    expect(mocks.assertReady).toHaveBeenCalledWith(user.id, 2);
    expect(result.passwordSet).toBe(true);
    expect(mocks.execute.mock.calls.some(([sql]) => /SET status/.test(sql))).toBe(false);
    expect(canLogin({ ...user, sso_password_override: 1 })).toBe(false);
  });
});
