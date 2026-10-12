import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: vi.fn(), requireActiveStatus: vi.fn() }));
vi.mock('../../middleware/auricwellPreview.middleware.js', () => ({ requirePreviewAdmin: vi.fn() }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../services/toastAnnouncements.service.js', () => ({ listToasts: vi.fn(), saveToast: vi.fn(), deleteToast: vi.fn() }));
import router from '../auricwellPreview.routes.js';
import { listToasts, saveToast, deleteToast } from '../../services/toastAnnouncements.service.js';
import { previewRouteAllowed } from '../../services/auricwellPreviewPolicy.js';
const handler = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
const response = () => { const res = { json: vi.fn(), set: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => { vi.clearAllMocks(); listToasts.mockResolvedValue([]); saveToast.mockResolvedValue({ id: 42 }); deleteToast.mockResolvedValue({ deleted: true }); });
it('opens only the reviewed toast endpoints through the existing preview boundary', () => {
  for (const path of ['/auricwell-preview/toasts', '/platform/toast-announcements']) {
    expect(previewRouteAllowed('GET', path)).toBe(true);
    expect(previewRouteAllowed('POST', path)).toBe(true);
    expect(previewRouteAllowed('PUT', `${path}/42`)).toBe(true);
    expect(previewRouteAllowed('DELETE', `${path}/42`)).toBe(true);
    expect(previewRouteAllowed('DELETE', path)).toBe(false);
    expect(previewRouteAllowed('PUT', `${path}/other`)).toBe(false);
  }
  expect(previewRouteAllowed('GET', '/auricwell-preview/toasts/active')).toBe(true);
  expect(previewRouteAllowed('POST', '/agencies/7/announcements')).toBe(false);
  expect(previewRouteAllowed('POST', '/platform/other')).toBe(false);
});
it('requires a validated practice even for authenticated preview users', async () => {
  const next = vi.fn();
  await handler('/toasts/active', 'get')({ user: { id: 9 } }, response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  expect(listToasts).not.toHaveBeenCalled();
});
it('pins every read and write to the validated practice and includes support notices only in the active feed', async () => {
  const req = { user: { id: 9 }, auricwellPreview: { agencyId: 7 }, params: { id: '42' }, body: { agency_id: 99, message: 'Administrative offices closed.' } };
  const next = vi.fn();
  await handler('/toasts/active', 'get')(req, response(), next);
  expect(listToasts).toHaveBeenCalledWith({ agencyId: 7, active: true, includeSupport: true });
  await handler('/toasts', 'get')(req, response(), next);
  expect(listToasts).toHaveBeenLastCalledWith({ agencyId: 7 });
  await handler('/toasts', 'post')(req, response(), next);
  expect(saveToast).toHaveBeenCalledWith({ agencyId: 7, userId: 9, input: req.body });
  await handler('/toasts/:id', 'put')(req, response(), next);
  expect(saveToast).toHaveBeenLastCalledWith({ agencyId: 7, userId: 9, id: '42', input: req.body });
  await handler('/toasts/:id', 'delete')(req, response(), next);
  expect(deleteToast).toHaveBeenCalledWith({ agencyId: 7, id: '42' });
  expect(next).not.toHaveBeenCalled();
});

it('gives practice and support notices the same authenticated login dismissal boundary', async () => {
  listToasts.mockResolvedValue([{ id: 1, delivery_scope: 'agency' }, { id: 2, delivery_scope: 'auricwell_support' }]);
  const read = async sessionId => {
    const res = response(), next = vi.fn();
    await handler('/toasts/active', 'get')({ user: { id: 9 }, authClaims: { sessionId }, auricwellPreview: { agencyId: 7 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    return res.json.mock.calls[0][0];
  };
  const first = await read('cookie-login-a');
  expect(first[0].login_session_key).toMatch(/^[a-f0-9]{64}$/);
  expect(first[0].login_session_key).toBe(first[1].login_session_key);
  expect((await read('cookie-login-b'))[0].login_session_key).not.toBe(first[0].login_session_key);
});
