import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(), isSupervisor: () => false } }));
vi.mock('../officeClientManagement.service.js', () => ({ listHubProviders: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import * as OfficeClients from '../officeClientManagement.service.js';
import { listOfficeHubProviders } from '../../controllers/officeClientManagement.controller.js';

const req = { user: { id: 9, role: 'support', agencies: [{ id: 2 }, { id: 6 }, { id: 99 }] },
  query: { agencyIds: '2,6,99', clientId: '4' } };
let res;
beforeEach(() => {
  vi.clearAllMocks();
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  User.findById.mockResolvedValue({ id: 9 });
  OfficeClients.listHubProviders.mockResolvedValue([]);
  pool.execute.mockImplementation(async sql => sql.includes('SELECT agency_id FROM clients')
    ? [[{ agency_id: 2 }]] : [[{ agency_id: 6 }]]);
});

it('intersects staff’s requested agencies with the selected client’s agencies', async () => {
  await listOfficeHubProviders(req, res, vi.fn());
  expect(OfficeClients.listHubProviders).toHaveBeenCalledWith({ agencyIds: [2, 6] });
});

it('does not disclose providers for an unrelated client agency', async () => {
  await listOfficeHubProviders({ ...req, query: { agencyIds: '99', clientId: '4' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(OfficeClients.listHubProviders).not.toHaveBeenCalled();
});

it('returns a missing client response without loading a global provider catalog', async () => {
  pool.execute.mockResolvedValue([[]]);
  await listOfficeHubProviders(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(404);
  expect(OfficeClients.listHubProviders).not.toHaveBeenCalled();
});
