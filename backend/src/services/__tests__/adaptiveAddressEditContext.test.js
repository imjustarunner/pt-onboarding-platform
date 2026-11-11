import { beforeEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute: query }, onTableWrite: vi.fn() }));
import { getAdaptiveAddressEditContext } from '../adaptiveIntake.service.js';
beforeEach(() => { query.mockReset(); });
it('uses the existing active agency and enabled service queries without reading people or provisioning a form', async () => {
  query.mockResolvedValueOnce([[{ id: 450, slug: 'synthetic-clinic', organization_type: 'agency' }]])
    .mockResolvedValueOnce([[{ service_type: 'counseling', display_name: 'Counseling' }, { service_type: 'tutoring', display_name: 'Tutoring' }]]);
  expect(await getAdaptiveAddressEditContext('synthetic-clinic', 'counseling')).toEqual({ agencyId: 450, serviceType: 'counseling' });
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[0][0]).toContain('AND is_active = 1');
  expect(query.mock.calls[0][1]).toEqual(['synthetic-clinic', 'synthetic-clinic']);
  expect(query.mock.calls[1][0]).toContain('is_enabled = 1');
  expect(query.mock.calls[1][1]).toEqual([450]);
  expect(query.mock.calls.map(([sql]) => sql).join(' ')).not.toMatch(/INSERT|UPDATE|users|clients|password|token/i);
});
it('rejects inactive or unknown organizations before any service lookup', async () => {
  query.mockResolvedValueOnce([[]]);
  expect(await getAdaptiveAddressEditContext('unknown-clinic', 'counseling')).toBeNull();
  expect(query).toHaveBeenCalledTimes(1);
});
it('does not substitute the only enabled service for a different requested service', async () => {
  query.mockResolvedValueOnce([[{ id: 450, organization_type: 'agency' }]])
    .mockResolvedValueOnce([[{ service_type: 'tutoring' }]]);
  expect(await getAdaptiveAddressEditContext('synthetic-clinic', 'counseling')).toBeNull();
});
it.each(['', 'disabled', 'learning', null])('rejects a missing or invalid service before querying: %s', async service => {
  expect(await getAdaptiveAddressEditContext('synthetic-clinic', service)).toBeNull();
  expect(query).not.toHaveBeenCalled();
});
it('retains the existing legacy organization service fallback used by the join page', async () => {
  query.mockResolvedValueOnce([[{ id: 450, organization_type: 'learning' }]]).mockResolvedValueOnce([[]]);
  expect(await getAdaptiveAddressEditContext('synthetic-clinic', 'tutoring')).toEqual({ agencyId: 450, serviceType: 'tutoring' });
});
