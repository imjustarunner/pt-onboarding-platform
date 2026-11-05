import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), append: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: mocks.getConnection } }));
vi.mock('../securityEvidence.service.js', () => ({ appendSecurityEvidence: mocks.append, mirrorSecurityEvidence: vi.fn() }));
import { hasAveryDemoFileAccess } from '../demoFileAccess.service.js';
import { authorizeProtectedActivity } from '../activityProtection.service.js';

const request = overrides => ({ user: { id:1433, role:'provider', email:'qa.provider.auricwell@example.com', sessionId:'avery-demo-session' },
  method:'GET', originalUrl:'/api/school-contact-plan/pdf-preview', headers:{}, ...overrides });
const memberships = () => [
  { user_id:1433, email:'qa.provider.auricwell@example.com', role:'provider', is_demo:1, is_active:1, is_archived:0,
    id:450, slug:'auricwell-qa-demo', agency_active:1, feature_flags:{qaSandbox:{syntheticOnly:true}} },
  { user_id:1433, email:'qa.provider.auricwell@example.com', role:'provider', is_demo:1, is_active:1, is_archived:0,
    id:456, slug:'scb-qa-company', agency_active:1, feature_flags:{} }
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(async () => [memberships()]);
  mocks.getConnection.mockRejectedValue(new Error('Normal activity limits apply'));
});

describe('owner-approved Avery demo file access', () => {
  it('audits each file operation past the standard limits, including bulk operations and a new sign-in', async () => {
    for (let i=0;i<30;i++) await authorizeProtectedActivity(request(), {kind:'client_file',resource:`demo-file-${i}`,forceReview:i===29});
    await authorizeProtectedActivity(request({user:{...request().user,sessionId:'new-session'}}), {kind:'client_file',resource:'new-session-file'});
    expect(mocks.append).toHaveBeenCalledTimes(31);
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({userId:1433,action:'demo_file_access_authorized',
      details:expect.objectContaining({exception:'avery_demo_file_access_2026_11_05',forcedReviewOperation:true})}));
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('denies file delivery if its audit cannot be recorded', async () => {
    mocks.append.mockRejectedValue(new Error('Audit unavailable'));
    await expect(authorizeProtectedActivity(request(),{kind:'client_file',resource:'pdf'})).rejects.toThrow('Audit unavailable');
  });
  it.each([
    {id:1434,is_demo:1,email:'qa.provider.auricwell@example.com'},
    {id:1,is_demo:1,email:'qa.provider.auricwell@example.com'},
    {id:1433,switchedFromUserId:1},
    {id:1,switchedFromUserId:1433},
    {id:1433,testAccountSwitch:true}
  ])('does not exempt another demo user or switched identity: %j', async user => {
    const req=request({user:{...request().user,...user},body:{id:1433,is_demo:1},query:{demo:true},headers:{'x-demo-account':'1433'}});
    expect(await hasAveryDemoFileAccess(req)).toBe(false);
    await expect(authorizeProtectedActivity(req,{kind:'client_file',resource:'pdf'})).rejects.toThrow('Normal activity limits apply');
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([
    {user_id:1}, {email:'someone@example.com'}, {role:'admin'}, {is_demo:0}, {is_active:0}, {is_archived:1}, {agency_active:0}
  ])('rechecks the persisted identity instead of accepting demo claims: %j', async patch => {
    mocks.execute.mockResolvedValue([memberships().map(row=>({...row,...patch}))]);
    expect(await hasAveryDemoFileAccess(request())).toBe(false);
    await expect(authorizeProtectedActivity(request(),{kind:'client_file',resource:'pdf'})).rejects.toThrow('Normal activity limits apply');
  });
  it.each([
    [],
    memberships().filter(row=>row.id===456),
    memberships().map(row=>row.id===450?{...row,slug:'itsco'}:row),
    memberships().map(row=>row.id===450?{...row,feature_flags:{}}:row),
    memberships().map(row=>row.id===450?{...row,feature_flags:'{invalid'}:row),
    memberships().map(row=>row.id===456?{...row,slug:'another-company'}:row),
    [...memberships(), {...memberships()[0],id:2,slug:'itsco'}]
  ].map(rows=>({rows})))('fails closed for missing, changed, or additional organization membership %#', async ({rows}) => {
    mocks.execute.mockResolvedValue([rows]);
    expect(await hasAveryDemoFileAccess(request())).toBe(false);
  });
  it('immediately loses the exception if the demo identity changes between operations', async () => {
    expect(await hasAveryDemoFileAccess(request())).toBe(true);
    mocks.execute.mockResolvedValue([memberships().map(row=>({...row,is_demo:0}))]);
    expect(await hasAveryDemoFileAccess(request())).toBe(false);
  });
  it('keeps email limits and hard limits in force for Avery', async () => {
    await expect(authorizeProtectedActivity(request(),{kind:'email',resource:'message'})).rejects.toThrow('Normal activity limits apply');
    await expect(authorizeProtectedActivity(request(),{kind:'client_file',resource:'file',hardLimit:true})).rejects.toThrow('Normal activity limits apply');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
  });
  it('fails closed when the identity lookup is unavailable', async () => {
    mocks.execute.mockRejectedValue(new Error('Identity lookup unavailable'));
    await expect(authorizeProtectedActivity(request(),{kind:'client_file',resource:'pdf'})).rejects.toThrow('Identity lookup unavailable');
    expect(mocks.append).not.toHaveBeenCalled();
  });
});
