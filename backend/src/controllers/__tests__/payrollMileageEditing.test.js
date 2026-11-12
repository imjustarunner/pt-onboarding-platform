import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),update:vi.fn(),approve:vi.fn(),unapprove:vi.fn(),period:vi.fn(),rates:vi.fn(),settings:vi.fn(),tiers:vi.fn(),travel:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/PayrollMileageClaim.model.js',()=>({default:{findById:m.find,updateApproved:m.update,approve:m.approve,unapprove:m.unapprove}}));
vi.mock('../../models/PayrollPeriod.model.js',()=>({default:{findById:m.period}}));
vi.mock('../../models/AgencyMileageRate.model.js',()=>({default:{listForAgency:m.rates,getSettings:m.settings}}));
vi.mock('../../services/mileageBenefitTier.service.js',async original=>({...await original(),loadMileageBenefitTiers:m.tiers}));
vi.mock('../../services/eventTravelReport.service.js',async original=>({...await original(),assertEventTravelReviewed:m.travel}));
import { patchMileageClaim } from '../payroll.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const request=body=>({user:{id:501,role:'super_admin'},params:{id:'204'},body:{overrideDeadline:true,...body}});
beforeEach(()=>{
 vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('SELECT id, organization_type FROM agencies')?[[{id:2,organization_type:'agency'}]]:[[]]);
 m.find.mockResolvedValue({id:204,agency_id:2,user_id:482,status:'approved',claim_type:'school_travel',drive_date:'2026-10-29',created_at:'2026-11-05',eligible_miles:1.75,applied_amount:.61,target_payroll_period_id:149,tier_level:2,rate_per_mile:.35});
 m.period.mockImplementation(async id=>({id,agency_id:2,status:'staged',period_start:'2026-10-24',period_end:'2026-11-06'}));
 m.settings.mockResolvedValue({standard_mileage_rate_per_mile:.7,standard_mileage_uses_tier_rates:0});m.rates.mockResolvedValue([{tier_level:1,rate_per_mile:0},{tier_level:2,rate_per_mile:.35}]);
 m.tiers.mockResolvedValue(new Map([[482,{tierLevel:2,periodEnd:'2026-10-23'}]]));m.travel.mockResolvedValue(null);
 m.update.mockImplementation(async o=>({id:o.id,status:'approved',applied_amount:o.appliedAmount,target_payroll_period_id:o.targetPayrollPeriodId}));
 m.approve.mockImplementation(m.update);
});
it('moves approved mileage to the chosen open period and recomputes at the current benefit tier',async()=>{
 const response=res(),next=vi.fn();await patchMileageClaim(request({action:'move',targetPayrollPeriodId:148}),response,next);
 expect(next).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({id:204,expectedPeriodId:149,targetPayrollPeriodId:148,tierLevel:2,ratePerMile:.35,appliedAmount:.61}));
});
it('saves corrected eligible miles and tier for an approved claim',async()=>{
 const next=vi.fn();await patchMileageClaim(request({action:'update',eligibleMiles:4,tierLevel:2}),res(),next);
 expect(next).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({eligibleMiles:4,tierLevel:2,appliedAmount:1.4,targetPayrollPeriodId:149}));
});
it('rejects an old Tier 1 selection instead of silently underpaying',async()=>{
 const next=vi.fn();await patchMileageClaim(request({action:'update',tierLevel:1}),res(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.update).not.toHaveBeenCalled();
});
it.each(['posted','metadata','other-agency'])('refuses a locked or foreign destination: %s',async scenario=>{
 m.period.mockResolvedValue({id:148,agency_id:scenario==='other-agency'?6:2,status:scenario==='posted'?'posted':'ran',posted_at:scenario==='metadata'?'2026-11-11':null});
 const response=res();await patchMileageClaim(request({action:'move',targetPayrollPeriodId:148}),response,vi.fn());
 expect(response.status).toHaveBeenCalledWith(scenario==='other-agency'?400:409);expect(m.update).not.toHaveBeenCalled();
});
it('does not move a claim out of a posted source period',async()=>{
 m.period.mockImplementation(async id=>({id,agency_id:2,status:id===149?'posted':'staged',period_start:'2026-10-24',period_end:'2026-11-06'}));
 const response=res();await patchMileageClaim(request({action:'move',targetPayrollPeriodId:148}),response,vi.fn());expect(response.status).toHaveBeenCalledWith(409);expect(m.update).not.toHaveBeenCalled();
});
it('requires an approved status before editing',async()=>{
 m.find.mockResolvedValue({...await m.find(),status:'submitted'});const response=res();await patchMileageClaim(request({action:'update',eligibleMiles:4}),response,vi.fn());expect(response.status).toHaveBeenCalledWith(409);expect(m.update).not.toHaveBeenCalled();
});
it('approves missing-tier claims using current entitlement and a conditional write',async()=>{
 m.find.mockResolvedValue({...await m.find(),status:'submitted',tier_level:null,target_payroll_period_id:null});const next=vi.fn();await patchMileageClaim(request({action:'approve',targetPayrollPeriodId:148}),res(),next);
 expect(next).not.toHaveBeenCalled();expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({tierLevel:2,ratePerMile:.35,appliedAmount:.61,requireSubmitted:true}));
});
it('accepts a configured zero-dollar Tier 1 benefit and rejects a missing rate',async()=>{
 m.find.mockResolvedValue({...await m.find(),status:'submitted'});m.tiers.mockResolvedValue(new Map([[482,{tierLevel:1}]]));
 const next=vi.fn();await patchMileageClaim(request({action:'approve',targetPayrollPeriodId:148}),res(),next);
 expect(next).not.toHaveBeenCalled();expect(m.approve).toHaveBeenCalledWith(expect.objectContaining({tierLevel:1,ratePerMile:0,appliedAmount:0}));
 m.rates.mockResolvedValue([]);await patchMileageClaim(request({action:'approve',targetPayrollPeriodId:148}),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
});
it('preserves an explicit correction to zero eligible miles',async()=>{
 const next=vi.fn();await patchMileageClaim(request({action:'update',eligibleMiles:0}),res(),next);
 expect(next).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({eligibleMiles:0,appliedAmount:0}));
});
