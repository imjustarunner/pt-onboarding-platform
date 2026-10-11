import {it,expect,vi} from 'vitest';
vi.mock('../../models/User.model.js',()=>({default:{}}));
import {providerUpdateSignIn} from '../providerUpdateSignIn.service.js';
const org = {id:2,feature_flags:{googleSsoEnabled:true,googleSsoRequiredRoles:['provider','provider_plus','clinical_practice_assistant','admin','staff']}};
const user = {id:7,role:'provider'};
it.each(['admin','super_admin','support','supervisor','provider_plus','clinical_practice_assistant','internship_mentor'])('retains Google for %s and never offers credential setup',role=>{
 expect(providerUpdateSignIn({...user,role},[org],2)).toMatchObject({method:'google',retainsGoogle:true,showCredentialSetup:false,passkeyEligible:false,transitionPlanned:false});
});
it('retains Google for provider accounts with supervisor privileges or a mentor appointment',()=>{
 for(const assignment of [{has_supervisor_privileges:1},{title:'Therapist & Student Training Mentor'}])expect(providerUpdateSignIn({...user,...assignment},[org],2).retainsGoogle).toBe(true);
});
it('honors a named supervisor exception without changing current sign-in policy',()=>{
 const agency={...org,feature_flags:{...org.feature_flags,providerUpdateGoogleRetentionOverrides:{7:false}}};
 expect(providerUpdateSignIn({...user,has_supervisor_privileges:1},[agency],2)).toEqual({method:'google',retainsGoogle:false,showCredentialSetup:true,passkeyEligible:true,transitionPlanned:true});
 expect(providerUpdateSignIn({...user,id:8,has_supervisor_privileges:1},[agency],2).retainsGoogle).toBe(true);
});
it('uses actual password-login overrides instead of guessing from email',()=>{
 expect(providerUpdateSignIn({...user,sso_password_override:1,email:'person@work.example'},[org],2)).toMatchObject({method:'password',transitionPlanned:false,showCredentialSetup:true});
 expect(providerUpdateSignIn({...user,email:'personal@example.invalid'},[org],2)).toMatchObject({method:'google',transitionPlanned:true});
});
it('never announces Google retention for an organization without Google sign-in',()=>{
 expect(providerUpdateSignIn({...user,role:'admin'},[{id:2,feature_flags:{}}],2)).toMatchObject({method:'password',retainsGoogle:false,passkeyEligible:false});
});
it('applies personal exceptions only in the recipient agency',()=>{
 const other={id:9,feature_flags:{...org.feature_flags,providerUpdateGoogleRetentionOverrides:{7:false}}};
 expect(providerUpdateSignIn({...user,has_supervisor_privileges:1},[other,org],2).retainsGoogle).toBe(true);
});
