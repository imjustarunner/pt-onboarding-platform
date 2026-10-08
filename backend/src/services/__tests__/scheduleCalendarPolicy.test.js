import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), findByEmail: vi.fn() } }));
import User from '../../models/User.model.js';
import { usesGoogleSchedule, googleScheduleAllowedForEmail } from '../scheduleCalendarPolicy.service.js';
const user = { id: 7, role: 'provider', email: 'provider@work.example' };
beforeEach(() => {
  vi.clearAllMocks();
  User.getAgencies.mockResolvedValue([{ feature_flags: { googleSsoEnabled: true, googleSsoRequiredRoles: ['provider'] } }]);
  User.findByEmail.mockResolvedValue(user);
});
describe('schedule Google eligibility follows persisted sign-in policy', () => {
  it('keeps Google for an SSO provider', async () => expect(await usesGoogleSchedule(user)).toBe(true));
  it.each(['sso_password_override', 'login_is_group_email', 'is_demo'])('disables Google for %s despite an SSO tenant', async flag => {
    expect(await usesGoogleSchedule({ ...user, [flag]: 1 })).toBe(false);
    expect(User.getAgencies).not.toHaveBeenCalled();
  });
  it('disables Google for password accounts with a Google-looking email', async () => {
    User.getAgencies.mockResolvedValue([{ feature_flags: { googleSsoEnabled: false } }]);
    expect(await googleScheduleAllowedForEmail('PROVIDER@WORK.EXAMPLE')).toBe(false);
    expect(User.findByEmail).toHaveBeenCalledWith('provider@work.example');
  });
  it('does not enable Google for unknown accounts or a role outside the SSO policy', async () => {
    expect(await usesGoogleSchedule({ ...user, role: 'client_guardian' })).toBe(false);
    User.findByEmail.mockResolvedValue(null);
    expect(await googleScheduleAllowedForEmail('unknown@example.com')).toBe(false);
  });
  it('does not grant Google access when the policy cannot be loaded', async () => {
    User.getAgencies.mockRejectedValue(new Error('unavailable'));
    await expect(usesGoogleSchedule(user)).rejects.toThrow('unavailable');
  });
});
