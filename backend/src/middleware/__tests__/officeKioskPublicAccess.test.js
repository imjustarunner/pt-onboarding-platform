import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/hireStaffAccess.service.js', () => ({ assertHireStaffAccess: vi.fn() }));
vi.mock('../../config/config.js', () => ({ default: {} }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: vi.fn(), buildAgencyAccessCaps: vi.fn() }));
vi.mock('../../utils/supervisorSchoolAccess.js', () => ({ isSupervisorActor: vi.fn(), supervisorHasSuperviseeInSchool: vi.fn() }));
vi.mock('../../utils/sscClubAccess.js', () => ({ canUserManageClub: vi.fn(), getUserClubMembership: vi.fn(), inferLegacyClubRole: vi.fn() }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ hasTenantAccess: vi.fn() }));
vi.mock('../../services/sessionSecurity.service.js', () => ({ getSessionSecurity: vi.fn(), sessionRouteAllowed: vi.fn(), invalidateSessionPolicyCache: vi.fn() }));
vi.mock('../accountSecurity.middleware.js', () => ({ enforceAccountSecurity: vi.fn() }));
vi.mock('../schoolCareBridgeScope.middleware.js', () => ({ enforceSchoolCareBridgeScope: vi.fn() }));
vi.mock('../../services/personalSessionHistory.service.js', () => ({ recordAccountSession: vi.fn() }));
import { authenticate } from '../auth.middleware.js';
async function request(method, path) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await authenticate({ method, originalUrl: path, headers: {}, cookies: {} }, res, next);
  return { res, next };
}
describe('public lobby directory authentication boundary', () => {
  it.each(['/api/kiosk/1/office-directory', '/api/kiosk/1/office-directory/?refresh=1', '/api/kiosk/1/providers-today'])('allows signed-out GET %s', async path => {
    const { res, next } = await request('GET', path);
    expect(next).toHaveBeenCalledOnce(); expect(res.status).not.toHaveBeenCalled();
  });
  it.each([['POST', '/api/kiosk/1/office-directory'], ['GET', '/api/kiosk/1/office-directory/private'], ['GET', '/api/kiosk/1/checkins'], ['GET', '/api/kiosk/me/context']])('still authenticates %s %s', async (method, path) => {
    const { res, next } = await request(method, path);
    expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
  });
});
