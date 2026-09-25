import { describe, it, expect, vi } from 'vitest';
import { billingWorkspace } from '../claimMdWorkspace.service.js';

const agency = id => ({ id, name: `Company ${id}`, feature_flags: { medicalBillingEnabled: true } });
function fixture() {
  const deps = {
    main: { execute: vi.fn(async () => [[agency(1), agency(2), agency(3)]]) },
    memberships: vi.fn(async () => [agency(1), agency(2), agency(3)]),
    canAccess: vi.fn(async (_, id) => id !== 2),
    connectionMeta: vi.fn(async () => ({ configured: true, accountId: '100', mode: 'disabled' })),
    clinical: { execute: vi.fn(async (sql, params) => {
      if (sql.includes('GROUP BY')) return [[{ agency_id: 1, claim_lifecycle: 'ready', count: 2 }]];
      if (sql.includes('FROM claimmd_enrollments')) return [[{ agency_id: 1, connection_id: 'account:100', payer_id: 'COCHA', enrollment_type: 'era', status: 'requested' }, { agency_id: 1, connection_id: 'account:OLD', payer_id: 'OLD', enrollment_type: 'era', status: 'approved' }]];
      if (sql.startsWith('SELECT COUNT')) return [[{ count: 1 }]];
      return [[{ id: 12, agency_id: params[0], claim_lifecycle: 'ready' }]];
    }) }
  };
  return deps;
}
const user = { id: 10, role: 'support' };
describe('cross-company billing scope', () => {
  it('queries and returns only organizations with server-authorized billing access', async () => {
    const deps = fixture(); const data = await billingWorkspace(user, {}, deps);
    expect(data.organizations.map(a => a.id)).toEqual([1, 3]);
    for (const [sql, params] of deps.clinical.execute.mock.calls) { expect(sql).toContain('agency_id IN (?,?)'); expect(params.slice(0, 2)).toEqual([1, 3]); }
    expect(data.organizations[0].enrollments.map(e => e.payerId)).toEqual(['COCHA']);
    expect(data.capabilities.paymentPosting).toBe(false);
  });
  it('denies providers before fetching any data, even if delegated access would return true', async () => {
    const deps = fixture(); deps.canAccess.mockResolvedValue(true);
    for (const role of ['provider', 'provider_plus']) await expect(billingWorkspace({ id: 10, role }, {}, deps)).rejects.toMatchObject({ status: 403 });
    expect(deps.memberships).not.toHaveBeenCalled(); expect(deps.clinical.execute).not.toHaveBeenCalled();
  });
  it('denies forged organization scopes before any clinical query', async () => {
    const deps = fixture();
    for (const agencyId of ['2', '999', 'all', '1 OR 1=1']) await expect(billingWorkspace(user, { agencyId }, deps)).rejects.toMatchObject({ status: 403 });
    expect(deps.clinical.execute).not.toHaveBeenCalled();
  });
  it('applies scope, search, status and pagination on the server', async () => {
    const deps = fixture(); await billingWorkspace(user, { agencyId: '3', status: 'attention', search: "' OR 1=1", page: '2' }, deps);
    const [sql, params] = deps.clinical.execute.mock.calls.at(-1);
    expect(sql).toContain('agency_id IN (?)'); expect(sql).toContain('LIMIT 30 OFFSET 30'); expect(sql).not.toContain("' OR 1=1");
    expect(params.slice(0, 3)).toEqual([3, 'rejected', 'denied']);
  });
  it('reports unavailable schemas instead of inventing zero balances or connected payers', async () => {
    const deps = fixture(); deps.clinical.execute.mockRejectedValue({ code: 'ER_NO_SUCH_TABLE' });
    const data = await billingWorkspace(user, {}, deps);
    expect(data.capabilities.claims).toBe(false); expect(data.capabilities.enrollments).toBe(false);
    expect(data.organizations[0].counts).toBeNull(); expect(data.claims).toEqual([]);
  });
  it('does not suppress database outages as empty successful results', async () => {
    const deps = fixture(); deps.clinical.execute.mockRejectedValue(new Error('DB down'));
    await expect(billingWorkspace(user, {}, deps)).rejects.toThrow('DB down');
  });
  it('empty authorized scope never runs a financial query', async () => {
    const deps = fixture(); deps.canAccess.mockResolvedValue(false);
    expect((await billingWorkspace(user, {}, deps)).organizations).toEqual([]);
    expect(deps.clinical.execute).not.toHaveBeenCalled();
  });
});
