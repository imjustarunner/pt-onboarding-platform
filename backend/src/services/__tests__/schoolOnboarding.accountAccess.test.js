import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import SchoolOnboardingInvite from '../../models/SchoolOnboardingInvite.model.js';
import { setPassword, submitOnboarding } from '../schoolOnboarding.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(SchoolOnboardingInvite, 'findByToken').mockResolvedValue({ id: 5, primary_user_id: 42, status: 'in_progress' });
  vi.spyOn(SchoolOnboardingInvite, 'update').mockResolvedValue();
  vi.spyOn(User, 'changePassword').mockResolvedValue();
  vi.spyOn(User, 'updateStatus').mockResolvedValue();
  vi.spyOn(User, 'update').mockResolvedValue();
  pool.execute.mockResolvedValue([[{ status: 'ACTIVE_EMPLOYEE', is_active: 0 }]]);
});
it.each([['set password', setPassword], ['submit', submitOnboarding]])('blocks an old onboarding link at %s before modifying the account or invitation', async (_name, handler) => {
  await expect(handler('old-invite-token')).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  expect(User.changePassword).not.toHaveBeenCalled();
  expect(User.updateStatus).not.toHaveBeenCalled();
  expect(User.update).not.toHaveBeenCalled();
  expect(SchoolOnboardingInvite.update).not.toHaveBeenCalled();
  expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
