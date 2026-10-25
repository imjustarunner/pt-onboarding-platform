import { expect, it, vi } from 'vitest';
import { excludeSupportClinicalContent, excludeSupportSettings, supportOwnAccountOnly, supportProfileUpdateOnly } from '../supportContentAccess.middleware.js';
import { requireClinicalChart, requireClinicalNoteSigning } from '../medicalBilling.middleware.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{listBillingAgencyIds:vi.fn()}}));
vi.mock('../../services/schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn()}));
import pool from '../../config/database.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
it.each([excludeSupportClinicalContent,excludeSupportSettings])('denies support without granting admin-like capabilities',guard=>{
  const res=response(),next=vi.fn();guard({user:{id:1434,role:'support',effectiveRole:'admin',billingAgencyIds:[450]}},res,next);
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it.each(['admin','provider','supervisor','client_guardian'])('leaves existing downstream authorization in force for %s',role=>{
  const res=response(),next=vi.fn();excludeSupportClinicalContent({user:{role}},res,next);expect(next).toHaveBeenCalledOnce();expect(res.status).not.toHaveBeenCalled();
});
it.each([requireClinicalChart,requireClinicalNoteSigning])('denies clinical reads/signing even before enabled feature flags can grant access',async guard=>{
  const res=response(),next=vi.fn();await guard({user:{id:1434,role:'support'},query:{agencyId:450}},res,next);
  expect(res.status).toHaveBeenCalledWith(403);expect(pool.execute).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
});
it.each([{role:'super_admin'},{hasBillingAccess:true},{hasSupervisorPrivileges:true},{work_role:'admin'},{loginEmail:'other@example.com'}])('cannot elevate support via profile update %j',body=>{
  const res=response(),next=vi.fn();supportProfileUpdateOnly({user:{id:1434,role:'support'},params:{id:'1434'},body},res,next);
  expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it('allows ordinary self-profile changes but blocks changing another staff account',()=>{
  const next=vi.fn();supportProfileUpdateOnly({user:{id:1434,role:'support'},params:{id:'1434'},body:{preferredName:'Jordan'}},response(),next);expect(next).toHaveBeenCalledOnce();
  const res=response();supportProfileUpdateOnly({user:{id:1434,role:'support'},params:{id:'1433'},body:{preferredName:'Other'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
});
it('keeps password/credential operations on the support account itself',()=>{
  const res=response(),next=vi.fn();supportOwnAccountOnly({user:{id:1434,role:'support'},params:{id:'1433'}},res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
