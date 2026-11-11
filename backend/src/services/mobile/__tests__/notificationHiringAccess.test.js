import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../agencyAccessProfiles.service.js', () => ({ readAgencyAccess: vi.fn() }));
vi.mock('../../../utils/capabilities.js', () => ({ getUserCapabilities: user => ({ canManageHiring: user.agencyAccess?.permissions.has_hiring_access === true }) }));
import { hiringNotificationAgencyIds, hiringNotificationVisible } from '../../notificationHiringAccess.service.js';
import { resolveNotificationTypePreference } from '../../notificationPreferences.service.js';
describe('applicant notification visibility follows current hiring grants', () => {
  it('hides historical broad notifications in an agency with an explicit hiring denial', async () => {
    const user = { id: 7, role: 'admin' }, access = vi.fn(async (_uid, aid) => ({ role: 'support', permissions: { has_hiring_access: aid === 450 } }));
    const ids = await hiringNotificationAgencyIds(user, [450, 451, 450], { access });
    expect([...ids]).toEqual([450]); expect(access).toHaveBeenCalledTimes(2);
    expect(hiringNotificationVisible({ type: 'new_job_application_submitted', agency_id: 451, user_id: 7 }, ids)).toBe(false);
    expect(hiringNotificationVisible({ type: 'new_job_application_submitted', agency_id: 450, user_id: null }, ids)).toBe(true);
    expect(hiringNotificationVisible({ type: 'task_overdue', agency_id: 451 }, ids)).toBe(true);
  });
  it('rechecks a lost grant and fails closed for a missing profile', async () => {
    const access = vi.fn().mockResolvedValueOnce({ role: 'staff', permissions: { has_hiring_access: true } }).mockResolvedValueOnce(null);
    const user = { id: 7, role: 'staff' };
    expect([...(await hiringNotificationAgencyIds(user, [450], { access }))]).toEqual([450]);
    expect([...(await hiringNotificationAgencyIds(user, [450], { access }))]).toEqual([]);
  });
  it('keeps guardian and school staff out; global admin still respects the supplied mobile agency scope', async () => {
    const access = vi.fn(); expect([...(await hiringNotificationAgencyIds({ id: 7, role: 'client_guardian' }, [450], { access }))]).toEqual([]); expect(access).not.toHaveBeenCalled();
    expect([...(await hiringNotificationAgencyIds({ id: 7, role: 'super_admin' }, [450], { access }))]).toEqual([450]);
    expect(await hiringNotificationAgencyIds({ id: 7, role: 'super_admin' })).toBeNull();
  });
  it('honors a current hiring capability for a provider without enabling unrelated administrative alerts', () => {
    const context = { userRole: 'provider', hiringAccess: true, globalPreferences: { push_notifications_enabled: true }, typePreferences: new Map() };
    const allowed = resolveNotificationTypePreference('new_job_application_submitted', context);
    expect(allowed.effective.inApp).toBe(true); expect(allowed.effective.push).toBe(true);
    expect(resolveNotificationTypePreference('status_expired', context).effective.inApp).toBe(false);
    const denied = resolveNotificationTypePreference('new_job_application_submitted', { ...context, userRole: 'admin', hiringAccess: false });
    expect(denied.effective.inApp).toBe(false); expect(denied.effective.push).toBe(false);
    expect(resolveNotificationTypePreference('new_job_application_submitted', { ...context, globalPreferences: { push_notifications_enabled: false } }).effective.push).toBe(false);
  });
  it('uses the normal push preference for online chat and exchange updates', () => {
    for (const [type, userRole] of [['website_chat_waiting', 'support'], ['client_exchange_match', 'provider']]) {
      const context = { userRole, globalPreferences: { push_notifications_enabled: true }, typePreferences: new Map() };
      expect(resolveNotificationTypePreference(type, context).effective.push).toBe(true);
      context.typePreferences.set(type, { push: false }); expect(resolveNotificationTypePreference(type, context).effective.push).toBe(false);
    }
  });
});
