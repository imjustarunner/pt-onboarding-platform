import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), submitted: vi.fn(), ready: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../hireJourney.service.js', () => ({ requireOnboardingSubmitted: m.submitted }));
vi.mock('../hireGroupEmail.service.js', () => ({ ensureHireGroupEmailForActivation: m.ready }));
import User from '../../models/User.model.js';
const user = { id: 9, status: 'ONBOARDING', login_is_group_email: 1, work_email: 'staff@tenant.test' };
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(User, 'findById').mockResolvedValue(user); m.execute.mockResolvedValue([{ affectedRows: 1 }]); });
it('checks verified sending before persisting activation', async () => {
 await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE');
 expect(m.submitted).toHaveBeenCalledWith(user.id); expect(m.ready).toHaveBeenCalledWith(user);
 expect(m.ready.mock.invocationCallOrder[0]).toBeLessThan(m.execute.mock.invocationCallOrder[0]);
 expect(m.execute.mock.calls[0][1][0]).toBe('ACTIVE_EMPLOYEE');
});
it('leaves onboarding status and portal access intact on Gmail failure, then allows retry', async () => {
 m.ready.mockRejectedValueOnce(Object.assign(new Error('Sender unavailable'), { code: 'HIRE_GROUP_SENDER_NOT_READY' }));
 await expect(User.updateStatus(user.id, 'ACTIVE_EMPLOYEE')).rejects.toHaveProperty('code', 'HIRE_GROUP_SENDER_NOT_READY'); expect(m.execute).not.toHaveBeenCalled();
 await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE'); expect(m.execute).toHaveBeenCalledOnce();
});
it('preserves onboarding prerequisites and does not provision mail for a premature activation', async () => {
 m.submitted.mockRejectedValue(new Error('Onboarding incomplete')); await expect(User.updateStatus(user.id, 'ACTIVE_EMPLOYEE')).rejects.toThrow('Onboarding incomplete'); expect(m.ready).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
it('does not add Gmail requirements to non-group employees or other status changes', async () => {
 User.findById.mockResolvedValue({ ...user, login_is_group_email: 0 }); await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE');
 User.findById.mockResolvedValue(user); await User.updateStatus(user.id, 'ONBOARDING'); expect(m.ready).not.toHaveBeenCalled();
});
