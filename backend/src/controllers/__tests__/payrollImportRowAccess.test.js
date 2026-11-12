import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),period:vi.fn(),row:vi.fn(),summary:vi.fn(),allRows:vi.fn(),fees:vi.fn(),save:vi.fn(),batch:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));
vi.mock('../../models/PayrollImportRow.model.js',()=>({default:{findById:m.row,listForPeriod:m.allRows}}));
vi.mock('../../models/PayrollSummary.model.js',()=>({default:{listForPeriod:m.summary}}));
vi.mock('../../models/PayrollImportMissedAppointment.model.js',()=>({default:{listAggregatedForPeriod:m.fees}}));
vi.mock('../../services/payrollImportRowEdit.service.js',()=>({savePayrollImportProcessing:m.save}));
vi.mock('../../services/payrollDraftBatch.service.js',()=>({savePayrollDraftBatch:m.batch}));
import {getPayrollPeriod,patchPayrollImportRow,savePayrollDraftDecisions} from '../payroll.controller.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const request=(extra={})=>({params:{id:'12',rowId:'4'},query:{},user:{id:501,role:'super_admin'},body:{processed:true,deferPayrollRecompute:true},...extra});
beforeEach(()=>{vi.clearAllMocks();m.period.mockResolvedValue({id:12,agency_id:2,status:'ran'});m.row.mockResolvedValue({id:4,agency_id:2,payroll_period_id:12});m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type FROM agencies')?[[{id:2,organization_type:'agency'}]]:[[]]);m.fees.mockResolvedValue([]);m.summary.mockResolvedValue([]);});
it('keeps payroll access checks before a fast processing save or lightweight read',async()=>{
 for(const handler of [getPayrollPeriod,patchPayrollImportRow,savePayrollDraftDecisions]){const res=response();await handler(request({user:{id:7,role:'provider'},query:{view:'raw-review'}}),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(m.save).not.toHaveBeenCalled();expect(m.batch).not.toHaveBeenCalled();expect(m.fees).not.toHaveBeenCalled();
});
it('uses the row-derived period and agency for fast edits and ignores client scope overrides',async()=>{
 const req=request();Object.assign(req.body,{agencyId:6,periodId:999,unitCount:23});const next=vi.fn();await patchPayrollImportRow(req,response(),next);expect(next).not.toHaveBeenCalled();expect(m.save).toHaveBeenCalledWith({rowId:4,periodId:12,agencyId:2,actorUserId:501,unitCount:23,processed:true,allowPostedProcessing:false});
});
it('does not unlock a posted edit without explicit processing permission',async()=>{
 m.period.mockResolvedValue({id:12,agency_id:2,status:'posted'});const res=response();await patchPayrollImportRow(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(409);expect(m.save).not.toHaveBeenCalled();
});
it.each(['raw-review','wizard'])('loads only the data needed by the %s view',async view=>{
 const res=response(),next=vi.fn();await getPayrollPeriod(request({query:{view}}),res,next);expect(next).not.toHaveBeenCalled();expect(m.allRows).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.includes('COUNT(*)'))).toBe(false);
 if(view==='wizard'){expect(m.summary).toHaveBeenCalledWith(12);expect(m.fees).not.toHaveBeenCalled();}else{expect(m.fees).toHaveBeenCalledWith({payrollPeriodId:12,agencyId:2});expect(m.summary).not.toHaveBeenCalled();}
});

it('scopes a bulk draft decision to the authorized period rather than the client agency',async()=>{m.batch.mockResolvedValue({ok:true});const req=request({body:{agencyId:6,importId:20,decisions:[{id:4,expectedDraftPayable:1}],draftPayable:false}}),res=response();await savePayrollDraftDecisions(req,res,vi.fn());expect(m.batch).toHaveBeenCalledWith(expect.objectContaining({periodId:12,agencyId:2,actorUserId:501,importId:20,draftPayable:false}));});
