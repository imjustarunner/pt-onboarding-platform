import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../clientCoverageAdmission.service.js',()=>({assertClientCoverageAdmission:vi.fn()}));
import {assertClientCoverageAdmission} from '../clientCoverageAdmission.service.js';
import {assertExchangePostingInsurance,isManualExchangeClient} from '../clientExchangePostingInsurance.service.js';
const database={execute:vi.fn()},client={id:3,agency_id:2,source:'PUBLIC_OFFICE_INTAKE'};
beforeEach(()=>{vi.clearAllMocks();assertClientCoverageAdmission.mockResolvedValue({ready:true,required:true});});
it('exempts a server-created manual Exchange add without asserting or changing verification',async()=>{
 const manual={...client,source:'ADMIN_CREATED',intake_preferences_json:{exchangeReferral:{requestId:'11111111-1111-4111-8111-111111111111'}}};
 expect(isManualExchangeClient(manual)).toBe(true);
 await expect(assertExchangePostingInsurance({client:manual,database})).resolves.toEqual({required:false,reason:'manual_exchange_add'});
 expect(assertClientCoverageAdmission).not.toHaveBeenCalled();expect(database.execute).not.toHaveBeenCalled();
});
it('does not let a submitted manual flag or an enrollment snapshot bypass transfer verification',async()=>{
 assertClientCoverageAdmission.mockRejectedValue(Object.assign(Error('Insurance verification required'),{status:409,code:'INSURANCE_VERIFICATION_REQUIRED'}));
 await expect(assertExchangePostingInsurance({client:{...client,email:'demo@example.com',manual:true,intake_preferences_json:{exchangeReferral:{requestId:'11111111-1111-4111-8111-111111111111'}}},database})).rejects.toMatchObject({code:'INSURANCE_VERIFICATION_REQUIRED',status:409});
 expect(isManualExchangeClient({...client,source:'ADMIN_CREATED'})).toBe(false);
});
it('retains the central current-coverage, agency and explicit-self-pay policy for transferred clients',async()=>{
 await expect(assertExchangePostingInsurance({client,database})).resolves.toEqual({ready:true,required:true});
 expect(assertClientCoverageAdmission).toHaveBeenCalledWith(3,{db:database});
 assertClientCoverageAdmission.mockResolvedValue({ready:true,required:false,selfPay:true});
 await expect(assertExchangePostingInsurance({client,database})).resolves.toMatchObject({selfPay:true});
});
