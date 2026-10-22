import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../managedBillingAccess.service.js',()=>({managedBillingAgencies:vi.fn(async()=>[])}));
import pool from '../../config/database.js';
import { requireClientAccountSupport } from '../clientAccountSupportAccess.service.js';
import { requireBillingStaff } from '../familyLedger/policy.js';
import { hasVerifiedBillingScope } from '../../utils/verifiedBillingScope.js';
const client={id:20,agency_id:2,client_type:'clinical'};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[client]]);});
describe('account support authorization',()=>{
  it.each(['support','admin','super_admin'])('allows %s to access a client in the authorized agency without a billing flag',async role=>{
    const user={id:10,role,billingAgencyIds:[]};
    expect(await requireClientAccountSupport(user,20,2)).toEqual(client);
    expect(hasVerifiedBillingScope(user,2)).toBe(false);
  });
  it.each(['provider','provider_plus','school_staff','client_guardian','guardian','client','staff'])('does not grant %s routine staff financial information',async role=>{
    await expect(requireClientAccountSupport({id:10,role},20)).rejects.toMatchObject({status:403});
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('requires a current direct membership and active agency, even with forged billing IDs',async()=>{
    pool.execute.mockResolvedValue([[]]);
    await expect(requireClientAccountSupport({id:10,role:'support',billingAgencyIds:[2]},20)).rejects.toMatchObject({status:403});
    const [sql,args]=pool.execute.mock.calls[0];
    expect(sql).toContain('ua.is_active=1');expect(sql).toContain('a.is_active=1');expect(sql).toContain('COALESCE(a.is_archived,0)=0');
    expect(args).toEqual([20,'support',10]);
  });
  it('rejects a conflicting agency without granting another scope',async()=>{
    await expect(requireClientAccountSupport({id:10,role:'support'},20,3)).rejects.toMatchObject({status:403});
  });
  it('account support does not unlock the family billing desk or ledger actions',async()=>{
    const user={id:10,role:'support'};
    await requireClientAccountSupport(user,20);
    pool.execute.mockResolvedValue([[{has_billing_access:0}]]);
    await expect(requireBillingStaff(user,2)).rejects.toMatchObject({status:403});
  });
});
