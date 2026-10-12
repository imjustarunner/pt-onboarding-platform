import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>vi.fn());
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:state}));
import {requireClinicalStaffSecurity,requireClinicalRetentionSecurity} from '../clinicalStaffSecurity.middleware.js';
const res=()=>({set:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>vi.clearAllMocks());
it.each([
 {enabled:false,verified:false,required:false},
 {enabled:true,verified:false,required:false},
 {enabled:false,verified:false,required:false,ssoAuthenticated:true}
])('allows normal provider sign-in during optional MFA rollout: %j',async security=>{
 state.mockResolvedValue(security);const r=res(),next=vi.fn();
 await requireClinicalStaffSecurity({user:{id:1,role:'provider'}},r,next);
 expect(next).toHaveBeenCalledWith();expect(r.status).not.toHaveBeenCalled();
});
it('enforces required platform verification even if the caller asks to skip it',async()=>{
 state.mockResolvedValue({required:true,verified:false});const r=res(),next=vi.fn();
 await requireClinicalStaffSecurity({user:{id:1,role:'provider'},query:{skipMfa:true},body:{required:false}},r,next);
 expect(r.status).toHaveBeenCalledWith(403);expect(r.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({code:'MFA_REQUIRED'})}));expect(next).not.toHaveBeenCalled();
});
it('keeps retention administration protected during optional session verification',async()=>{
 state.mockResolvedValue({required:false,verified:false});const r=res(),next=vi.fn();
 await requireClinicalRetentionSecurity({user:{id:1,role:'admin'}},r,next);
 expect(r.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 state.mockResolvedValue({required:false,verified:true});
 await requireClinicalRetentionSecurity({user:{id:1,role:'admin'}},res(),next);
 expect(next).toHaveBeenCalledWith();
});
it('allows a verified provider and scoped client invitations',async()=>{
 state.mockResolvedValue({required:true,verified:true});
 for(const req of [{user:{id:1,role:'provider'}},{counselingInvitationAccess:{clientId:7},user:{role:'client'}}]){const next=vi.fn();await requireClinicalStaffSecurity(req,res(),next);expect(next).toHaveBeenCalledWith();}
});
it('rejects impersonation and fails closed when verification storage fails',async()=>{
 const r=res(),next=vi.fn();await requireClinicalStaffSecurity({user:{id:1,role:'provider',switchedFromUserId:2}},r,next);expect(r.status).toHaveBeenCalledWith(403);
 const error=new Error('unavailable');state.mockRejectedValue(error);await requireClinicalStaffSecurity({user:{id:1,role:'provider'}},res(),next);expect(next).toHaveBeenCalledWith(error);
});
