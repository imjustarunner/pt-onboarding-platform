import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {validateIntakeBilling} from '../intakeBillingValidation.service.js';
beforeEach(()=>vi.clearAllMocks());
const input=()=>({agencyId:2,submission:{id:1},link:{inherits_office_master:1,intake_steps:[{type:'insurance_info',paymentRequired:true}]},intakeData:{responses:{submission:{insuranceInfo:{useInsuranceOnFile:true}}}}});
it('does not trust a browser claim that insurance is already on file',async()=>{await expect(validateIntakeBilling(input())).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();});
it('does not require another card when an invitation’s existing coverage has been verified',async()=>{await validateIntakeBilling({...input(),insuranceOnFileApproved:true});expect(pool.execute).not.toHaveBeenCalled();});
