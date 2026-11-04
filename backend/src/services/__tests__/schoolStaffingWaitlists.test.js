import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../schoolCoverageMetrics.service.js',()=>({listAffiliatedSchools:vi.fn()}));
vi.mock('../googleDistance.service.js',()=>({getDrivingDistanceMeters:vi.fn(),metersToMiles:vi.fn()}));
import pool from '../../config/database.js';
import {listAffiliatedSchools} from '../schoolCoverageMetrics.service.js';
import {listSchoolsForNeedsPicker,createNeed} from '../providerYearUpdateSchoolNeeds.service.js';
import {getSchoolStaffingWaitlists} from '../schoolStaffingWaitlists.service.js';
const schools=[{id:7,name:'Cedar',slug:'cedar',is_active:1},{id:8,name:'Maple',is_active:1},{id:9,name:'Archived',is_archived:1},{id:10,name:'Unneeded',is_active:1}];
let db;
beforeEach(()=>{db={execute:vi.fn(async sql=>sql.includes('COUNT(DISTINCT c.id)')
 ? [[{school_id:7,insurance_name:'Cigna',client_count:2,client_id:123,full_name:'Must never leave the aggregate'},{school_id:7,insurance_name:'Not recorded',client_count:1},{school_id:8,insurance_name:'Medicaid',client_count:1}]]
 : [[{id:5,school_organization_id:7,title:'Licensed provider needed',body:'Trauma training; Monday preferred.',days_json:'["Monday","Sunday","Monday"]',slots_needed:3}]])};});
it('returns school-level insurer counts and intentionally published staffing notes without client identifiers',async()=>{
 const result=await getSchoolStaffingWaitlists({agencyId:2,schoolYear:'2026-27',database:db,listSchools:async()=>schools});
 expect(result.summary).toEqual({schoolsWithWaitlists:2,waitlistEntries:4,openPostings:1});
 expect(result.schools[0]).toMatchObject({schoolId:7,waitlistCount:3,insuranceMix:[{name:'Cigna',count:2},{name:'Not recorded',count:1}],staffingNeeds:[{id:5,title:'Licensed provider needed',notes:'Trauma training; Monday preferred.',days:['Monday'],slotsNeeded:3}]});
 expect(result.schools.map(s=>s.schoolId)).toEqual([7,8]);
 expect(JSON.stringify(result)).not.toMatch(/client_id|full_name|Must never leave|Archived|Unneeded/);
 for(const [sql,args] of db.execute.mock.calls){expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);expect(args).not.toContain(9);}
 const [sql,args]=db.execute.mock.calls.find(([query])=>query.includes('COUNT(DISTINCT c.id)'));
 expect(sql).toContain('JOIN clients c ON c.id=membership.client_id AND c.agency_id=?');expect(sql).toContain('UNION SELECT primary_client.id');expect(args).toEqual([7,8,10,2,7,8,10,2]);
});
it('does not query client or staffing records when no current schools are affiliated',async()=>{
 expect(await getSchoolStaffingWaitlists({agencyId:2,schoolYear:'2026-27',database:db,listSchools:async()=>[]})).toMatchObject({schools:[],summary:{waitlistEntries:0}});
 expect(db.execute).not.toHaveBeenCalled();
});
it('allows affiliated schools without logos while rejecting inactive and unlinked school posts',async()=>{
 listAffiliatedSchools.mockResolvedValue([{id:7,name:'Cedar',is_active:1,logo_path:null},{id:8,name:'Inactive',is_active:0},{id:9,name:'Archived',is_active:1,is_archived:1}]);
 expect(await listSchoolsForNeedsPicker(2)).toEqual([expect.objectContaining({schoolOrganizationId:7,schoolName:'Cedar'})]);
 expect(listAffiliatedSchools).toHaveBeenCalledWith(2,{orgType:'school'});
 for(const schoolOrganizationId of [8,9,999])await expect(createNeed({agencyId:2,schoolYear:'2026-27',schoolOrganizationId,body:'Additional school provider needed.'})).rejects.toMatchObject({code:'SCHOOL_NEEDS_INVALID_SCHOOL'});
 expect(pool.execute).not.toHaveBeenCalled();
});
