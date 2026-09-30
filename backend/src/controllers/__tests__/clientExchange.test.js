import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), access: vi.fn(), create: vi.fn(), recordAccess: vi.fn(), summary: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: mocks.client } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ providerHasAssignedClientAccess: mocks.access, resolveClientRecordAccess: mocks.recordAccess }));
vi.mock('../../services/clientExchangeSummary.service.js', () => ({ loadClientExchangeSummary: mocks.summary }));
vi.mock('../../services/clientExchange.service.js', () => ({ createListing: mocks.create }));
import { createListing, previewClientSummary } from '../clientExchange.controller.js';
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
const request = () => ({ user: { id: 7, role: 'provider', agencies: [{ id: 2 }] }, body: { agencyId: 2, clientId: 4, currentProviderUserId: 999 } });
beforeEach(() => { vi.clearAllMocks(); mocks.client.mockResolvedValue({ id: 4, agency_id: 2, provider_id: 7, status: 'CURRENT' }); mocks.access.mockResolvedValue(true); mocks.create.mockResolvedValue({ id: 12 }); });
it('permits assigned providers and trusts the actual client assignment', async () => {
  const res = response(); await createListing(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(201); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ currentProviderUserId: 7 }));
});
it('rejects unassigned providers and cross-agency clients', async () => {
  mocks.access.mockResolvedValue(false); const res = response(); await createListing(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(mocks.create).not.toHaveBeenCalled();
  mocks.client.mockResolvedValue({ agency_id: 3 }); const other = response(); await createListing(request(), other, vi.fn()); expect(other.status).toHaveBeenCalledWith(400);
});
it('allows backoffice to post unassigned clients but rejects archived clients', async () => {
  const req = request(); req.user.role = 'support'; mocks.client.mockResolvedValue({ agency_id: 2, provider_id: null, status: 'PENDING_REVIEW' });
  const res = response(); await createListing(req, res, vi.fn()); expect(res.status).toHaveBeenCalledWith(201);
  mocks.client.mockResolvedValue({ agency_id: 2, status: 'ARCHIVED' }); const archived = response(); await createListing(req, archived, vi.fn()); expect(archived.status).toHaveBeenCalledWith(400);
});

it('allows an actively assigned secondary provider without changing the current provider', async () => {
  mocks.client.mockResolvedValue({ id: 4, agency_id: 2, provider_id: 9, status: 'CURRENT' });
  const res = response(); await createListing(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ currentProviderUserId: 9 }));
});

it('protects the chart summary with record access and agency checks', async () => {
  const req = { user: { id: 7, role: 'provider' }, params: { clientId: 4 }, query: { agencyId: 2 } };
  mocks.recordAccess.mockResolvedValue({ ok: false, status: 403, message: 'Assigned provider access required' });
  const denied = response(); await previewClientSummary(req, denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(403); expect(mocks.summary).not.toHaveBeenCalled();
  mocks.recordAccess.mockResolvedValue({ ok: true }); mocks.summary.mockResolvedValue({ diagnoses: ['F41.1'], presentingProblems: ['Concern'] });
  const allowed = response(); await previewClientSummary(req, allowed, vi.fn());
  expect(allowed.json).toHaveBeenCalledWith({ summary: { diagnoses: ['F41.1'], presentingProblems: ['Concern'] } });
  req.query.agencyId = 3; const otherAgency = response(); await previewClientSummary(req, otherAgency, vi.fn());
  expect(otherAgency.status).toHaveBeenCalledWith(404);
});
