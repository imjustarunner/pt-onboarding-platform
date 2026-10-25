import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), access: vi.fn(), create: vi.fn(), recordAccess: vi.fn(), summary: vi.fn(), execute: vi.fn(), referral: vi.fn(), audit: vi.fn(), view: vi.fn(), listing:vi.fn(), requests:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: mocks.client } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ providerHasAssignedClientAccess: mocks.access, resolveClientRecordAccess: mocks.recordAccess }));
vi.mock('../../services/clientExchangeSummary.service.js', () => ({ loadClientExchangeSummary: mocks.summary }));
vi.mock('../../services/clientExchange.service.js', () => ({ createListing: mocks.create, getListingById:mocks.listing, listRequestsForListing:mocks.requests }));
vi.mock('../../services/clientExchangeReferral.service.js', () => ({ createExchangeReferral: mocks.referral }));
vi.mock('../../services/clientExchangeAudit.service.js',()=>({getExchangeAudit:mocks.audit,recordExchangeView:mocks.view}));
import { getListingAudit, getListing, createReferral, createListing, previewClientSummary, saveClientSchedule, saveClientMatchingPreferences } from '../clientExchange.controller.js';
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
const request = () => ({ user: { id: 7, role: 'provider', agencies: [{ id: 2 }] }, body: { agencyId: 2, clientId: 4, currentProviderUserId: 999 } });
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue([[{authorized:1}]]); mocks.view.mockResolvedValue(undefined); mocks.client.mockResolvedValue({ id: 4, agency_id: 2, provider_id: 7, status: 'CURRENT' }); mocks.access.mockResolvedValue(true); mocks.create.mockResolvedValue({ id: 12 }); });
it('permits assigned providers and trusts the actual client assignment', async () => {
  const res = response(); await createListing(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(201); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ currentProviderUserId: 7 }));
});
it('rejects a revoked membership even when the cached principal still names the agency',async()=>{
  mocks.execute.mockResolvedValueOnce([[]]);const res=response();await createListing(request(),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls[0][0]).toContain('ua.is_active=1');
});
it('support preview omits clinical source excerpts but keeps scheduling preferences',async()=>{
  mocks.recordAccess.mockResolvedValue({ok:true});mocks.summary.mockResolvedValue({presentingProblems:['private progress note'],diagnoses:['private diagnosis'],preferences:{insurance:'Example plan',schedule:{days:['Monday']}}});
  const res=response();await previewClientSummary({user:{id:1434,role:'support'},params:{clientId:4},query:{agencyId:2}},res,vi.fn());
  expect(res.json.mock.calls[0][0].summary.preferences.insurance).toBe('Example plan');expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('private');
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

it('restricts one-click posting to staff and forwards the unassigned requirement', async () => {
  const req = request(); req.body.quickPost = true;
  const denied = response(); await createListing(req, denied, vi.fn()); expect(denied.status).toHaveBeenCalledWith(403);
  req.user.role = 'support'; const allowed = response(); await createListing(req, allowed, vi.fn());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ onlyUnassigned: true }));
});
it('saves schedule preferences only for agency staff or an assigned provider in the client agency', async () => {
  const req = request(); req.params = { clientId: 4 }; req.body.schedule = { days: ['Monday'], periods: ['after_school'] };
  const res = response(); await saveClientSchedule(req, res, vi.fn());
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('JSON_SET'), [expect.stringContaining('after_school'), 4, 2]);
  mocks.execute.mockClear(); mocks.access.mockResolvedValue(false);
  const denied = response(); await saveClientSchedule(req, denied, vi.fn()); expect(denied.status).toHaveBeenCalledWith(403); expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
  req.user.role = 'support'; mocks.client.mockResolvedValue({ agency_id: 3 });
  const other = response(); await saveClientSchedule(req, other, vi.fn()); expect(other.status).toHaveBeenCalledWith(404); expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
});
it('rejects invalid scheduling preferences without writing client data', async () => {
  const req = request(); req.params = { clientId: 4 }; req.body.schedule = { windows: [{ start: '17:00', end: '15:00' }], timezone: 'America/Denver' };
  const res = response(); await saveClientSchedule(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400); expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
});
it('allows an agency provider to create an EHR referral but rejects nonclinical roles', async () => {
  const req = request(); mocks.referral.mockResolvedValue({ clientId: 15, taskId: 30 });
  const res = response(); await createReferral(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(201); expect(mocks.referral).toHaveBeenCalledWith({ agencyId: 2, actor: req.user, input: req.body });
  mocks.referral.mockClear(); req.user.role = 'school_staff';
  const denied = response(); await createReferral(req, denied, vi.fn()); expect(denied.status).toHaveBeenCalledWith(403); expect(mocks.referral).not.toHaveBeenCalled();
});
it('saves validated fit selections only for assigned providers or agency staff',async()=>{
 const req=request();req.params={clientId:4};req.body.matchingPreferences={specialties:['Depression','Mood Disorders','Anxiety','Stress'],populations:['Veterans']};
 const res=response();await saveClientMatchingPreferences(req,res,vi.fn());expect(res.json).toHaveBeenCalledWith({matchingPreferences:expect.objectContaining(req.body.matchingPreferences)});expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'$.matchingPreferences'"),[expect.any(String),4,2]);
 mocks.execute.mockClear();mocks.access.mockResolvedValue(false);const denied=response();await saveClientMatchingPreferences(req,denied,vi.fn());expect(denied.status).toHaveBeenCalledWith(403);expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
 req.user.role='support';mocks.client.mockResolvedValue({agency_id:3});const other=response();await saveClientMatchingPreferences(req,other,vi.fn());expect(other.status).toHaveBeenCalledWith(404);expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
});
it('rejects invalid fit preferences without changing the client record',async()=>{
 const req=request();req.params={clientId:4};req.body.matchingPreferences={specialties:['invented']};const res=response();await saveClientMatchingPreferences(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(400);expect(mocks.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql))).toBe(false);
});

it('restricts provider delivery audit to support/admin within the listing agency',async()=>{
 const req=request();req.params={id:9};const denied=response();await getListingAudit(req,denied,vi.fn());expect(denied.status).toHaveBeenCalledWith(403);expect(mocks.audit).not.toHaveBeenCalled();
 req.user.role='support';mocks.execute.mockResolvedValueOnce([[{agency_id:3}]]).mockResolvedValueOnce([[]]);const cross=response();await getListingAudit(req,cross,vi.fn());expect(cross.status).toHaveBeenCalledWith(403);expect(mocks.audit).not.toHaveBeenCalled();
 mocks.execute.mockResolvedValueOnce([[{agency_id:2}]]);mocks.audit.mockResolvedValue({listingId:9,providers:[]});const allowed=response();await getListingAudit(req,allowed,vi.fn());expect(allowed.json).toHaveBeenCalledWith({listingId:9,providers:[]});
});
it('records detail views only after listing visibility and agency access are verified',async()=>{
 const req=request();req.params={id:9};mocks.listing.mockResolvedValue(null);await getListing(req,response(),vi.fn());expect(mocks.view).not.toHaveBeenCalled();
 mocks.listing.mockResolvedValue({id:9,agencyId:3});mocks.execute.mockResolvedValue([[]]);await getListing(req,response(),vi.fn());expect(mocks.view).not.toHaveBeenCalled();
 mocks.listing.mockResolvedValue({id:9,agencyId:2});mocks.execute.mockResolvedValue([[{authorized:1}]]);mocks.requests.mockResolvedValue([]);await getListing(req,response(),vi.fn());expect(mocks.view).toHaveBeenCalledWith({listingId:9,userId:7});
});
