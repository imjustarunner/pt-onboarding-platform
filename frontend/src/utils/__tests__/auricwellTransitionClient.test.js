import { expect, it, vi } from 'vitest';
import { assignTransitionClient, transitionClientRows } from '../auricwellTransitionClient.js';
it('rejects incomplete or other-practice client lookup before identity decisions', () => {
  expect(() => transitionClientRows({ clients: [{ id: 1, agency_id: 3 }], total: 2 }, 3)).toThrow('incomplete');
  expect(() => transitionClientRows([{ id: 1, agency_id: 99 }], 3)).toThrow('outside');
});
it('preserves an existing primary provider while adding the transition provider to the same organization', async () => {
  const api = { post: vi.fn(async () => ({})), put: vi.fn() };
  await assignTransitionClient(api, { id: 5, agency_id: 3, organization_id: 20, provider_id: 4 }, 7);
  expect(api.put).not.toHaveBeenCalled();
  expect(api.post).toHaveBeenCalledWith('/clients/5/provider-assignments', expect.objectContaining({ organization_id: 20, provider_user_id: 7, is_primary: false }), expect.anything());
});
it('stops on archived charts and failed assignments without claiming completion', async () => {
  const api = { post: vi.fn(), put: vi.fn(async () => { throw new Error('Unavailable'); }) };
  await expect(assignTransitionClient(api, { id: 5, status: 'ARCHIVED' }, 7)).rejects.toThrow('Restore');
  await expect(assignTransitionClient(api, { id: 5, provider_id: null }, 7)).rejects.toThrow('Unavailable');
  expect(api.post).not.toHaveBeenCalled();
});
