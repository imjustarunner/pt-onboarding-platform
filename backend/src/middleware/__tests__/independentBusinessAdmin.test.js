import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),query:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn(),query:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:7002},{id:7001}])}}));
vi.mock('../../utils/independentPracticeOwner.js',()=>({isIndependentPracticeOwner:vi.fn()}));
import { isIndependentPracticeOwner } from '../../utils/independentPracticeOwner.js';
import { requireAgencyAdmin } from '../auth.middleware.js';
import { createBusinessLifecycleAccess } from '../businessLifecycleAccess.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();isIndependentPracticeOwner.mockImplementation(async(uid,aid)=>uid===4001&&aid===7001);});
it('authorizes the active owner as admin only for their independent practice',async()=>{
  const user={id:4001,role:'provider'},next=vi.fn(),res=response();
  await requireAgencyAdmin({user,params:{agencyId:'7001'},body:{},query:{}},res,next);
  expect(next).toHaveBeenCalledOnce();expect(res.status).not.toHaveBeenCalled();expect(user.role).toBe('provider');
  const nluRes=response(),nluNext=vi.fn();
  await requireAgencyAdmin({user,params:{agencyId:'7002'},body:{},query:{}},nluRes,nluNext);
  expect(nluRes.status).toHaveBeenCalledWith(403);expect(nluNext).not.toHaveBeenCalled();
});
it('does not turn a stale billing flag or unrelated provider membership into administration',async()=>{
  const res=response(),next=vi.fn();
  await requireAgencyAdmin({user:{id:999,role:'provider',has_billing_access:1},params:{agencyId:'7001'},body:{},query:{}},res,next);
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it('opens the owned company journey while denying the same provider access to the employer terms',async()=>{
  const guard=createBusinessLifecycleAccess(async()=>[{id:7002},{id:7001}],async(uid,aid)=>uid===4001&&Number(aid)===7001);
  const ownNext=vi.fn();await guard({user:{id:4001,role:'provider'},params:{agencyId:'7001'}},response(),ownNext);expect(ownNext).toHaveBeenCalledOnce();
  const other=response(),otherNext=vi.fn();await guard({user:{id:4001,role:'provider'},params:{agencyId:'7002'}},other,otherNext);
  expect(other.status).toHaveBeenCalledWith(403);expect(otherNext).not.toHaveBeenCalled();
});
