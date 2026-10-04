import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>vi.fn());
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:state}));
import {requireClinicalStaffSecurity} from '../clinicalStaffSecurity.middleware.js';
const res=()=>({set:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>vi.clearAllMocks());
it('requires actual verification for clinical staff even during optional platform MFA rollout or Google sign-in',async()=>{
 state.mockResolvedValue({required:false,verified:false,ssoAuthenticated:true});const r=res(),next=vi.fn();
 await requireClinicalStaffSecurity({user:{id:1,role:'provider'},authClaims:{authMethod:'google'}},r,next);
 expect(r.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it('allows a verified provider and scoped client invitations',async()=>{
 state.mockResolvedValue({verified:true});
 for(const req of [{user:{id:1,role:'provider'}},{counselingInvitationAccess:{clientId:7},user:{role:'client'}}]){const next=vi.fn();await requireClinicalStaffSecurity(req,res(),next);expect(next).toHaveBeenCalledWith();}
});
it('rejects impersonation and fails closed when verification storage fails',async()=>{
 const r=res(),next=vi.fn();await requireClinicalStaffSecurity({user:{id:1,role:'provider',switchedFromUserId:2}},r,next);expect(r.status).toHaveBeenCalledWith(403);
 const error=new Error('unavailable');state.mockRejectedValue(error);await requireClinicalStaffSecurity({user:{id:1,role:'provider'}},res(),next);expect(next).toHaveBeenCalledWith(error);
});
