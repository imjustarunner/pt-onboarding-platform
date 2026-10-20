import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({resolve:vi.fn()}));
vi.mock('../../services/schoolOnboarding.service.js',()=>({resolveDemoSchool:m.resolve}));
vi.mock('../../services/schoolOnboardingNuke.service.js',()=>({nukeSchoolOnboardingInvite:vi.fn()}));
import {getDemoPortal,getDemoSchoolMeta,mutateDemoPortal,getPublicStandaloneDemoPortal} from '../schoolOnboarding.controller.js';
import {fictionalSchool,fictionalDemoGet} from '../../services/fictionalSchoolDemo.service.js';
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();m.resolve.mockResolvedValue(fictionalSchool);});
describe('invitation and standalone demo isolation',()=>{
 it('returns the same synthetic school for invitation links',async()=>{const res=response();await getDemoSchoolMeta({params:{token:'example-invite'}},res,vi.fn());expect(m.resolve).toHaveBeenCalledWith('example-invite');expect(res.json).toHaveBeenCalledWith({school:fictionalSchool});});
 it.each(['clients','providers/scheduling','digital-forms','school-events'])('keeps both entry points on the same fictional %s',async path=>{const req={params:{token:'example-invite'},url:'/'+path,query:{}};for(const handler of [getDemoPortal,getPublicStandaloneDemoPortal]){const res=response();await handler(req,res,vi.fn());expect(res.json).toHaveBeenCalledWith(fictionalDemoGet(path));}});
 it('still rejects invalid invitations',async()=>{m.resolve.mockRejectedValue(Object.assign(new Error('Invitation not found'),{status:404}));const res=response();await getDemoPortal({params:{token:'missing'},url:'/clients'},res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(res.json.mock.calls[0][0]).not.toHaveProperty('clients');});
 it('does not mutate data through invitation demos',async()=>{const res=response();await mutateDemoPortal({params:{token:'example-invite'},url:'/clients',method:'POST',body:{}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);});
});
