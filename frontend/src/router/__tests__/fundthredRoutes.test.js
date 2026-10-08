import {describe,it,expect,vi} from 'vitest';
import router from '../index';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));

describe('FundThred public and protected routes',()=>{
  it.each(['','/product','/solutions','/pricing','/resources','/start'])('loads the public %s page without requiring an account',async section=>{
    const route=router.resolve(`/fundthred${section}`);
    expect(route.name).toBe('FundThredWebsite');
    expect(route.meta).toMatchObject({hideNav:true,fundthred:true,publicMarketingHub:true});
    expect(route.meta.requiresAuth).not.toBe(true);
    expect((await route.matched.at(-1).components.default()).default.__name).toBe('FundThredWebsite');
  });
  it.each(['/mh4kidz/finance-operations','/mh4kidz/finance-operations?area=donations','/another-nonprofit/finance-operations?area=budgets','/finance-operations'])('restores the protected workspace at %s',async path=>{
    const route=router.resolve(path);
    expect(route.name).toMatch(/FinanceOperations$/);
    expect(route.meta).toMatchObject({requiresAuth:true,hideNav:true,fundthred:true});
    expect((await route.matched.at(-1).components.default()).default.__name).toBe('FinanceOperationsView');
  });
  it('keeps the organization picker distinct from public marketing pages',()=>{
    const route=router.resolve('/fundthred/app');
    expect(route.name).toBe('FundThredEntry');
    expect(route.meta.fundthredEntry).toBe(true);
    expect(router.resolve('/fundthred/login').matched.at(-1).redirect()).toEqual({path:'/login',query:{product:'fundthred',redirect:'/fundthred/app'}});
  });
});
