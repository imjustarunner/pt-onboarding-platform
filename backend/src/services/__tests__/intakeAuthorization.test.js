import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {validateIntakeBilling} from '../intakeBillingValidation.service.js';
const input=info=>({agencyId:450,submission:{id:1},link:{inherits_office_master:1,intake_steps:[{type:'insurance_info'}]},intakeData:{responses:{submission:{insuranceInfo:{isSelfPay:true,...info},paymentInfo:{skipAcknowledged:true,requiresPaymentFollowup:true}}}}});
beforeEach(()=>pool.execute.mockReset());
it.each([{}, {authorizationAgreed:true},{authorizationSignature:'QA Parent'},{authorizationAgreed:false,authorizationSignature:'QA Parent'}])('rejects incomplete self-pay authorization before checking card availability: %j',async info=>{await expect(validateIntakeBilling(input(info))).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();});
it('allows payment follow-up when the authorization is complete and card collection is unavailable',async()=>{pool.execute.mockResolvedValue([[]]);await validateIntakeBilling(input({authorizationAgreed:true,authorizationSignature:'QA Parent'}));expect(pool.execute).toHaveBeenCalledTimes(1);});
it('preserves the standalone school signature flow that does not display a checkbox',async()=>{const data=input({authorizationSignature:'QA Parent'});data.link={scope_type:'school',intake_steps:[{type:'insurance_info'}]};await validateIntakeBilling(data);expect(pool.execute).not.toHaveBeenCalled();});
