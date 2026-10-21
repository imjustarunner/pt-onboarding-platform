import {beforeEach,describe,it,expect,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());vi.mock('../../config/database.js',()=>({default:{execute}}));
import {dependentRouteAllowed,dependentClinicalScopes,enforceDependentPortalScope} from '../dependentPortalPolicy.service.js';
describe('single-client personal portal boundaries',()=>{
 beforeEach(()=>execute.mockReset());
 it.each(['/api/guardian-portal/overview','/api/guardian-portal/account','/api/guardian-portal/messages','/api/guardian-portal/clients/8/details','/api/family-billing/balances','/api/chat/threads','/api/dependent-portal/manage/8','/api/tutoring-learning-os/clients/99/office-entry'])('blocks family or other-client endpoint %s',path=>expect(dependentRouteAllowed('GET',path,8)).toBe(false));
 it.each(['/api/dependent-portal/me','/api/dependent-portal/messages/11','/api/auth/me','/api/auth/logout','/api/tutoring-learning-os/clients/8/office-entry'])('allows own portal infrastructure %s',path=>expect(dependentRouteAllowed('GET',path,8)).toBe(true));
 it('does not inherit the unrestricted self clinical grant',async()=>{execute.mockResolvedValueOnce([[{user_id:3,client_id:8}]]).mockResolvedValueOnce([[]]);expect(await dependentClinicalScopes(3,8,2)).toEqual(['session_frequency','clinical_messages']);});
 it('applies only reviewed sharing for the current agency',async()=>{execute.mockResolvedValueOnce([[{user_id:3,client_id:8}]]).mockResolvedValueOnce([[{scopes_json:['treatment_plan','billing','approve_goals']}]]);expect(await dependentClinicalScopes(3,8,2)).toEqual(['session_frequency','clinical_messages','treatment_plan']);expect(execute.mock.calls[1][1]).toEqual([3,2]);});
 it.each([{client_id:9},{client_id:8,revoked_at:new Date()}])('denies revoked or wrong-client grants',async row=>{execute.mockResolvedValue([[row]]);expect(await dependentClinicalScopes(3,8,2)).toEqual([]);});
 it('rechecks revocation on an already signed-in session',async()=>{execute.mockResolvedValue([[{client_id:8,revoked_at:new Date()}]]);const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await enforceDependentPortalScope({user:{id:3,role:'client_guardian'},originalUrl:'/api/dependent-portal/me',method:'GET'},res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();});
 it('leaves ordinary guardians unchanged',async()=>{execute.mockResolvedValue([[]]);const next=vi.fn();await enforceDependentPortalScope({user:{id:3,role:'client_guardian'}},{},next);expect(next).toHaveBeenCalledOnce();});
});
