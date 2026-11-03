import { describe, it, expect, vi } from 'vitest';
import { billingWorkspace, billingWorkspaceTransactions } from '../claimMdWorkspace.service.js';

const agency = id => ({ id, organization_type: 'agency', name: `Company ${id}`, feature_flags: { medicalBillingEnabled: true } });
function fixture() {
  const deps = {
    loadWorkItems: vi.fn(async ids => ({items:ids.map(id=>({id:12+id,claimId:12+id,key:`claim:${12+id}`,agency_id:id,stage:'ready_to_submit',client_id:4,client_name:'Demo Client',date_of_service:'2026-11-03'})),draftsAvailable:true,appointmentsAvailable:true})),
    managed: vi.fn(async () => []),
    eftList: vi.fn(async () => ({items:[]})),
    main: { execute: vi.fn(async () => [[agency(1), agency(2), agency(3)]]) },
    memberships: vi.fn(async () => [agency(1), agency(2), agency(3)]),
    canAccess: vi.fn(async (_, id) => id !== 2),
    connectionMeta: vi.fn(async () => ({ configured: true, accountId: '100', mode: 'disabled' })),
    clinical: { execute: vi.fn(async (sql, params) => {
      if (sql.includes('FROM claimmd_payment_postings')) return [[{agency_id:1,posting_count:2,paid_cents:16000}]];
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
    expect(deps.eftList.mock.calls.map(([id])=>id)).toEqual([1,3]);
    for (const [sql, params] of deps.clinical.execute.mock.calls) { expect(sql).toContain('agency_id IN (?,?)'); expect(params.slice(0, 2)).toEqual([1, 3]); }
    expect(data.organizations[0].enrollments.map(e => e.payerId)).toEqual(['COCHA']);
    expect(data.capabilities.paymentPosting).toBe(true);
    expect(data.organizations[0].payments).toEqual({postingCount:2,paidCents:16000});
  });
  it('includes managed companies once and labels their billing manager', async () => {
    const deps = fixture();
    deps.memberships.mockResolvedValue([agency(1)]);
    deps.managed.mockResolvedValue([{...agency(1), billing_manager_id:10, billing_manager_name:'Plot Twist Co'}, {...agency(3), billing_manager_id:10, billing_manager_name:'Plot Twist Co'}, {...agency(4), is_archived:1}, {...agency(5), is_active:0}]);
    const data = await billingWorkspace(user, {}, deps);
    expect(data.organizations.map(a=>a.id)).toEqual([1,3]);
    expect(data.organizations[1].billingManager).toEqual({id:10,name:'Plot Twist Co'});
    for (const [,params] of deps.clinical.execute.mock.calls) expect(params.slice(0,2)).toEqual([1,3]);
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
    expect(deps.loadWorkItems).toHaveBeenCalledWith([1,3],deps);
    const data=await billingWorkspace(user,{agencyId:'3',status:'ready_to_submit',search:'Demo',sortBy:'client_name',direction:'asc'},deps);
    expect(data.claims.map(row=>row.agency_id)).toEqual([3]);expect(data.total).toBe(1);
    expect((await billingWorkspace(user,{agencyId:3,status:'all',page:2},deps)).claims).toEqual([]);
  });
  it('reports unavailable schemas instead of inventing zero balances or connected payers', async () => {
    const deps = fixture(); deps.clinical.execute.mockRejectedValue({ code: 'ER_NO_SUCH_TABLE' }); deps.loadWorkItems.mockRejectedValue({code:'ER_NO_SUCH_TABLE'});
    const data = await billingWorkspace(user, {}, deps);
    expect(data.capabilities.paymentPosting).toBe(false); expect(data.organizations[0].payments).toBeNull();
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

it('limits preview organization metadata, balances and claims before any financial query', async () => {
  const deps = fixture(); deps.main.execute.mockResolvedValue([[agency(3)]]);
  const data = await billingWorkspace({id:10,role:'super_admin',auricwellPreviewAgencyId:3},{agencyId:'3'},deps);
  expect(deps.main.execute).toHaveBeenCalledWith(expect.stringContaining('AND a.id = ?'),[3]);
  expect(data.organizations.map(a=>a.id)).toEqual([3]);
  expect(deps.eftList.mock.calls.map(([id])=>id)).toEqual([3]);
  for (const [,params] of deps.clinical.execute.mock.calls) expect(params[0]).toBe(3);
});

it('excludes programs, demos, and disabled billing accounts and resolves shared agency icons',async()=>{const deps=fixture();deps.memberships.mockResolvedValue([{...agency(1),icon_file_path:'icons/practice.svg'},{...agency(2),organization_type:'program'},{...agency(3),feature_flags:{medicalBillingEnabled:true,billingAccountExcluded:true}}]);const data=await billingWorkspace(user,{},deps);expect(data.organizations.map(a=>a.id)).toEqual([1]);expect(data.organizations[0].logoUrl).toBe('icons/practice.svg');await expect(billingWorkspace(user,{agencyId:3},deps)).rejects.toMatchObject({status:403});});

describe('sortable billing transaction history',()=>{
 function transactionFixture(){const deps=fixture();deps.clinical.execute.mockResolvedValue([[{id:8,agency_id:1,client_id:4,claimId:10,kind:'era',paid_cents:20000,adjustment_cents:3000,responsibility_cents:2000,posted_at:'2026-11-01'}]]);deps.main.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM family_ledger_payments'))return [[{id:9,agency_id:1,client_id:4,claimId:10,processor:'STRIPE',status:'succeeded',amount_cents:2000,posted_at:'2026-11-02'}]];
  if(sql.includes('FROM family_payment_refunds'))return [[{id:9,agency_id:1,client_id:4,claimId:10,status:'succeeded',amount_cents:500,posted_at:'2026-11-03'}]];
  if(sql.includes('FROM clients'))return [[{id:4,agency_id:1,full_name:'DEMO Patient'}]];
  return [[]];
 });return deps;}
 it('retains ERA, payment and refund identities with signed amounts and linked clients',async()=>{
  const deps=transactionFixture(),result=await billingWorkspaceTransactions(user,{agencyId:1,sortBy:'amount_cents',direction:'asc'},deps);
  expect(result.total).toBe(3);expect(result.transactions.map(r=>r.id)).toEqual(['refund:9','payment:9','payer:8']);
  expect(result.transactions[0]).toMatchObject({paid_cents:-500,amount_cents:-500,client_name:'DEMO Patient',claimId:10});
  expect(result.familyPaymentsAvailable).toBe(true);for(const [,params] of deps.clinical.execute.mock.calls)expect(params).toEqual([1]);
 });
 it('searches by patient and status and rejects an unauthorized company before financial reads',async()=>{
  const deps=transactionFixture();expect((await billingWorkspaceTransactions(user,{search:'DEMO Patient',clientId:4},deps)).total).toBe(3);
  expect((await billingWorkspaceTransactions(user,{search:'succeeded'},deps)).total).toBe(2);
  deps.clinical.execute.mockClear();await expect(billingWorkspaceTransactions(user,{agencyId:2},deps)).rejects.toMatchObject({status:403});expect(deps.clinical.execute).not.toHaveBeenCalled();
 });
 it('sorts MySQL Date values chronologically rather than by weekday name',async()=>{
  const deps=transactionFixture(),clinical=deps.clinical.execute.getMockImplementation(),main=deps.main.execute.getMockImplementation();
  for(const [db,run] of [[deps.clinical,clinical],[deps.main,main]])db.execute.mockImplementation(async(...args)=>{const [rows]=await run(...args);return [rows.map(row=>row.posted_at?{...row,posted_at:new Date(`${row.posted_at}T12:00:00Z`)}:row)];});
  expect((await billingWorkspaceTransactions(user,{sortBy:'posted_at',direction:'desc'},deps)).transactions.map(row=>row.id)).toEqual(['refund:9','payment:9','payer:8']);
 });
});
