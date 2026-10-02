import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useDashboardRailOrder } from '../useDashboardRailOrder';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const cards = (...ids) => ids.map((id) => ({ id }));
const ids = (rows) => rows.map((row) => row.id);
const create = (user = ref(7)) => {
  const scope = effectScope();
  const prefs = scope.run(() => useDashboardRailOrder(user));
  return { prefs, scope, user };
};
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  api.get.mockResolvedValue({ data: {} }); api.put.mockResolvedValue({ data: {} });
});

describe('personal dashboard section order', () => {
  it('moves visible sections, saves to the current account, and restores on another mount', async () => {
    const { prefs, scope } = create(); await flushPromises();
    const rows = cards('overview', 'my', 'tools_nest');
    prefs.start(); prefs.move('tools_nest', -1, rows);
    expect(ids(prefs.applyOrder(rows))).toEqual(['overview', 'tools_nest', 'my']);
    await prefs.save();
    expect(api.put).toHaveBeenCalledWith('/users/7/preferences', { dashboard_rail_order_json: ['overview', 'tools_nest', 'my'] }, { skipGlobalLoading: true });
    expect(prefs.editing.value).toBe(false);
    scope.stop();
    api.get.mockResolvedValue({ data: { dashboard_rail_order_json: '["overview","tools_nest","my"]' } });
    const next = create(); await flushPromises();
    expect(ids(next.prefs.applyOrder(rows))).toEqual(['overview', 'tools_nest', 'my']);
    next.scope.stop();
  });

  it('keeps unavailable sections saved and nested children inside their own group', async () => {
    api.get.mockResolvedValue({ data: { dashboard_rail_order_json: ['overview', 'hidden', 'tools_nest', 'library', 'docs'] } });
    const { prefs, scope } = create(); await flushPromises(); prefs.start();
    prefs.move('docs', -1, cards('library', 'docs'));
    expect(ids(prefs.applyOrder(cards('overview', 'tools_nest')))).toEqual(['overview', 'tools_nest']);
    expect(ids(prefs.applyOrder(cards('library', 'docs')))).toEqual(['docs', 'library']);
    await prefs.save();
    expect(api.put.mock.calls[0][1].dashboard_rail_order_json).toContain('hidden');
    scope.stop();
  });

  it('cancels changes and resets to the default visible order', async () => {
    api.get.mockResolvedValue({ data: { dashboard_rail_order_json: ['my', 'overview'] } });
    const { prefs, scope } = create(); await flushPromises(); prefs.start(); prefs.reset();
    expect(ids(prefs.applyOrder(cards('overview', 'my')))).toEqual(['overview', 'my']);
    prefs.cancel();
    expect(ids(prefs.applyOrder(cards('overview', 'my')))).toEqual(['my', 'overview']);
    expect(api.put).not.toHaveBeenCalled(); scope.stop();
  });

  it('keeps edits and shows an error when saving fails', async () => {
    api.put.mockRejectedValue(new Error('offline'));
    const { prefs, scope } = create(); await flushPromises(); prefs.start();
    prefs.move('my', -1, cards('overview', 'my')); await prefs.save();
    expect(prefs.editing.value).toBe(true); expect(prefs.error.value).toContain('Could not save');
    expect(localStorage.getItem('dashboard.railOrder.v1:7')).toBeNull(); scope.stop();
  });

  it('ignores a previous account’s slow preferences response', async () => {
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { prefs, scope, user } = create();
    user.value = 8; await flushPromises();
    resolveOld({ data: { dashboard_rail_order_json: ['my', 'overview'] } }); await flushPromises();
    expect(ids(prefs.applyOrder(cards('overview', 'my')))).toEqual(['overview', 'my']); scope.stop();
  });
});
