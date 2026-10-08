import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),report:vi.fn(),agency:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../services/annualMileage.service.js',()=>({getAnnualMileageReport:m.report}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
import {getMileageAnnualSummary} from '../payroll.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();m.execute.mockImplementation(async sql=>sql.includes('FROM agencies')?[[{id:2,organization_type:'agency'}]]:[[{has_payroll_access:0}]]);m.agency.mockResolvedValue({id:2,slug:'itsco'});m.report.mockResolvedValue({year:2026,limitDollars:2000,people:[]});});
it.each(['provider','admin','support'])('does not expose payroll limits to %s without payroll permission',async role=>{
 const r=res(),next=vi.fn();await getMileageAnnualSummary({user:{id:8,role},query:{agencyId:'2',year:'2026'},method:'GET'},r,next);
 expect(r.status).toHaveBeenCalledWith(403);expect(m.report).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
});
it('allows superadmin and marks the response private/no-store',async()=>{
 const r=res(),next=vi.fn();await getMileageAnnualSummary({user:{id:8,role:'super_admin'},query:{agencyId:'2',year:'2026'},method:'GET'},r,next);
 expect(next).not.toHaveBeenCalled();expect(m.report).toHaveBeenCalledWith({agencyId:2,agency:{id:2,slug:'itsco'},year:'2026'});expect(r.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
