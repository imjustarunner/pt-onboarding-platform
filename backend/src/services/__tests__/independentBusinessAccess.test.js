import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../managedBillingAccess.service.js',()=>({managedBillingAgencies:vi.fn(async()=>[])}));
import pool from '../../config/database.js';
import { isIndependentPracticeOwner } from '../../utils/independentPracticeOwner.js';
import { requireBillingStaff } from '../familyLedger/policy.js';

beforeEach(()=>{
  vi.clearAllMocks();
  pool.execute.mockImplementation(async(sql,args)=>[sql.includes('a.account_owner_user_id = ?')&&Number(args[0])===7001&&Number(args[1])===4001?[{id:7001}]:[]]);
});
it('requires the active exact owner membership and supports the transaction executor',async()=>{
  const db={execute:vi.fn(async()=>[[{id:7001}]])};
  expect(await isIndependentPracticeOwner(4001,7001,db)).toBe(true);
  const [sql,args]=db.execute.mock.calls[0];
  expect(args).toEqual([7001,4001]);expect(sql).toContain('ua.is_active = 1');
  expect(sql).toContain('u.is_active = 1');expect(sql).toContain('a.is_active = 1');
  expect(sql).toContain("a.organization_type IN ('life_coach', 'consultant')");
  expect(await isIndependentPracticeOwner(4001,0,db)).toBe(false);
  expect(db.execute).toHaveBeenCalledOnce();
});
it('allows own coaching billing while preserving provider restrictions at the employer and other firms',async()=>{
  await expect(requireBillingStaff({id:4001,role:'provider'},7001)).resolves.toBeUndefined();
  await expect(requireBillingStaff({id:4001,role:'provider'},7002)).rejects.toMatchObject({status:403});
  await expect(requireBillingStaff({id:999,role:'provider'},7001)).rejects.toMatchObject({status:403});
});
it('rejects a stale owner when membership or business is no longer active',async()=>{
  pool.execute.mockResolvedValue([[]]);
  expect(await isIndependentPracticeOwner(4001,7001)).toBe(false);
  await expect(requireBillingStaff({id:4001,role:'provider'},7001)).rejects.toMatchObject({status:403});
});
it.each(['super_admin','superadmin'])('retains active-agency %s billing access without probing owner memberships',async role=>{
  const db={execute:vi.fn(async(sql,args)=>{
    expect(sql).toBe('SELECT id FROM agencies WHERE id = ? AND is_active = 1 AND COALESCE(is_archived, 0) = 0');
    expect(args).toEqual([7001]);return [[{id:7001}]];
  })};
  await expect(requireBillingStaff({id:4003,role},7001,db)).resolves.toBeUndefined();
  expect(db.execute).toHaveBeenCalledOnce();expect(pool.execute).not.toHaveBeenCalled();
});
