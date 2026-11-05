import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),find:vi.fn(),update:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findById:m.find,update:m.update}}));
import { updateBillingOffice } from '../medicalBilling.controller.js';
const request=()=>({user:{id:99,role:'admin'},params:{officeId:'1'},body:{agencyId:2,claimFacilityName:'Saved Facility LLC'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue({id:1,agency_id:2});m.update.mockResolvedValue({id:1,claim_facility_name:'Saved Facility LLC'});m.access.mockResolvedValue();});
it('saves facility identity through the practice-scoped billing office endpoint',async()=>{
 const res=response(),next=vi.fn();await updateBillingOffice(request(),res,next);
 expect(m.access).toHaveBeenCalledWith({reqUser:request().user,agencyId:2});
 expect(m.update).toHaveBeenCalledWith(1,{claim_facility_name:'Saved Facility LLC'});
 expect(res.json).toHaveBeenCalledWith({item:{id:1,claim_facility_name:'Saved Facility LLC'}});expect(next).not.toHaveBeenCalled();
});
it('does not overwrite another practice’s office',async()=>{
 m.find.mockResolvedValue({id:1,agency_id:6});const res=response();await updateBillingOffice(request(),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(404);expect(m.update).not.toHaveBeenCalled();
});
it('does not save when practice access is denied',async()=>{
 const error=Object.assign(Error('Access denied'),{status:403});m.access.mockRejectedValueOnce(error);const next=vi.fn();
 await updateBillingOffice(request(),response(),next);expect(next).toHaveBeenCalledWith(error);expect(m.find).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
