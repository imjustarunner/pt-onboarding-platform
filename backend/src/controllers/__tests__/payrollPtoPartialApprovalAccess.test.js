import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),request:vi.fn(),items:vi.fn(),approve:vi.fn(),period:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollPtoRequest.model.js',()=>({default:{findById:m.request,listItemsForRequest:m.items}}));
vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));
vi.mock('../../services/payrollPto.service.js',async importOriginal=>({...await importOriginal(),approvePtoRequestAndPostToPayroll:m.approve}));
import {patchPtoRequest} from '../payroll.controller.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const request=()=>({params:{id:'89'},user:{id:9,role:'admin'},body:{action:'approve',targetPayrollPeriodId:149,approvalHours:8,approvedByUserId:999,agencyId:6}});
beforeEach(()=>{vi.clearAllMocks();m.request.mockResolvedValue({id:89,agency_id:2,user_id:7});m.items.mockResolvedValue([]);m.period.mockResolvedValue({id:149,agency_id:2,status:'staged'});m.approve.mockResolvedValue({approvedHours:8,remainingHours:7,remainderRequestId:90,affectedPayrollPeriodIds:[149]});m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type')?[[{id:2,organization_type:'agency'}]]:sql.includes('has_payroll_access')?[[{has_payroll_access:1}]]:[[]]);});
it('uses the request agency and authenticated reviewer, forwards only the selected hours, and returns the remainder',async()=>{
 const res=response(),next=vi.fn();await patchPtoRequest(request(),res,next);expect(next).not.toHaveBeenCalled();expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,approvedByUserId:9,requestId:89,targetPayrollPeriodId:149,approvalHours:8}));expect(res.json).toHaveBeenCalledWith(expect.objectContaining({approval:{approvedHours:8,remainingHours:7,remainderRequestId:90}}));
});
it('requires payroll access before approving any portion',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type')?[[{id:2,organization_type:'agency'}]]:[[]]);const res=response();await patchPtoRequest(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.approve).not.toHaveBeenCalled();
});
