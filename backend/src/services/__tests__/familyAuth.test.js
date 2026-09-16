import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),compare:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('bcrypt',()=>({default:{compare:mocks.compare}}));
import { requireFamilySession, requireHousehold, unlockFamily, startFamilySession } from '../familyAuth.service.js';
beforeEach(()=>vi.clearAllMocks());
describe('isolated family authentication',()=>{
  it('never accepts workplace or Quick View credentials as a family cookie',async()=>{
    const next=vi.fn();await requireFamilySession({cookies:{qv_session:'qv',authToken:'work'}},{},next);
    expect(next.mock.calls[0][0].status).toBe(401);expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('revokes access when the passcode changes',async()=>{
    mocks.execute.mockResolvedValue([[{credential_version:1,current_version:1,passcode_version:2,current_passcode_version:3}]]);
    const next=vi.fn();await requireFamilySession({cookies:{fcc_session:'family'}},{},next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
  it('has no inactivity expiry but checks the benefit on every request',async()=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('SELECT s.*')?[[{user_id:8,agency_id:4,credential_version:1,current_version:1,passcode_version:2,current_passcode_version:2,created_at:'2020-01-01'}]]:sql.includes('SELECT a.feature_flags')?[[{feature_flags:{familyCommandCenterEnabled:true}}]]:[{}]);
    const next=vi.fn(),res={cookie:vi.fn()};const req={cookies:{fcc_session:'family'}};await requireFamilySession(req,res,next);
    expect(next).toHaveBeenCalledWith();expect(req.family).toEqual({userId:8,agencyId:4});expect(res.cookie.mock.calls[0][2]).toMatchObject({httpOnly:true,path:'/api/family'});
  });
  it('fails closed when the feature is disabled or membership is removed',async()=>{
    mocks.execute.mockResolvedValue([[]]);await expect(startFamilySession(8,4)).rejects.toMatchObject({status:403});
  });
  it('does not pick an arbitrary person when two people share a PIN',async()=>{
    mocks.execute.mockResolvedValue([[{user_id:1,passcode_hash:'a'},{user_id:2,passcode_hash:'b'}]]);mocks.compare.mockResolvedValue(true);
    await expect(unlockFamily({agencyId:4,passcode:'123456'})).rejects.toMatchObject({status:409});
    expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
  it('accepts PIN-only entry and resolves its enabled sponsoring tenant',async()=>{
    mocks.execute.mockImplementation(async sql=>{
      if(sql.includes('SELECT DISTINCT c.*'))return [[{user_id:8,benefit_agency_id:4,passcode_hash:'a'}]];
      if(sql.includes('SELECT a.feature_flags'))return [[{feature_flags:{familyCommandCenterEnabled:true}}]];
      if(sql.includes('SELECT token_version'))return [[{token_version:2,passcode_version:3}]];
      return [{}];
    });mocks.compare.mockResolvedValue(true);
    expect(await unlockFamily({passcode:'123456'})).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO family_device_sessions'));
    expect(insert[1].slice(1)).toEqual([8,4,2,3]);
  });
  it('scopes households to both the employee and tenant; parent rights are separate',async()=>{
    mocks.execute.mockResolvedValue([[]]);await expect(requireHousehold({userId:8,agencyId:4},99)).rejects.toMatchObject({status:404});
    expect(mocks.execute.mock.calls[0][1]).toEqual([99,4,8]);
    mocks.execute.mockResolvedValue([[{id:99,role:'member'}]]);await expect(requireHousehold({userId:8,agencyId:4},99,undefined,true)).rejects.toMatchObject({status:403});
  });
  it('uses the existing household when one person belongs to multiple enabled tenants',async()=>{
    mocks.execute.mockImplementation(async sql=>{
      if(sql.includes('SELECT DISTINCT c.*'))return [[
        {user_id:8,benefit_agency_id:9,has_household:1,passcode_hash:'a'},
        {user_id:8,benefit_agency_id:4,has_household:0,passcode_hash:'a'}
      ]];
      if(sql.includes('SELECT a.feature_flags'))return [[{feature_flags:{familyCommandCenterEnabled:true}}]];
      if(sql.includes('SELECT token_version'))return [[{token_version:2,passcode_version:3}]];
      return [{}];
    });
    mocks.compare.mockResolvedValue(true);
    await unlockFamily({passcode:'123456'});
    expect(mocks.compare).toHaveBeenCalledTimes(1);
    const query=mocks.execute.mock.calls[0][0];
    expect(query).toContain('ORDER BY has_household DESC,ua.agency_id');
    expect(query).not.toContain('is_primary');
    const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO family_device_sessions'));
    expect(insert[1].slice(1)).toEqual([8,9,2,3]);
  });
});
