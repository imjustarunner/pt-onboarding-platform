import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Module.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ModuleContent.model.js', () => ({ default: { findByModuleId: vi.fn() } }));
vi.mock('../../models/QuizAttempt.model.js', () => ({ default: { findByUserAndModule: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/AgencyPublicTraining.model.js', () => ({ default: { getModuleAssignment: vi.fn() } }));
vi.mock('../auth.middleware.js', () => ({
  authenticate: (req, res, next) => { req.user = { id: 1434, role: 'support' }; next(); },
  requireCapability: () => (req, res, next) => next()
}));
vi.mock('../../controllers/progress.controller.js', () => ({
  getUserProgress: vi.fn((req, res) => res.json([])),
  startModule: vi.fn((req, res) => res.json({ status: 'in_progress' })),
  completeModule: vi.fn((req, res) => res.json({ status: 'completed' })),
  logTime: vi.fn((req, res) => res.json({ logged: true }))
}));
import Module from '../../models/Module.model.js';
import Content from '../../models/ModuleContent.model.js';
import Attempts from '../../models/QuizAttempt.model.js';
import User from '../../models/User.model.js';
import Shared from '../../models/AgencyPublicTraining.model.js';
import { completeModule, startModule, logTime } from '../../controllers/progress.controller.js';
import routes from '../../routes/progress.routes.js';
const request = () => ({ post: path => ({ send: body => new Promise(resolve => {
  const req = { method: 'POST', url: path, path, body, headers: {}, params: {}, query: {} };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { resolve({ status: this.statusCode, body: data }); return this; } };
  routes.handle(req, res, error => resolve({ status: error ? 500 : 404 }));
}) }) });
beforeEach(() => {
  vi.clearAllMocks();
  Module.findById.mockResolvedValue({ id: 32, agency_id: 450, is_active: 1, publish_status: 'published' });
  User.getAgencies.mockResolvedValue([{ id: 450 }]); Shared.getModuleAssignment.mockResolvedValue(null);
  Content.findByModuleId.mockResolvedValue([{ content_type: 'quiz', content_data: { questions: [{}], minimumScore: 100 } }]);
  Attempts.findByUserAndModule.mockResolvedValue([]);
});
it.each(['/start', '/complete', '/time'])('denies progress writes for an outside tenant at %s', async path => {
  Module.findById.mockResolvedValue({ id: 99, agency_id: 2, is_active: 1, publish_status: 'published' });
  expect((await request().post(path).send({ moduleId: 99 })).status).toBe(403);
  expect(startModule).not.toHaveBeenCalled(); expect(completeModule).not.toHaveBeenCalled(); expect(logTime).not.toHaveBeenCalled();
});
it.each([{ attempts: [] }, { attempts: [{ score: '0.00' }] }, { attempts: [{ score: '99.00' }] }])('does not complete tasks without a saved passing score: %j', async ({ attempts }) => {
  Attempts.findByUserAndModule.mockResolvedValue(attempts);
  const res = await request().post('/complete').send({ moduleId: 32, score: 100, passed: true });
  expect(res.status).toBe(400); expect(completeModule).not.toHaveBeenCalled();
  expect(Attempts.findByUserAndModule).toHaveBeenCalledWith(1434, 32);
});
it('allows a persisted passing retry and lessons without quizzes', async () => {
  Attempts.findByUserAndModule.mockResolvedValue([{ score: '100.00' }, { score: '0.00' }]);
  expect((await request().post('/complete').send({ moduleId: 32 })).status).toBe(200);
  Content.findByModuleId.mockResolvedValue([{ content_type: 'text' }]);
  expect((await request().post('/complete').send({ moduleId: 32 })).status).toBe(200);
});
it('fails closed on database failure and invalid quiz configuration', async () => {
  Attempts.findByUserAndModule.mockRejectedValue(new Error('unavailable'));
  expect((await request().post('/complete').send({ moduleId: 32 })).status).toBe(500);
  Content.findByModuleId.mockResolvedValue([{ content_type: 'quiz', content_data: { questions: [{}], minimumScore: 'invalid' } }]);
  expect((await request().post('/complete').send({ moduleId: 32 })).status).toBe(409);
  expect(completeModule).not.toHaveBeenCalled();
});
