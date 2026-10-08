import {describe,it,expect} from 'vitest';
import {fundthredLoginLocation,fundthredWorkspacePath,isFundthredLogin} from '../fundthred';
import {fundthredEstimate} from '../../config/fundthredProduct';
describe('FundThred entry and estimates',()=>{
  it('preserves a tenant destination and selected module through login',()=>{
    const redirect='/mh4kidz/finance-operations?area=documents';
    expect(fundthredLoginLocation(redirect).query.redirect).toBe(redirect);
    expect(isFundthredLogin({query:{redirect}})).toBe(true);
    expect(fundthredWorkspacePath('mh4kidz')).toBe('/mh4kidz/finance-operations');
  });
  it.each(['https://evil.example/finance-operations','//evil.example/finance-operations','/fundthred/app\\evil','/fundthred/app\n','/dashboard'])('rejects unsafe or unrelated return location %s',redirect=>{
    expect(fundthredLoginLocation(redirect).query.redirect).toBe('/fundthred/app');
  });
  it('calculates annual totals without rounding the actual bill or inventing a custom price',()=>{
    expect(fundthredEstimate('essentials','annual')).toMatchObject({billedCents:95000,monthlyEquivalentCents:7917});
    expect(fundthredEstimate('growth')).toMatchObject({billedCents:24900});
    expect(fundthredEstimate('custom','annual').billedCents).toBeNull();
    expect(()=>fundthredEstimate('bad')).toThrow(RangeError);
  });
});
