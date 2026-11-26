import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ module: vi.fn(), members: vi.fn(), catalog: vi.fn(), focuses: vi.fn(), contents: vi.fn(), guide: vi.fn(), image: vi.fn(), employee: vi.fn(), user: vi.fn() }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: (req, res, next) => { if (!req.identity) return res.status(401).json({});req.user = req.identity;next(); } }));
vi.mock('../../models/Module.model.js', () => ({ default: { findById: m.module } }));
vi.mock('../../models/ModuleContent.model.js', () => ({ default: { findByModuleId: m.contents } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.members, findById: m.user } }));
vi.mock('../../models/ApprovedEmployee.model.js', () => ({ default: { findByEmail: m.employee } }));
vi.mock('../../models/AgencyPublicTraining.model.js', () => ({ default: { getPublicModules: m.catalog, getPublicTrainingFocuses: m.focuses, getModuleAssignment: vi.fn(async () => null) } }));
vi.mock('../../services/hireFingerprintingGuide.service.js', () => ({ loadTrainingFingerprintingGuide: m.guide, readHireFingerprintingScreenshot: m.image }));
import router from '../publicTraining.routes.js';
import { trainingFingerprintingScreenshot } from '../../controllers/hireFingerprintingScreenshot.controller.js';
const png = Buffer.from('synthetic PNG bytes'), screenshotId = 'a'.repeat(64), identity = { id: 9100, role: 'provider' };
let course, guide;
beforeEach(() => {
 vi.clearAllMocks();course = { id: 10, agency_id: 9000, title: 'Denver School-Based Counseling – Fingerprinting', is_active: 1, publish_status: 'published' };
 guide = { moduleId: 10, html: '<p>Shared guide with screenshots.</p>', instructions: 'Current saved instructions.' };
 m.module.mockResolvedValue(course);m.members.mockResolvedValue([{ id: 9000 }]);m.catalog.mockResolvedValue([{ module_id: 10 }]);m.focuses.mockResolvedValue([]);m.contents.mockResolvedValue([{ id: 77, content_type: 'text' }]);
 m.guide.mockResolvedValue(guide);m.image.mockResolvedValue(png);m.employee.mockResolvedValue({ agency_id: 9000, user_id: 9100 });m.user.mockResolvedValue({ id: 9100, is_archived: 0 });
});
function request({ user = identity, agencyId = 9000, images = true } = {}) {
 return new Promise(resolve => {
  const url = '/modules/10' + (images ? '/fingerprinting-screenshots/' + screenshotId : '');
  const req = { method: 'GET', url, originalUrl: url, identity: user, query: { agencyId }, headers: {}, body: {} };
  const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code;return this; }, json(body) { resolve({ status: this.statusCode, body }); }, set(headers) { Object.assign(this.headers, headers);return this; }, type() { return this; }, send(body) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
  router.handle(req, res, error => resolve({ status: error?.status || 404, error }));
 });
}
it('requires authentication for on-demand screenshots', async () => {
 expect((await request({ user: null })).status).toBe(401);expect(m.image).not.toHaveBeenCalled();
});
it('returns the current shared guide alongside the editable original course content', async () => {
 const result = await request({ images: false });expect(result.status).toBe(200);expect(result.body).toMatchObject({ id: 10, content: [{ id: 77 }], fingerprintingGuide: guide });
});
it('serves the original private screenshot through ordinary training access without hiring privileges', async () => {
 const result = await request();expect(result.status).toBe(200);expect(result.body).toEqual(png);
 expect(result.headers).toMatchObject({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
 expect(m.image).toHaveBeenCalledWith(9000, screenshotId);
});
it('rejects a different selected organization before requesting private image bytes', async () => {
 expect((await request({ agencyId: 9001 })).status).toBe(403);expect(m.image).not.toHaveBeenCalled();
});
it('requires the course to remain in the selected organization’s catalog', async () => {
 m.catalog.mockResolvedValue([]);expect((await request()).status).toBe(403);expect(m.image).not.toHaveBeenCalled();
});
it('does not serve fingerprinting references through an unrelated course', async () => {
 m.guide.mockResolvedValue(null);expect((await request()).status).toBe(404);expect(m.image).not.toHaveBeenCalled();
});
it('retains the approved-employee access path and denies archived accounts', async () => {
 const user = { id: 9900, type: 'approved_employee', email: 'fixture@example.invalid' };
 expect((await request({ user })).status).toBe(200);
 m.image.mockClear();m.user.mockResolvedValue({ id: 9100, is_archived: 1 });
 expect((await request({ user })).status).toBe(403);expect(m.image).not.toHaveBeenCalled();
});
it('also supports assigned training using the existing module membership policy', async () => {
 const req = { user: identity, params: { id: 10, screenshotId } }, next = vi.fn();
 const res = { set: vi.fn(), type: vi.fn().mockReturnThis(), send: vi.fn() };
 await trainingFingerprintingScreenshot(req, res, next);expect(next).not.toHaveBeenCalled();expect(res.send).toHaveBeenCalledWith(png);
 m.image.mockClear();m.members.mockResolvedValue([{ id: 9001 }]);
 await trainingFingerprintingScreenshot(req, res, next);expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));expect(m.image).not.toHaveBeenCalled();
});
it('preserves the assigned-training restriction for pending candidates', async () => {
 m.user.mockResolvedValue({ id: 9100, status: 'pending' });const next = vi.fn();
 await trainingFingerprintingScreenshot({ user: identity, params: { id: 10, screenshotId } }, {}, next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));expect(m.image).not.toHaveBeenCalled();
});
