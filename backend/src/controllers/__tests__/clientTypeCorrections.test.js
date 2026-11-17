import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ client: vi.fn(), update: vi.fn(), history: vi.fn(), access: vi.fn(), organizations: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), query: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: m.client, update: m.update } }));
vi.mock('../../models/ClientStatusHistory.model.js', () => ({ default: { create: m.history } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn().mockResolvedValue({ feature_flags: { portalVariant: 'employee' } }) } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { listActiveOrganizationsForAgency: m.organizations } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: m.access, providerHasAssignedClientAccess: vi.fn() }));
import { graduateClientType } from '../client.controller.js';
const client = { id: 7, agency_id: 2, client_type: 'clinical' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (role, type = 'school') => ({ params: { id: '7' }, user: { id: 4, role }, body: { client_type: type } });
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ ok: true, client });
  m.organizations.mockResolvedValue([{ organization_type: 'school' }, { organization_type: 'learning' }]);
  m.update.mockResolvedValue({ ...client, client_type: 'school' });
});
it.each(['admin', 'support', 'super_admin'])('lets %s correct Clinical to School with attributed history', async role => {
  const res = response(), next = vi.fn();
  await graduateClientType(request(role), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.update).toHaveBeenCalledWith(7, expect.objectContaining({ client_type: 'school', client_type_transitioned_by_user_id: 4 }), 4);
  expect(m.history).toHaveBeenCalledWith(expect.objectContaining({ changed_by_user_id: 4, from_value: 'clinical', to_value: 'school', note: 'Changed client type from clinical to school' }));
  expect(res.json).toHaveBeenCalled();
});
it.each(['provider', 'school_staff', 'client_guardian'])('denies %s before resolving client access', async role => {
  const res = response();
  await graduateClientType(request(role), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.access).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
});
it('preserves agency boundaries for support', async () => {
  m.access.mockResolvedValue({ ok: false, status: 403, message: 'Access denied' });
  const res = response();
  await graduateClientType(request('support'), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.history).not.toHaveBeenCalled();
});
it('retains enabled-type restrictions and the staff progression rule', async () => {
  const staffResponse = response();
  await graduateClientType(request('staff'), staffResponse, vi.fn());
  expect(staffResponse.status).toHaveBeenCalledWith(400);
  m.organizations.mockResolvedValue([{ organization_type: 'clinical' }]);
  const adminResponse = response();
  await graduateClientType(request('admin'), adminResponse, vi.fn());
  expect(adminResponse.status).toHaveBeenCalledWith(400);
  expect(m.update).not.toHaveBeenCalled();
});
