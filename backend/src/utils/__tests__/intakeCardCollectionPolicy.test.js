import {expect,it} from 'vitest';
import {assertIntakeCardCollectionAllowed as allowed} from '../intakeCardCollectionPolicy.js';
import {enrollmentCoverageFingerprint} from '../../../../frontend/src/navigation/enrollmentCoveragePolicy.js';
const request=(info,extra={})=>({link:{master_channel:'counseling'},submission:{intake_data:{responses:{submission:{insuranceInfo:info}}}},reviewed:true,fingerprint:enrollmentCoverageFingerprint(info),...extra});
it.each([{primary:{insurerName:'Medicaid'}},{primary:{insurerName:'Commercial'},secondary:{insurerName:'Health First Colorado'}},{primaryIsMedicaid:true},{clientCoverages:[{primary:{isMedicaid:true},confirmed:false}]}])('suppresses declared primary/secondary/per-child Medicaid before a gateway call %j',info=>{
 expect(()=>allowed(request(info))).toThrow(/Medicaid/);
});
it('allows reviewed commercial and self-pay but rejects a missing or changed coverage confirmation',()=>{
 for(const info of [{isSelfPay:true},{primary:{insurerName:'Commercial',memberId:'SYNTHETIC-ONLY'}}]){
  expect(allowed(request(info))).toEqual({fingerprint:enrollmentCoverageFingerprint(info)});
  expect(()=>allowed(request(info,{reviewed:false}))).toThrow(/Confirm/);
  expect(()=>allowed(request(info,{fingerprint:'stale'}))).toThrow(/Coverage changed/);
 }
 expect(()=>allowed(request({}))).toThrow(/Enter and review/);
});
it('uses server-resolved insurance on file, allows non-Medicaid commercial and suppresses either Medicaid position',()=>{
 const info={useInsuranceOnFile:true};
 expect(allowed(request(info,{onFileInsurance:[{primary:{insurerName:'Commercial'}}]}))).toHaveProperty('fingerprint');
 for(const onFileInsurance of [[{primary:{insurerName:'Medicaid'}}],[{primary:{insurerName:'Commercial'},secondary:{isMedicaid:true}}]])expect(()=>allowed(request(info,{onFileInsurance}))).toThrow(/Medicaid/);
 for(const onFileInsurance of [null,[],[null],[{primary:{}}]])expect(()=>allowed(request(info,{onFileInsurance}))).toThrow(/Existing coverage needs review/);
});
it('does not let additional commercial answers remove a stored Medicaid protection',()=>{
 expect(()=>allowed(request({primary:{insurerName:'Additional commercial'}},{onFileInsurance:[{primary:{insurerName:'Medicaid'}}]}))).toThrow(/Medicaid/);
});
