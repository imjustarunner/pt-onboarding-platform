import { expect, it, vi } from 'vitest';
import { finishClientCreation } from '../clientCreationOutcome.js';
const args = () => ({ api: { post: vi.fn().mockResolvedValue({ data: { listing: { id: 5 } } }), put: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({ data: { provider_id: 9 } }) }, clientId: 12, agencyId: 2, organizationId: 3, providerId: 9 });
it('assigns an office client without requiring a school service day and verifies the result', async () => {
  const a = args(); a.api.get.mockResolvedValueOnce({ data: { provider_id: null } });
  await finishClientCreation({ ...a, outcome: 'assign' });
  expect(a.api.put).toHaveBeenCalledWith('/clients/12/provider', { provider_id: 9 }); expect(a.api.get).toHaveBeenCalledTimes(2);
});
it('keeps a completed assignment on retry and rejects an unconfirmed assignment', async () => {
  const a = args(); await finishClientCreation({ ...a, outcome: 'assign' }); expect(a.api.put).not.toHaveBeenCalled();
  a.api.get.mockResolvedValue({ data: { provider_id: null } });
  await expect(finishClientCreation({ ...a, outcome: 'assign' })).rejects.toThrow('not confirmed');
});
it('uses the school assignment API with Unknown day and makes the provider primary', async () => {
  const a = args(); a.api.get.mockResolvedValueOnce({ data: {} });
  await finishClientCreation({ ...a, outcome: 'assign', isSchool: true });
  expect(a.api.post).toHaveBeenCalledWith('/clients/12/provider-assignments', expect.objectContaining({ service_day: 'Unknown', is_primary: true }));
});
it('saves unassigned without assignment and posts only the saved client for exchange', async () => {
  const a = args(); await finishClientCreation({ ...a, outcome: 'unassigned' }); expect(a.api.put).not.toHaveBeenCalled(); expect(a.api.post).not.toHaveBeenCalled();
  await finishClientCreation({ ...a, outcome: 'exchange' });
  expect(a.api.post).toHaveBeenCalledWith('/client-exchange/listings', { agencyId: 2, clientId: 12, quickPost: true });
});
it('persists scheduling needs for an unassigned client so one-click posting can reuse them later', async () => {
  const a = args(); const schedule = { days: ['Wednesday'], periods: ['after_school'], windows: [], timezone: 'America/Denver' };
  await finishClientCreation({ ...a, outcome: 'unassigned', schedule });
  expect(a.api.put).toHaveBeenCalledWith('/client-exchange/clients/12/schedule', { agencyId: 2, schedule });
  expect(a.api.post).not.toHaveBeenCalled();
});
