import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({members:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.members}}));
import {enforceSchoolCareBridgeScope,schoolCareBridgeApiAllowed} from '../schoolCareBridgeScope.middleware.js';
const limited={id:2,organization_type:'agency',feature_flags:{schoolCareBridgeOnly:true}},full={id:3,organization_type:'agency',feature_flags:{}};
async function request(path,opts={}){const req={user:{id:20,role:'admin'},method:'POST',originalUrl:path,headers:{},body:{},...opts},res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await enforceSchoolCareBridgeScope(req,res,next);return {res,next};}
beforeEach(()=>{vi.clearAllMocks();m.members.mockResolvedValue([limited]);});
describe('SchoolCareBridge tenant scope',()=>{
 it('blocks unrelated operations even for standalone tenant admins',async()=>{const {res,next}=await request('/api/payroll/run');expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();});
 it('preserves existing scoped school and document workflows',async()=>{for(const path of ['/api/school-portal/12/messages','/api/clients/5','/api/document-signing/20/sign','/api/schoolcarebridge/tenants/example/schools','/api/organizations/ashley/upload-referral','/api/referral-packet-drafts/4/ocr','/api/availability/school-requests','/api/public-intake/link/approve']){const {next}=await request(path);expect(next).toHaveBeenCalledWith();}});
 it('keeps connected ITSCO unrestricted by this additional product scope',async()=>{m.members.mockResolvedValue([full]);const {next}=await request('/api/payroll/run');expect(next).toHaveBeenCalledWith();});
 it('restricts explicitly selected standalone agencies for multi-tenant members',async()=>{m.members.mockResolvedValue([limited,full]);for(const opts of [{body:{agencyId:2}},{query:{agencyId:'2'}},{headers:{'x-agency-id':'2'}}]){const {res}=await request('/api/payroll/run',opts);expect(res.status).toHaveBeenCalledWith(403);}const {next}=await request('/api/payroll/run',{body:{agencyId:3}});expect(next).toHaveBeenCalledWith();});
 it('cannot expand a scoped tenant through organization settings',async()=>{m.members.mockResolvedValue([limited,full]);const {res}=await request('/api/agencies/2',{method:'PUT'});expect(res.status).toHaveBeenCalledWith(403);});
 it('fails closed when membership lookup fails',async()=>{const error=Error('db failure');m.members.mockRejectedValue(error);const {next,res}=await request('/api/clients');expect(next).toHaveBeenCalledWith(error);expect(res.json).not.toHaveBeenCalled();});
 it('limits profile updates to the current account',()=>{expect(schoolCareBridgeApiAllowed('PUT','/api/users/21/profile',20)).toBe(false);expect(schoolCareBridgeApiAllowed('PUT','/api/users/20/profile',20)).toBe(true);});
});
