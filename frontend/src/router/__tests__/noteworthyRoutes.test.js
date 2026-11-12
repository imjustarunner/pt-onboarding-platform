import { describe, expect, it, vi } from 'vitest';
import router from '../index';
import { fundthredLoginLocation, isFundthredLogin, isFundthredWorkspacePath } from '../../utils/fundthred';
import { isPayrollWorkspacePath } from '../../services/sharedReads';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));

describe('NoteWorthy public and protected route contract',()=>{
  it.each([
    ['/fundthred/noteworthy','NoteworthyWebsite','NoteworthyPayrollWebsite'],
    ['/fundthred/noteworthy/demo','NoteworthyDemo','NoteworthyPayrollDemo'],
    ['/fundthred/noteworthy/start?plan=growth','NoteworthyStart','NoteworthyStartView'],
    ['/fundthred/noteworthy/verify#token=fictional','NoteworthyVerify','NoteworthyStartView'],
    ['/fundthred/noteworthy/accept-invite#token=fictional','NoteworthyInvite','NoteworthyStartView']
  ])('opens public entry %s with the intended component',async(path,name,component)=>{
    const route=router.resolve(path);expect(route.name).toBe(name);
    expect(route.meta).toMatchObject({hideNav:true,fundthred:true});expect(route.meta.requiresAuth).not.toBe(true);
    expect((await route.matched.at(-1).components.default()).default.__name).toBe(component);
  });
  it.each([
    ['/fundthred/noteworthy/app','NoteworthyWorkspace'],
    ['/fundthred/noteworthy/app/71','NoteworthyWorkspace'],
    ['/fundthred/noteworthy/app/71/payroll/801','NoteworthyPayroll'],
    ['/fundthred/noteworthy/app/71/agreements','NoteworthyAgreements']
  ])('protects practice workspace %s',async(path,name)=>{
    const route=router.resolve(path);expect(route.name).toBe(name);
    expect(route.meta).toMatchObject({requiresAuth:true,hideNav:true,fundthred:true,noteworthyEntry:true});
    expect((await route.matched.at(-1).components.default()).default.__name).toBe('NoteworthyWorkspaceView');
    expect(fundthredLoginLocation(path).query.redirect).toBe(path);expect(isFundthredLogin({query:{redirect:path}})).toBe(true);
  });
  it.each(['/noteworthy/app','/noteworthy/app/71/payroll/801','/fundthred/noteworthy/app/71?tab=team'])('recognizes payroll background-read handling on %s',path=>{
    expect(isPayrollWorkspacePath(path)).toBe(true);
  });
  it.each(['/noteworthy','/noteworthy/demo','/fundthred/noteworthy/start','/fundthred/noteworthy/application','/noteworthy/app-preview'])('keeps public or similar paths outside payroll workspace handling: %s',path=>{
    expect(isPayrollWorkspacePath(path)).toBe(false);expect(isFundthredWorkspacePath(path)).toBe(false);
  });
});
