import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[]),listBillingAgencyIds:vi.fn(async()=>[2])}}));
vi.mock('../schedulingBillingAccess.service.js',()=>({hasSchedulingBillingAccess:vi.fn(async()=>true)}));
import User from '../../models/User.model.js';
import {hasSchedulingBillingAccess} from '../schedulingBillingAccess.service.js';
import {requireMedicalBillingFinancialAccess,allowVerifiedBillingMetadataAccess} from '../../middleware/medicalBilling.middleware.js';
import ClinicalEligibility from '../clinicalEligibility.service.js';
import {hasVerifiedBillingScope} from '../../utils/verifiedBillingScope.js';

const identity={id:10,role:'support'};
const request=()=>({user:identity,query:{agencyId:2}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();hasSchedulingBillingAccess.mockResolvedValue(true);User.getAgencies.mockResolvedValue([]);});
describe('billing-only route scope',()=>{
  it('allows financial controllers for one verified agency without granting chart membership',async()=>{
    const req=request(),next=vi.fn();await requireMedicalBillingFinancialAccess(req,response(),next);
    expect(next).toHaveBeenCalledWith();
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:req.user,agencyId:2})).resolves.toBe(true);
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:req.user,agencyId:3})).rejects.toMatchObject({status:403});
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:identity,agencyId:2})).rejects.toMatchObject({status:403});
    expect(req.user).not.toBe(identity);expect(hasVerifiedBillingScope(identity,2)).toBe(false);
  });
  it('does not serialize grants or accept invented client-supplied flags',async()=>{
    const req=request();await requireMedicalBillingFinancialAccess(req,response(),vi.fn());
    const forged={...JSON.parse(JSON.stringify(req.user)),verifiedBillingAgencyId:2,hasBillingAccess:true,billingAgencyIds:[2]};
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:forged,agencyId:2})).rejects.toMatchObject({status:403});
  });
  it('denies revoked financial access before the controller runs',async()=>{
    hasSchedulingBillingAccess.mockResolvedValue(false);const req=request(),res=response(),next=vi.fn();
    await requireMedicalBillingFinancialAccess(req,res,next);
    expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();expect(hasVerifiedBillingScope(req.user,2)).toBe(false);
  });
  it('retains ordinary clinician access to shared service metadata without a financial grant',async()=>{
    hasSchedulingBillingAccess.mockResolvedValue(false);User.getAgencies.mockResolvedValue([{id:2}]);
    const req={...request(),user:{id:11,role:'provider'}},next=vi.fn();await allowVerifiedBillingMetadataAccess(req,response(),next);
    expect(next).toHaveBeenCalledWith();expect(hasVerifiedBillingScope(req.user,2)).toBe(false);
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:req.user,agencyId:2})).resolves.toBe(true);
  });
  it('lets a verified biller read code and location metadata while unrelated staff remain denied',async()=>{
    const req=request();await allowVerifiedBillingMetadataAccess(req,response(),vi.fn());
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:req.user,agencyId:2})).resolves.toBe(true);
    hasSchedulingBillingAccess.mockResolvedValue(false);const other=request();await allowVerifiedBillingMetadataAccess(other,response(),vi.fn());
    await expect(ClinicalEligibility.ensureAgencyAccess({reqUser:other.user,agencyId:2})).rejects.toMatchObject({status:403});
  });
});

import {ensureBillingFinancialAccess,ensureMedicalRecordAccess} from '../billingReportAccess.service.js';
import pool from '../../config/database.js';
it('honors delegated billing on imported reports without granting imported clinical records',async()=>{
  const req=request();expect(await ensureBillingFinancialAccess(req,response(),{agencyId:2})).toBe(true);
  pool.execute.mockResolvedValue([[]]);const res=response();
  expect(await ensureMedicalRecordAccess(req,res,{agencyId:2,clientId:20})).toBe(false);expect(res.status).toHaveBeenCalledWith(403);
});

import {requireBillingStaff} from '../familyLedger/policy.js';
it('supports managed billing in the family balance desk and denies unrelated companies',async()=>{
  const db={execute:vi.fn(async sql=>sql.includes('agency_billing_management')?[[{id:2,organization_type:'agency'}]]:[[]])};
  await expect(requireBillingStaff(identity,2,db)).resolves.toBeUndefined();
  await expect(requireBillingStaff(identity,3,db)).rejects.toMatchObject({status:403});
  await expect(requireBillingStaff({...identity,role:'provider'},2,db)).rejects.toMatchObject({status:403});
});
it('rejects conflicting body/query scope but permits a different shell context header',async()=>{
  const req={...request(),body:{agencyId:3}},next=vi.fn();
  await requireMedicalBillingFinancialAccess(req,response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(hasSchedulingBillingAccess).not.toHaveBeenCalled();
  const valid={...request(),headers:{'x-agency-id':'1'}};await requireMedicalBillingFinancialAccess(valid,response(),vi.fn());
  expect(hasVerifiedBillingScope(valid.user,2)).toBe(true);
});

it('does not grant family billing to an administrator without explicit access',async()=>{const db={execute:vi.fn(async sql=>sql.includes('agency_billing_management')?[[]]:[[{has_billing_access:0}]])};await expect(requireBillingStaff({id:555,role:'admin'},2,db)).rejects.toMatchObject({status:403});});
