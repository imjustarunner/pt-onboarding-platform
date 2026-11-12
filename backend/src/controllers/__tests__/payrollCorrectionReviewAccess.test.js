import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),period:vi.fn(),build:vi.fn(),post:vi.fn(),additional:vi.fn(),resolve:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));
vi.mock('../../services/payrollCorrectionReview.service.js',()=>({buildPayrollCorrectionReview:m.build,postPayrollCorrectionReduction:m.post,postPayrollCorrectionAdditionalPay:m.additional,resolvePayrollCorrection:m.resolve}));
import {getPayrollCorrectionReview,postPayrollCorrectionReview,postPayrollCorrectionAddition,savePayrollCorrectionResolution,listPayrollCorrectionResolutions} from '../payroll.controller.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn().mockReturnThis()});
const req=(method='GET',role='super_admin')=>({method,user:{id:501,role},params:{id:'12'},query:{sourcePayrollPeriodId:11,baselineRowId:1,compareRowId:2},body:{sourcePayrollPeriodId:11,baselineRowId:1,compareRowId:2,reviewToken:'reviewed'}});
beforeEach(()=>{vi.clearAllMocks();m.period.mockResolvedValue({id:12,agency_id:2});m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type FROM agencies')?[[{id:2,organization_type:'agency'}]]:[[]]);});
it('requires payroll access before inspecting the source session',async()=>{const res=response();await getPayrollCorrectionReview(req('GET','provider'),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.build).not.toHaveBeenCalled();});
it('does not accept the source agency or a client-calculated amount from the request',async()=>{const r=req('POST');r.body.agencyId=6;r.body.amount=999;const next=vi.fn();await postPayrollCorrectionReview(r,response(),next);expect(next).not.toHaveBeenCalled();expect(m.post).toHaveBeenCalledWith({agencyId:2,destinationPeriodId:12,sourcePayrollPeriodId:11,baselineRowId:1,compareRowId:2,reviewToken:'reviewed',actorUserId:501});});
it('marks previews no-store and validates source identifiers',async()=>{const res=response();await getPayrollCorrectionReview(req(),res,vi.fn());expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');const r=req();r.query.baselineRowId='bad';const rejected=response();await getPayrollCorrectionReview(r,rejected,vi.fn());expect(rejected.status).toHaveBeenCalledWith(400);});

it('routes reviewed underpayments to the positive-adjustment command without accepting a client amount',async()=>{
 const r=req('POST');r.body.amount=-100;await postPayrollCorrectionAddition(r,response(),vi.fn());expect(m.additional).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,actorUserId:501,reviewToken:'reviewed'}));expect(m.post).not.toHaveBeenCalled();
});

it('requires payroll access for both resolution history and waiver writes',async()=>{
 for(const controller of [listPayrollCorrectionResolutions,savePayrollCorrectionResolution]){const res=response();await controller(req('POST','provider'),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);}expect(m.resolve).not.toHaveBeenCalled();
});
it('records the signed-in waiver actor rather than a client-supplied account',async()=>{
 const r=req('POST');Object.assign(r.body,{actorUserId:777,agencyId:6,resolution:'waived',reason:'Reviewed',confirmed:true});const next=vi.fn();await savePayrollCorrectionResolution(r,response(),next);expect(next).not.toHaveBeenCalled();expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,actorUserId:501,resolution:'waived',reason:'Reviewed',confirmed:true}));
});
