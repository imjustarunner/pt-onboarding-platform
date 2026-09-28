import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), agencies: vi.fn(), access: vi.fn(), lookup: vi.fn(), entries: vi.fn(), audit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.agencies } }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: (_req, _res, next) => next() }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.access }));
vi.mock('../clientAccessLog.service.js', () => ({ logClientAccess: mocks.audit }));
vi.mock('../referralBusinessLookup.service.js', () => ({ lookupReferralBusiness: mocks.lookup }));
vi.mock('../faxIntake.service.js', () => ({ saveFaxDraft: vi.fn(), assertReferralEntry: vi.fn() }));
vi.mock('../../models/ReferralDirectoryEntry.model.js', () => ({ default: { listForAgency: mocks.entries } }));
import { requireReferralAgency } from '../../routes/faxIntake.routes.js';
import router from '../../routes/clientReferralLinks.routes.js';
import { requestLoggingMiddleware } from '../../middleware/requestLogging.middleware.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), sendStatus: vi.fn() });
const route = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack;
beforeEach(() => { vi.resetAllMocks(); mocks.agencies.mockResolvedValue([{ id: 3 }]); mocks.audit.mockResolvedValue(); });
it('denies school/guardian roles even when they belong to an agency', async () => {
  const res = response(), next = vi.fn();
  await requireReferralAgency({ user: { id: 1, role: 'client_guardian' }, query: { agencyId: 3 } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
it('checks membership for a requested agency', async () => {
  const res = response(), next = vi.fn();
  await requireReferralAgency({ user: { id: 1, role: 'admin' }, query: { agencyId: 8 } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
it('checks assigned-client access before listing historical referral documents', async () => {
  mocks.access.mockResolvedValue({ ok: false }); const res = response(), next = vi.fn();
  await route('/clients/:clientId', 'get')[0].handle({ user: { id: 1, role: 'provider' }, params: { clientId: 11 }, referralAgencyId: 3 }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(mocks.execute).not.toHaveBeenCalled();
});
it('rejects attaching a different client’s historical document', async () => {
  mocks.execute.mockResolvedValue([[]]); const res = response();
  await route('/clients/:clientId', 'post').at(-1).handle({ user: { id: 1 }, params: { clientId: 11 }, referralAgencyId: 3,
    body: { entryId: 2, direction: 'incoming', documentId: 99 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('client_id = ? AND agency_id = ?'), [99, 11, 3]);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
});
it('allows linking an existing historical document without reading or uploading it', async () => {
  mocks.execute.mockResolvedValue([[{ id: 99 }]]); const res = response();
  await route('/clients/:clientId', 'post').at(-1).handle({ user: { id: 1 }, params: { clientId: 11 }, referralAgencyId: 3,
    body: { entryId: 2, direction: 'incoming', documentId: 99, referralDate: '2022-04-15' } }, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mocks.execute.mock.calls[1][1]).toEqual([3,11,2,'incoming','2022-04-15',99,1]);
});
it('public lookup receives only explicitly entered business fields, never fax data', async () => {
  mocks.lookup.mockResolvedValue({ candidates: [] });
  await route('/business-lookup', 'post').at(-1).handle({ body: { name: 'Example Practice', location: 'Example, CO', faxText: 'private', patientName: 'private', dateOfBirth: 'private' } }, response());
  expect(mocks.lookup).toHaveBeenCalledWith({ name: 'Example Practice', location: 'Example, CO' });
});
it('directory reverse links exclude inaccessible clients', async () => {
  mocks.execute.mockResolvedValue([[{ id: 1, client_id: 11 }, { id: 2, client_id: 12 }]]);
  mocks.access.mockImplementation(async ({ clientId }) => ({ ok: clientId === 11 }));
  const res = response();
  await route('/entries/:entryId/clients', 'get').at(-1).handle({ referralAgencyId: 3, params: { entryId: 2 }, user: { id: 1, role: 'provider' } }, res);
  expect(res.json).toHaveBeenCalledWith({ links: [{ id: 1, client_id: 11 }] });
});
it('does not log fax mappings through development request logging', () => {
  const logger = vi.spyOn(console, 'log').mockImplementation(() => {});
  const req = { path: '/api/clients', method: 'POST', body: { full_name: 'Sam Sample', faxIntake: { fields: { guardian_phone: '7195550100' } } } };
  const next = vi.fn(); requestLoggingMiddleware(req, response(), next);
  expect(req.sanitizedBody).toBe('[PRIVATE FAX / REFERRAL REQUEST]');
  expect(logger).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
});
