import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),period:vi.fn(),preview:vi.fn(),connect:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));vi.mock('../../services/payrollProviderConnection.service.js',()=>({previewPayrollProviderConnection:m.preview,connectPayrollProvider:m.connect}));
import {getPayrollProviderConnection,savePayrollProviderConnection} from '../payroll.controller.js';
const request=()=>({params:{id:'149'},user:{id:9,role:'admin'},query:{providerName:'Synthetic Provider',targetUserId:'474'},body:{providerName:'Synthetic Provider',targetUserId:474,reviewToken:'review',confirmedSamePerson:true,agencyId:6,actorUserId:999}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();m.period.mockResolvedValue({id:149,agency_id:2});m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type')?[[{id:2,organization_type:'agency'}]]:sql.includes('has_payroll_access')?[[{has_payroll_access:1}]]:[[]]);});
it('requires agency payroll access before showing historical profiles or connecting any rows',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type')?[[{id:2,organization_type:'agency'}]]:[[]]);for(const handler of [getPayrollProviderConnection,savePayrollProviderConnection]){const res=response();await handler(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(m.preview).not.toHaveBeenCalled();expect(m.connect).not.toHaveBeenCalled();
});
it('binds the connection to the period agency and signed-in reviewer, ignoring supplied identities',async()=>{
 await savePayrollProviderConnection(request(),response(),vi.fn());expect(m.connect).toHaveBeenCalledWith({agencyId:2,periodId:149,providerName:'Synthetic Provider',targetUserId:474,reviewToken:'review',confirmedSamePerson:true,actorUserId:9});
});
it('marks preview responses no-store',async()=>{
 const res=response();await getPayrollProviderConnection(request(),res,vi.fn());expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(m.preview).toHaveBeenCalledWith({agencyId:2,periodId:149,providerName:'Synthetic Provider',targetUserId:'474'});
});
