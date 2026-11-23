import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), chart: vi.fn(), audit: vi.fn(), releases: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.chart }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: mocks.audit }));
vi.mock('../../services/safetyPlans/records.js', () => ({ listReleaseRelationships: mocks.releases }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: async () => [] } }));
vi.mock('../../services/appointmentFamilyRecipients.service.js', () => ({
  appointmentFamilyRecipients: async () => ({ hasRelationships: true, recipients: [] })
}));
vi.mock('../../services/sessionNotification.service.js', () => ({
  getTenantSettings: async () => ({ channelsEnabled: {}, platform: {} }),
  getClientPreferences: vi.fn(), loadClientConsent: vi.fn(), resolveEffectiveChannels: () => ({})
}));

import { changeClientSibling, listClientRelationships } from '../clientRelationships.controller.js';

const charts = new Map([
  [10, { id: 10, agency_id: 4, full_name: 'Client One' }],
  [20, { id: 20, agency_id: 4, full_name: 'Client Two' }],
  [30, { id: 30, agency_id: 4, full_name: 'Sibling client', initials: 'SC', provider_name: 'Assigned Provider', email: 'private@example.invalid' }],
  [40, { id: 40, agency_id: 8, full_name: 'Other agency client' }]
]);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.chart.mockImplementation(async ({ clientId }) => clientId === 30
    ? { ok: false, status: 403, client: charts.get(clientId) }
    : { ok: true, client: charts.get(clientId) });
  mocks.releases.mockResolvedValue([]);
});

function request(overrides = {}) {
  return {
    method:'GET', params:{ id:'10' }, query:{},
    user:{ id:9, role:'provider', scopedAgencyId:4 }, ...overrides
  };
}
function response() {
  const res = { status: vi.fn(), set: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.set.mockReturnValue(res);
  return res;
}

it('checks each candidate chart before returning names from a household match', async () => {
  mocks.execute.mockResolvedValue([[{ id:20, reason:'Shared guardian account' }, { id:30 }, { id:40 }]]);
  const req = request({ query:{ search:'' } });
  const res = response();
  const next = vi.fn();
  await listClientRelationships(req, res, next);
  expect(res.json).toHaveBeenCalledWith({ candidates: [
    { id:20, name:'Client Two', initials:null, code:null, providerName:null, reason:'Shared guardian account' }
  ] });
  expect(next).not.toHaveBeenCalled();
});

it('keeps sibling links reciprocal and rejects unauthorized or cross-agency links', async () => {
  mocks.execute.mockResolvedValue([{ affectedRows:1 }]);
  const denied = response();
  await changeClientSibling(request({ method:'PUT', params:{ id:'10', peerId:'30' } }), denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(404);
  await changeClientSibling(request({ method:'PUT', params:{ id:'10', peerId:'40' } }), denied, vi.fn());
  expect(denied.status).toHaveBeenCalledTimes(2);
  expect(mocks.execute).not.toHaveBeenCalled();
  const allowed = response();
  await changeClientSibling(request({ method:'PUT', params:{ id:'20', peerId:'10' } }), allowed, vi.fn());
  expect(allowed.status).toHaveBeenCalledWith(204);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_sibling_links'), [9,4,10,20]);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ user:{ id:9, role:'provider', scopedAgencyId:4 } }),
    expect.objectContaining({ actionType:'client_sibling_linked', targetId:20, metadata:{ relatedClientId:10 } }));
});

it('keeps authorized links visible when the chart reader lacks clinical release permissions', async () => {
  mocks.execute.mockResolvedValue([[{ id:20 }, { id:30 }]]);
  mocks.releases.mockRejectedValue(Object.assign(new Error('Release access denied'), { status:403 }));
  const res = response();
  await listClientRelationships(request(), res, vi.fn());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    siblings:[expect.objectContaining({ id:20 })], restrictedSiblings:[expect.objectContaining({ name:'Sibling client' })], releases:null, releasesUnavailable:false
  }));
});


it('shows existing shared guardian charts without creating or granting a sibling link', async () => {
  mocks.execute.mockImplementation(async sql => sql.includes("HAVING reason = 'Shared guardian account'")
    ? [[{ id:20, reason:'Shared guardian account' }, { id:30 }, { id:40 }]]
    : [[]]);
  const res = response();
  await listClientRelationships(request(), res, vi.fn());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    siblings: [], restrictedSiblings:[],
    sharedGuardianClients:[expect.objectContaining({ id:20, reason:'Shared guardian account' })],
    hasRestrictedSharedGuardianClients:true
  }));
  expect(mocks.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});


it('returns only the restricted sibling name and provider and omits a peer that changed agency', async () => {
  mocks.execute.mockImplementation(async sql => sql.includes('SELECT peer.id') ? [[{ id:30 }, { id:40 }]] : [[]]);
  const res = response();
  await listClientRelationships(request(), res, vi.fn());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    siblings:[], restrictedSiblings:[{ name:'Sibling client', initials:'SC', providerName:'Assigned Provider' }]
  }));
  expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/private@example.invalid|Other agency client|"id":(?:30|40)/);
});
