import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), agency: vi.fn(), icon: vi.fn(), platform: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
vi.mock('../../models/Icon.model.js', () => ({ default: { findById: mocks.icon } }));
vi.mock('../../models/PlatformBranding.model.js', () => ({ default: { get: mocks.platform } }));
import { updateDashboardIcon, updatePlatformDashboardIcon } from '../dashboardIcons.controller.js';

const request = (body = {}) => ({ user: { id: 7, role: 'super_admin' }, params: { id: '2' }, body: { surface: 'dashboard', key: 'overview', iconId: 57, ...body } });
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => {
  vi.resetAllMocks(); mocks.agency.mockResolvedValue({ id: 2 }); mocks.icon.mockResolvedValue({ id: 57 }); mocks.platform.mockResolvedValue({ id: 12 });
});
describe('dashboard icon assignment', () => {
  it.each(['admin', 'provider', 'support', undefined])('denies platform edits from %s', async (role) => {
    const req = request(); req.user.role = role; const res = response();
    await updatePlatformDashboardIcon(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('updates only the current platform row and records the editor', async () => {
    const res = response(); await updatePlatformDashboardIcon(request(), res, vi.fn());
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('dashboard_icon_overrides = JSON_MERGE_PATCH'), [JSON.stringify({ dashboard: { overview: 57 } }), 7, 12]);
    expect(mocks.agency).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith({ id: 12 });
  });
  it('rejects a missing platform record without inserting a blank replacement', async () => {
    mocks.platform.mockResolvedValue({ id: null }); const res = response();
    await updatePlatformDashboardIcon(request(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('validates platform assignment keys', async () => {
    const res = response(); await updatePlatformDashboardIcon(request({ key: '../agency' }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(['admin', 'provider', 'support', undefined])('denies %s before reading or writing data', async (role) => {
    const req = request(); req.user.role = role; const res = response();
    await updateDashboardIcon(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.agency).not.toHaveBeenCalled();
  });
  it.each([{ key: '__proto__' }, { key: 'overview.foo' }, { surface: 'settings' }, { iconId: -1 }, { iconId: '57' }, { iconId: undefined }])('rejects invalid input %j', async (body) => {
    const res = response(); await updateDashboardIcon(request(body), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('merges only the selected tenant and card into existing settings', async () => {
    const res = response(); await updateDashboardIcon(request(), res, vi.fn());
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('JSON_MERGE_PATCH'), [JSON.stringify({ dashboardIconOverrides: { dashboard: { overview: 57 } } }), 2]);
    expect(res.json).toHaveBeenCalledWith({ id: 2 });
  });
  it('removes only the override when restoring an inherited icon', async () => {
    await updateDashboardIcon(request({ iconId: null }), response(), vi.fn());
    expect(mocks.icon).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.execute.mock.calls[0][1][0]).dashboardIconOverrides.dashboard.overview).toBeNull();
  });
  it('does not save a missing icon', async () => {
    mocks.icon.mockResolvedValue(null); const res = response();
    await updateDashboardIcon(request(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404); expect(mocks.execute).not.toHaveBeenCalled();
  });
});
