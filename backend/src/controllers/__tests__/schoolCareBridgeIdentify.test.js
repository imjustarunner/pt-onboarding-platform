import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({byEmail:vi.fn(),agencies:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findByEmail:m.byEmail,getAgencies:m.agencies}}));
vi.mock('../../services/email.service.js',()=>({default:{isConfigured:()=>false}}));
vi.mock('../summitStats.controller.js',()=>({getPlatformAgencyId:vi.fn()}));
import {identifyLogin} from '../auth.controller.js';
const schools=[{id:12,name:'Ashley',slug:'ashley',organization_type:'school'},{id:13,name:'Lincoln',slug:'lincoln',organization_type:'school'}];
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.byEmail.mockResolvedValue({id:5,role:'school_staff',email:'staff@school.test'});m.agencies.mockResolvedValue(schools);});
async function identify(body){const res={json:vi.fn(),status:vi.fn().mockReturnThis()};const next=vi.fn();await identifyLogin({body,headers:{},get:()=>''},res,next);expect(next).not.toHaveBeenCalled();return res.json.mock.calls[0][0];}
describe('SchoolCareBridge identity discovery',()=>{
 it('offers actual school memberships instead of selecting a parent agency',async()=>{
  const result=await identify({username:'staff@school.test',surface:'schoolcarebridge'});expect(result.needsOrgChoice).toBe(true);expect(result.orgOptions.map(s=>s.slug)).toEqual(['ashley','lincoln']);
 });
 it('uses a selected school membership',async()=>{
  const result=await identify({username:'staff@school.test',surface:'schoolcarebridge',organizationSlug:'lincoln'});expect(result.needsOrgChoice).toBe(false);expect(result.resolvedOrg.slug).toBe('lincoln');
 });
 it('does not accept an unrelated school as a selection',async()=>{
  const result=await identify({username:'staff@school.test',surface:'schoolcarebridge',organizationSlug:'unrelated'});expect(result.needsOrgChoice).toBe(true);expect(result.orgOptions.some(s=>s.slug==='unrelated')).toBe(false);
 });
 it('resolves a single school and leaves legacy redirection disabled',async()=>{
  m.agencies.mockResolvedValue([schools[0]]);const result=await identify({username:'staff@school.test',surface:'schoolcarebridge'});expect(result.resolvedOrg.slug).toBe('ashley');expect(result.schoolCareBridgeRedirect).toBeNull();
 });
});
