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
const response = () => { const res = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; };
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
