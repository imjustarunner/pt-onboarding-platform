import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{listActiveOrganizationsForAgency:vi.fn()}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{listByAgency:vi.fn()}}));
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import {listAffiliatedSchools} from '../schoolCoverageMetrics.service.js';
beforeEach(()=>vi.clearAllMocks());
it('keeps active current and legacy schools while excluding inactive and archived legacy metadata',async()=>{
 OrganizationAffiliation.listActiveOrganizationsForAgency.mockResolvedValue([{id:7,name:'Current',organization_type:'school',is_active:1},{id:8,name:'Inactive current',organization_type:'school',is_active:0}]);
 AgencySchool.listByAgency.mockResolvedValue([
  {school_organization_id:9,school_name:'Active legacy',school_organization_type:'school',is_active:1,school_is_active:1,school_is_archived:0},
  {school_organization_id:10,school_name:'Inactive numeric',school_organization_type:'school',is_active:1,school_is_active:0},
  {school_organization_id:11,school_name:'Inactive string',school_organization_type:'school',is_active:'1',school_is_active:'0'},
  {school_organization_id:12,school_name:'Archived legacy',school_organization_type:'school',is_active:1,school_is_active:1,school_is_archived:1},
  {school_organization_id:13,school_name:'Inactive link',school_organization_type:'school',is_active:0,school_is_active:1}
 ]);
 expect((await listAffiliatedSchools(2)).map(school=>school.id).sort((a,b)=>a-b)).toEqual([7,9]);
 expect(AgencySchool.listByAgency).toHaveBeenCalledWith(2,{includeInactive:false});
});
