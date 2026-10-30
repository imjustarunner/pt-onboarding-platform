import {it,expect} from 'vitest';
import {reconcileDirectCareIndirect} from '../directCareIndirectReconciliation.js';
const breakdown={__paySystem:{lines:[{serviceCode:'H0004',payType:'hcode',units:44,hourEquivalent:11,autoIndirectRate:20},{serviceCode:'H0031',payType:'hcode',units:21,hourEquivalent:.35,autoIndirectRate:20},{serviceCode:'99414',payType:'indirect',hourEquivalent:2,rate:20}]}};
it('subtracts only documented overlapping time and preserves separately paid duties',()=>{
 const result=reconcileDirectCareIndirect({breakdown,overlapMinutes:55,overlapAmount:18.33});
 expect(result.additionalMinutes).toBeCloseTo(58.5);expect(result.additionalAmount).toBe(19.5);
 expect(reconcileDirectCareIndirect({breakdown}).additionalAmount).toBe(37.83);
});
it('retains a salary-only arrangement and never reclaims an excess prior payment',()=>{
 expect(reconcileDirectCareIndirect({breakdown:{...breakdown,__adjustments:{basePayIsSalaryOverride:true,salaryIncludeServicePay:false}}}).additionalAmount).toBe(0);
 expect(reconcileDirectCareIndirect({breakdown,overlapMinutes:200,overlapAmount:80}).additionalAmount).toBe(0);
});
it('subtracts an automatic allowance already present in a saved statement',()=>{
 expect(reconcileDirectCareIndirect({breakdown:{__paySystem:{lines:[{payType:'hcode',hourEquivalent:1,autoIndirectRate:18,autoIndirectHours:1/6,autoIndirectAmount:3}]}}}).additionalAmount).toBe(0);
});
