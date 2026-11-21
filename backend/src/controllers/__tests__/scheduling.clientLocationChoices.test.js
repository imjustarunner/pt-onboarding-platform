import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { listUserVirtualSessionClients } from '../user.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM clients c')) return [[{ id: 8, client_type: 'school', full_name: 'Assigned client' }]];
    if (sql.includes('FROM client_organization_assignments')) return [[{ client_id: 8, school_organization_id: 30, school_name: 'Assigned school', is_primary: 1 }]];
    throw new Error('Unexpected query');
  });
});

it.each(['provider', 'admin', 'support'])('uses assigned clients and their school defaults for a %s scheduler', async role => {
  const req = { user: { id: 7, role }, params: { id: '7' }, query: { agencyId: '2' } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await listUserVirtualSessionClients(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ clients: [expect.objectContaining({ id: 8, clientType: 'school', schools: [{ schoolOrganizationId: 30, name: 'Assigned school', isPrimary: true }] })] }));
  const [query, values] = pool.execute.mock.calls.find(([sql]) => sql.includes('FROM clients c'));
  expect(values).toEqual([2, 2, 7, 7]);
  expect(query).toContain('cpa.is_active = TRUE');
  expect(query).toContain('caa.is_active = TRUE');
});

it('fails closed if assignment storage is unavailable', async () => {
  pool.execute.mockRejectedValue(new Error('Assignment storage unavailable'));
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await listUserVirtualSessionClients({ user: { id: 7, role: 'admin' }, params: { id: '7' }, query: { agencyId: '2' } }, res, next);
  expect(res.json).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Assignment storage unavailable' }));
});
