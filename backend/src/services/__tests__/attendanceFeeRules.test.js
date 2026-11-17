import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),find:vi.fn(),placement:vi.fn(),funding:vi.fn(),entitlement:vi.fn(),pkg:vi.fn()}));
vi.mock('../../models/BookingCancellationPolicy.model.js',()=>({default:{listForAgency:m.list,findById:m.find}}));
vi.mock('../../models/BookingPackage.model.js',()=>({default:{findEntitlementById:m.entitlement,findById:m.pkg}}));
vi.mock('../attendanceFeeRuleContext.service.js',async original=>({...await original(),providerAttendanceFeeContext:m.placement,attendanceFundingType:m.funding}));
import {listCandidatePolicies,pickWinningPolicy,resolvePolicyForAppointmentContext} from '../bookingCancellationPolicy.service.js';
import {attendanceFeeRuleMatches} from '../attendanceFeeRuleContext.service.js';
beforeEach(()=>{vi.resetAllMocks();m.list.mockResolvedValue([]);m.find.mockResolvedValue(null);m.placement.mockResolvedValue({providerCategory:1,providerLevel:2,customerTierId:'L4'});m.funding.mockResolvedValue('self_pay');});
it('applies platform defaults, then organization, payer, service, category, package and explicit appointment terms',()=>{
 const scopes=['platform','affiliation','tenant','business_type','payer','service','rate_category','package','appointment'];
 const rules=scopes.map((scopeLevel,i)=>({id:i+1,scopeLevel}));
 for(let i=1;i<=rules.length;i++)expect(pickWinningPolicy(rules.slice(0,i)).scopeLevel).toBe(scopes[i-1]);
 expect(pickWinningPolicy(rules,{appointmentPolicyId:3}).id).toBe(3);
});
it('distinguishes employee placement from the customer pricing tier and matches all selected filters',()=>{
 const rule={providerCategory:1,providerLevel:2,customerTierId:'L4',payerType:'self_pay',serviceCode:'TUTORING',modality:'IN_PERSON'};
 expect(attendanceFeeRuleMatches(rule,{...rule})).toBe(true);
 for(const [key,value] of Object.entries({providerCategory:4,providerLevel:1,customerTierId:'L1',payerType:'medicaid',serviceCode:'H2014',modality:'TELEHEALTH'}))expect(attendanceFeeRuleMatches(rule,{...rule,[key]:value})).toBe(false);
});
it('matches generic insurance to specific coverage but prefers an exact Medicaid rule at the same scope',()=>{
 const generic={id:1,scopeLevel:'payer',payerType:'insurance'},medicaid={id:2,scopeLevel:'payer',payerType:'medicaid'};
 expect(attendanceFeeRuleMatches(generic,{payerType:'medicaid'})).toBe(true);
 expect(attendanceFeeRuleMatches(generic,{payerType:'self_pay'})).toBe(false);
 expect(pickWinningPolicy([generic,medicaid]).id).toBe(2);
});
it('uses the effective service placement while excluding other agencies and nonmatching formats',async()=>{
 m.list.mockResolvedValue([{id:1,agencyId:null,scopeLevel:'platform'},{id:2,agencyId:453,scopeLevel:'rate_category',providerCategory:1,customerTierId:'L4',modality:'IN_PERSON'},{id:3,agencyId:453,scopeLevel:'rate_category',providerCategory:4}]);
 const rules=await listCandidatePolicies(453,{businessType:'tutoring',providerUserId:1496,startAt:'2030-01-01 17:00:00',modality:'IN_PERSON'});
 expect(rules.map(p=>p.id)).toEqual([1,2]);expect(m.placement).toHaveBeenCalledWith(expect.objectContaining({agencyId:453,providerUserId:1496,startAt:'2030-01-01 17:00:00'}));
 expect(m.list).toHaveBeenCalledWith(453,{includeInactive:false,includePlatform:true});
});
it('preserves a booked inactive version without accepting another organization’s override',async()=>{
 m.list.mockResolvedValue([{id:2,scopeLevel:'tenant',agencyId:453,createdAt:'2030-01-02 00:00:00'}]);
 m.find.mockResolvedValue({id:1,scopeLevel:'tenant',agencyId:453,isActive:false,lateFeeCents:1500});
 expect(await listCandidatePolicies(453,{appointmentPolicyId:1,policyAsOf:'2030-01-01 00:00:00'})).toEqual([expect.objectContaining({id:1,isActive:false,lateFeeCents:1500})]);
 m.find.mockResolvedValue({id:9,scopeLevel:'appointment',agencyId:6});
 expect(await listCandidatePolicies(453,{appointmentPolicyId:9,policyAsOf:'2030-01-01 00:00:00'})).toEqual([]);
});
it('does not add newly configured fees to an older booking without a policy snapshot',async()=>{
 m.list.mockResolvedValue([{id:1,scopeLevel:'platform',createdAt:'2030-01-02 00:00:00'},{id:2,scopeLevel:'tenant',createdAt:'2029-01-01 00:00:00'}]);
 expect((await listCandidatePolicies(453,{policyAsOf:'2030-01-01 00:00:00'})).map(p=>p.id)).toEqual([2]);
});
it('uses purchased package terms even if the catalog entry was removed or later changed',async()=>{
 m.list.mockResolvedValue([{id:1,scopeLevel:'platform',noShowFeeCents:2200}]);m.entitlement.mockResolvedValue({packageId:76,businessType:'tutoring',pricingSnapshot:{policies:{noShowPolicy:'fee',lateCancelPolicy:'free_rebook',missedFeeCents:100,cancellationNoticeHours:12}}});m.pkg.mockResolvedValue(null);
 const {policy}=await resolvePolicyForAppointmentContext({agencyId:453,packageEntitlementId:1114});
 expect(policy).toMatchObject({scopeLevel:'package',noShowFeeCents:100,lateFeeCents:0,noticeHours:12,latePackageAction:'release'});
});
