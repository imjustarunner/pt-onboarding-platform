import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), create: vi.fn(), update: vi.fn(), history: vi.fn(), access: vi.fn()
}));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { create: mocks.create, update: mocks.update } }));
vi.mock('../../models/ClientStatusHistory.model.js', () => ({ default: { create: mocks.history } }));
vi.mock('../../models/Agency.model.js', () => ({ default: {
  findById: vi.fn(async id => ({ id, organization_type: Number(id) === 2 ? 'agency' : 'clinical' }))
} }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: {
  listActiveOrganizationsForAgency: vi.fn(async () => [{ id: 20, organization_type: 'clinical' }])
} }));
vi.mock('../../models/User.model.js', () => ({ default: {
  findById: vi.fn(async () => ({ id: 7 })), getAgencies: vi.fn(async () => [{ id: 2 }])
} }));
vi.mock('../../services/clientAccessLog.service.js', () => ({ logClientAccess: mocks.access }));
vi.mock('../../services/officeBillingSites.service.js', () => ({ setClientDefaultFromSchool: vi.fn(async () => {}) }));
import { createClient } from '../client.controller.js';

let candidates, lookupError;
const request = (body = {}) => ({
  user: { id: 1, role: 'super_admin' },
  body: { agency_id: 2, organization_id: 20, provider_id: 7, full_name: 'Ann Example',
    initials: 'AnnExa', submission_date: '2026-11-10', client_type: 'clinical',
    source: 'EHR_PATIENT_LIST', ...body }
});
async function run(body) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await createClient(request(body), res, next);
  return { res, next };
}
const guardedLookup = sql => sql.includes("UPPER(REPLACE(COALESCE(initials, ''), ' ', ''))") && !sql.includes("<> 'ARCHIVED'");
const writes = () => mocks.execute.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));

beforeEach(() => {
  vi.clearAllMocks();
  candidates = [];
  lookupError = null;
  mocks.create.mockResolvedValue({ id: 55, agency_id: 2 });
  mocks.history.mockResolvedValue({ id: 56 });
  mocks.update.mockResolvedValue({ id: 42 });
  mocks.access.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async sql => {
    if (guardedLookup(sql)) {
      if (lookupError) throw lookupError;
      return [candidates];
    }
    if (sql.includes('SELECT *') && sql.includes("COALESCE(initials, '')")) return [candidates];
    return [[]];
  });
});

it.each([
  { rows: [{ id: 42, full_name: 'Alex Example', date_of_birth: '2000-01-02' }] },
  { rows: [{ id: 42, full_name: 'Ann Example', date_of_birth: '1999-01-02' }] },
  { rows: [{ id: 42, full_name: 'Ann Example', date_of_birth: null }] },
  { rows: [{ id: 42, full_name: 'Ann Example', date_of_birth: '2000-01-02', status: 'ARCHIVED' }] },
  { rows: [{ id: 42 }, { id: 43 }] }
])('rejects existing initials candidates before creating or assigning a chart (%j)', async ({ rows }) => {
  candidates = rows;
  const { res, next } = await run();
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'EHR_CLIENT_MATCH_REVIEW_REQUIRED' }) });
  expect(mocks.execute.mock.calls.find(([sql]) => guardedLookup(sql))[1]).toEqual([2, 'ANNEXA']);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.history).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});

it('cannot bypass EHR review with forceCreate or repeated retries', async () => {
  candidates = [{ id: 42, provider_id: null }];
  const first = await run({ forceCreate: true });
  const retry = await run({ force_create: true });
  expect(first.res.status).toHaveBeenCalledWith(409);
  expect(retry.res.status).toHaveBeenCalledWith(409);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});

it('fails closed when the required EHR candidate lookup fails', async () => {
  lookupError = new Error('Lookup unavailable');
  const { res, next } = await run();
  expect(next).toHaveBeenCalledWith(lookupError);
  expect(res.status).not.toHaveBeenCalledWith(201);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
});

it('creates a legitimate new EHR chart after a successful no-match lookup with provenance intact', async () => {
  const { res, next } = await run();
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'EHR_PATIENT_LIST', full_name: 'Ann Example', provider_id: 7 }));
  expect(mocks.update).not.toHaveBeenCalled();
});

it('preserves legacy Note Aid reuse and provider assignment behavior', async () => {
  candidates = [{ id: 42, full_name: 'Ann Example', provider_id: null }];
  const { res, next } = await run({ source: 'NOTE_AID_MINIMAL' });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reused: true, client: expect.objectContaining({ id: 42 }) }));
  expect(mocks.update).toHaveBeenCalledWith(42, { provider_id: 7 }, 1);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.some(([sql]) => guardedLookup(sql))).toBe(false);
});

it('preserves ordinary admin creation despite unrelated initials candidates', async () => {
  candidates = [{ id: 42 }];
  const { res, next } = await run({ source: 'ADMIN_CREATED' });
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.execute.mock.calls.some(([sql]) => guardedLookup(sql))).toBe(false);
});
