import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({verify:vi.fn(),security:vi.fn()}));
vi.mock('jsonwebtoken',()=>({default:{verify:m.verify}}));
vi.mock('../../config/config.js',()=>({default:{jwt:{secret:'test-only'}}}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../services/passkeys.service.js',()=>({assertPasskeySession:async()=>{}}));
vi.mock('../../services/hireStaffAccess.service.js',()=>({assertHireStaffAccess:async()=>{}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:async()=>[]}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../services/productIdentity.service.js',()=>({assertFullSuitePrincipal:async()=>{}}));
vi.mock('../../services/personalSessionHistory.service.js',()=>({recordAccountSession:async()=>{}}));
vi.mock('../../services/sessionSecurity.service.js',()=>({getSessionSecurity:m.security,sessionRouteAllowed:()=>true,invalidateSessionPolicyCache:()=>{}}));
vi.mock('../accountSecurity.middleware.js',()=>({enforceAccountSecurity:(_req,_res,next)=>next()}));
vi.mock('../../utils/capabilities.js',()=>({getUserCapabilities:vi.fn(),buildAgencyAccessCaps:vi.fn()}));
vi.mock('../../utils/supervisorSchoolAccess.js',()=>({isSupervisorActor:vi.fn(),supervisorHasSuperviseeInSchool:vi.fn()}));
vi.mock('../../utils/sscClubAccess.js',()=>({canUserManageClub:vi.fn(),getUserClubMembership:vi.fn(),inferLegacyClubRole:vi.fn()}));
vi.mock('../../utils/meDashboardTenantScope.js',()=>({hasTenantAccess:vi.fn()}));
import {authenticate} from '../auth.middleware.js';
beforeEach(()=>{vi.clearAllMocks();m.verify.mockReturnValue({id:7,role:'provider'});m.security.mockResolvedValue({state:{phase:'active'}});});
async function run({headers={},cookies={}}={}){
 const req={method:'POST',originalUrl:'/api/supervision/sessions/101/join-presence',headers,cookies};
 const res={status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn().mockReturnThis()},next=vi.fn();
 await authenticate(req,res,next);return {req,res,next};
}
it('populates the user from the signed-in cookie for a supervision heartbeat',async()=>{
 const {req,next,res}=await run({cookies:{authToken:'synthetic-test-cookie'}});
 expect(m.verify).toHaveBeenCalledWith('synthetic-test-cookie','test-only');expect(req.user.id).toBe(7);expect(next).toHaveBeenCalledWith();expect(res.status).not.toHaveBeenCalled();
});
it('does not treat a heartbeat without credentials as public',async()=>{const {res,next}=await run();expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();});
it('leaves personal invitation validation to the supervision-scoped authenticator',async()=>{const {req,next}=await run({headers:{'x-supervision-access':'synthetic-invitation'}});expect(next).toHaveBeenCalledWith();expect(req.user).toBeUndefined();expect(m.verify).not.toHaveBeenCalled();});
