import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), agencies: vi.fn(), access: vi.fn(), start: vi.fn(), detail: vi.fn(), catalog: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.agencies } }));
vi.mock('../../services/companyReferenceDocuments.service.js', () => ({ assertReferenceAccess: mocks.access }));
vi.mock('../../services/companyDocumentLearning.service.js', () => ({ startGuideLearning: mocks.start, guideLearningDetail: mocks.detail, guideLearningCatalog: mocks.catalog }));
import { assertLearningAssigner, start, assign, staff, portalLearning } from '../companyDocumentLearning.controller.js';
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(); mocks.agencies.mockResolvedValue([{ id: 2 }]); mocks.execute.mockResolvedValue([[]]); });
const response = () => ({ set: vi.fn(), json: vi.fn() });
describe('paid guide assignment authority', () => {
  it('permits company admins and the actual assigned supervisor', async () => {
    await assertLearningAssigner({ id: 9, role: 'admin' }, 2, 7);
    mocks.execute.mockResolvedValue([[{ id: 17 }]]); await assertLearningAssigner({ id: 9, role: 'provider', has_supervisor_privileges: 1 }, 2, 7);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('supervisor_assignments'), [9, 7, 2]);
  });
  it('rejects supervisors assigning themselves and supervisors without a relationship', async () => {
    await expect(assertLearningAssigner({ id: 7, role: 'supervisor' }, 2, 7)).rejects.toThrow('themself');
    await expect(assertLearningAssigner({ id: 9, role: 'supervisor' }, 2, 7)).rejects.toThrow('Only this employee');
  });
  it('checks both actor access and the target employee company', async () => {
    mocks.agencies.mockResolvedValue([{ id: 8 }]); await expect(assertLearningAssigner({ id: 9, role: 'admin' }, 2, 7)).rejects.toThrow('not in this company');
    mocks.access.mockRejectedValue(new Error('No company access')); await expect(assertLearningAssigner({ id: 9, role: 'admin' }, 2, 7)).rejects.toThrow('No company access');
  });
  it('passes only the authenticated identity into learner-start; learners cannot provide an assignment actor', async () => {
    const next = vi.fn(); await start({ user: { id: 7 }, query: { agencyId: 2 }, params: { key: 'provider-guide' }, body: { userId: 8, actorId: 9, purpose: 'assigned' } }, response(), next);
    expect(mocks.start).toHaveBeenCalledWith(2, 7, 'provider-guide', expect.any(Object)); expect(mocks.start.mock.calls[0]).toHaveLength(4);
  });
  it('lets People Operations inspect promotion setup without paid assignment authority', async () => {
    mocks.catalog.mockResolvedValue({ courses: [], expectedSchoolWork: true }); const res = response();
    await staff({ user: { id: 9, role: 'support' }, query: { agencyId: 2 }, params: { userId: '7' } }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canAssign: false, expectedSchoolWork: true }));
  });
  it('supervisor endpoint fixes purpose to assigned and records who assigned it', async () => {
    mocks.execute.mockResolvedValue([[{ id: 17 }]]);
    await assign({ user: { id: 9, role: 'supervisor' }, query: {}, params: { userId: '7', key: 'provider-guide' }, body: { agencyId: 2, purpose: 'practice' } }, response(), vi.fn());
    expect(mocks.start).toHaveBeenCalledWith(2, 7, 'provider-guide', expect.objectContaining({ purpose: 'assigned' }), 9);
  });
});
describe('personal onboarding token isolation', () => {
  it('derives the company and person from the token journey, ignoring spoofed body values', async () => {
    mocks.execute.mockResolvedValue([[{ id: 2 }]]); const res = response(), next = vi.fn();
    await portalLearning('start')({ portalUser: { id: 7, status: 'ONBOARDING' }, params: { key: 'school-practice-guide' }, body: { agencyId: 88, userId: 99, purpose: 'practice' } }, res, next);
    expect(mocks.start).toHaveBeenCalledWith(2, 7, 'school-practice-guide', expect.objectContaining({ purpose: 'onboarding' }));
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store'); expect(next).not.toHaveBeenCalled();
  });
  it('does not open guide training in prehire', async () => {
    const next = vi.fn(); await portalLearning('catalog')({ portalUser: { id: 7, status: 'PREHIRE_OPEN' } }, response(), next);
    expect(next.mock.calls[0][0].status).toBe(403); expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
