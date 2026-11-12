import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({user:vi.fn(),schema:vi.fn(),read:vi.fn(),agency:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:f.user}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:f.agency}}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({accessProfileSchemaReady:f.schema,readAgencyAccess:f.read}));
import {scopeAgencyRequest} from '../../middleware/agencyAccessProfiles.middleware.js';
beforeEach(()=>{vi.clearAllMocks();f.user.mockResolvedValue({id:7,role:'provider',status:'ACTIVE_EMPLOYEE'});f.schema.mockResolvedValue(true);f.read.mockResolvedValue(null);f.agency.mockResolvedValue({id:42,organization_type:'agency'});});
it('ignores an unrelated ambient agency for the dedicated payroll portal without granting any agency privilege',async()=>{
  const req={user:{id:7,role:'provider',has_payroll_access:true},headers:{'x-agency-id':'42'},baseUrl:'/api/noteworthy'};
  await scopeAgencyRequest(req);
  expect(f.read).not.toHaveBeenCalled();expect(f.agency).not.toHaveBeenCalled();expect(req.user.scopedAgencyId).toBeNull();
  expect(Object.values(req.user.agencyAccess.permissions).every(v=>v===false)).toBe(true);
});
it('retains the membership boundary on every ordinary payroll and clinical endpoint',async()=>{
  for(const baseUrl of ['/api/payroll','/api/clients','/api/noteworthy-other']) {
    await expect(scopeAgencyRequest({user:{id:7,role:'provider'},headers:{'x-agency-id':'42'},baseUrl})).rejects.toMatchObject({code:'AGENCY_ACCESS_REQUIRED'});
  }
  expect(f.read).toHaveBeenCalledWith(7,42);
});
