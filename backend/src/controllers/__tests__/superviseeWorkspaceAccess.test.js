import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../supervisedBilling.controller.js', () => ({ documentationScope: vi.fn() }));
vi.mock('../../services/superviseeWorkspace.service.js', () => ({ workspaceSections: new Set(['tasks']), loadSuperviseeWorkspace: vi.fn() }));
import { documentationScope } from '../supervisedBilling.controller.js';
import { loadSuperviseeWorkspace } from '../../services/superviseeWorkspace.service.js';
import { getSuperviseeWorkspace } from '../superviseeWorkspace.controller.js';
describe('supervision workspace authorization', () => {
  beforeEach(() => vi.clearAllMocks());
  const response = () => { const res = { set: vi.fn(), json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; };
  it('fails closed on access denial before reading any workspace data', async () => {
    const denial = Object.assign(new Error('Assigned supervisor access required'), { status: 403 });
    documentationScope.mockRejectedValue(denial);
    const next = vi.fn();
    await getSuperviseeWorkspace({ query: { section: 'tasks', agencyId: '451' }, user: { id: 7 } }, response(), next);
    expect(next).toHaveBeenCalledWith(denial);
    expect(loadSuperviseeWorkspace).not.toHaveBeenCalled();
  });
  it('uses only the validated agency and provider scope', async () => {
    const scope = { agencyId: 450, providerUserId: 81 };
    documentationScope.mockResolvedValue(scope); loadSuperviseeWorkspace.mockResolvedValue({ items: [] });
    const res = response();
    await getSuperviseeWorkspace({ query: { section: 'tasks' }, user: { id: 7 } }, res, vi.fn());
    expect(loadSuperviseeWorkspace).toHaveBeenCalledWith(scope, 'tasks', { viewerId: 7 });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
