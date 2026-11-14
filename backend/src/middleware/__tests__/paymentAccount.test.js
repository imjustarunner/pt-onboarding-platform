import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
vi.mock('../../services/agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn()}));
vi.mock('../../services/familyLedger/policy.js',()=>({requireBillingStaff:vi.fn()}));
vi.mock('../medicalBilling.middleware.js',()=>({requireMedicalBillingFinancialAccess:vi.fn()}));
import {academicPaymentAdministrator} from '../paymentAccount.middleware.js';
const agency={id:453,organization_type:'agency',feature_flags:{standardsLearningEnabled:true,medicalBillingEnabled:false,billingAccountExcluded:true}};
it('permits the actual academic organization administrator without enabling medical or subscription billing',async()=>{
 const access=vi.fn(async()=>({role:'admin'})),db={execute:vi.fn(async()=>[[agency]])};
 expect(await academicPaymentAdministrator({id:1435},453,{db,access})).toBe(true);
 expect(access).toHaveBeenCalledWith(1435,453,db);
 expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 expect(agency.feature_flags.medicalBillingEnabled).toBe(false);expect(agency.feature_flags.billingAccountExcluded).toBe(true);
});
it.each([null,{role:'provider'},{role:'staff'},{role:'support'}])('does not infer payment administrator access from an unrelated global role: %j',async scope=>{
 expect(await academicPaymentAdministrator({id:1435,role:'admin'},453,{db:{execute:async()=>[[agency]]},access:async()=>scope})).toBe(false);
});
it('leaves clinical and inactive organization authorization with the existing financial checks',async()=>{
 const access=vi.fn(async()=>({role:'admin'}));
 expect(await academicPaymentAdministrator({id:1435},453,{db:{execute:async()=>[[{...agency,feature_flags:{}}]]},access})).toBe(false);
 expect(await academicPaymentAdministrator({id:1435},453,{db:{execute:async()=>[[]]},access})).toBe(false);
 expect(access).not.toHaveBeenCalled();
});
