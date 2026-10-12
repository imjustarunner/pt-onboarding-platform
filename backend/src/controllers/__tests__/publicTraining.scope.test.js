import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/Module.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ModuleContent.model.js', () => ({ default: { findByModuleId: vi.fn() } }));
vi.mock('../../models/AgencyPublicTraining.model.js', () => ({ default: { getPublicModules: vi.fn(), getPublicTrainingFocuses: vi.fn() } }));
import User from '../../models/User.model.js';
import Module from '../../models/Module.model.js';
import Content from '../../models/ModuleContent.model.js';
import Agency from '../../models/AgencyPublicTraining.model.js';
import { publicTrainingAgency, getPublicModule } from '../publicTraining.controller.js';
beforeEach(() => { vi.clearAllMocks(); User.getAgencies.mockResolvedValue([{ id: 2 }]); });
describe('on-demand organization access', () => {
  it('honors the selected company for superadmins and checks ordinary admin membership', async () => {
    expect(await publicTrainingAgency({ user: { id: 1, role: 'super_admin' }, query: { agencyId: 2 } })).toBe(2);
    expect(await publicTrainingAgency({ user: { id: 1, role: 'admin' }, headers: { 'x-agency-id': '2' } })).toBe(2);
    await expect(publicTrainingAgency({ user: { id: 1, role: 'admin' }, query: { agencyId: 3 } })).rejects.toMatchObject({ status: 403 });
    await expect(publicTrainingAgency({ user: { id: 1, role: 'provider' }, query: { agencyId: 'invalid' } })).rejects.toMatchObject({ status: 400 });
  });
  it('opens an agency on-demand lesson without making it globally public', async () => {
    Module.findById.mockResolvedValue({ id: 10, title: 'Agency lesson', is_public: false, is_always_accessible: false });
    Agency.getPublicModules.mockResolvedValue([{ module_id: 10 }]); Content.findByModuleId.mockResolvedValue([{ content: 'lesson' }]);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
    await getPublicModule({ user: { id: 1, role: 'provider' }, query: { agencyId: 2 }, params: { id: 10 } }, res, next);
    expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 10, content: [{ content: 'lesson' }] }));
    await getPublicModule({ user: { id: 1, role: 'provider' }, query: { agencyId: 3 }, params: { id: 10 } }, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
});
