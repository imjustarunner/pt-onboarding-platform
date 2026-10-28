import {beforeEach,expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
import {authorizedCompensationSchedule} from '../payrollCompensationAuthorization.service.js';
import {effectiveCompensationAgreement,latestEmploymentAgreementDate} from '../employmentAgreementPolicy.service.js';
const data={draftKind:'provider_update_compensation',effectiveDate:'2026-10-10',compensationPolicyVersion:'itsco-2026-10-service-credit-v3',schedule:{category:2,level:2,creditRate:44}};
const authorization={id:1,contract_generation_id:47,effective_start:'2026-10-10',approved_by_user_id:501,approved_at:'2026-10-28',reason:'Explicit payroll approval',snapshot_json:data};
let signed,approved;
beforeEach(()=>{signed=[];approved=[authorization];execute.mockReset().mockImplementation(async sql=>[sql.includes('payroll_compensation_authorizations')?approved:signed]);});
it('activates an explicitly approved schedule without claiming a signature',async()=>{
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-10-23'})).toMatchObject({effectiveOn:'2026-10-10',executed:false,payrollAuthorized:true,approvedByUserId:501});
 expect(await latestEmploymentAgreementDate(1249)).toBeNull();
 expect(execute.mock.calls.find(([sql])=>sql.includes('payroll_compensation_authorizations'))[1]).toEqual([2,1249]);
});
it('preserves earlier service dates and later individual starts',async()=>{
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-10-09'})).toBeNull();
 approved=[{...authorization,effective_start:'2026-10-24'}];
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-10-23'})).toBeNull();
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-10-24'})).toMatchObject({effectiveOn:'2026-10-24'});
});
it('does not move approved payroll dates when a countersignature arrives later',async()=>{
 signed=[{id:47,token_values_json:data,signed_pdf_path:'private/signed.pdf',audit_trail:{adminCountersign:{signedAt:'2026-10-28'}}}];
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-11-06'})).toMatchObject({effectiveOn:'2026-10-10',executed:true,payrollAuthorized:true});
});
it.each([{revoked_at:'2026-10-28'},{approved_by_user_id:null},{approved_at:null},{reason:''},{effective_start:'2026-02-30'}])('rejects invalid or revoked approval %j',changes=>{
 expect(authorizedCompensationSchedule({...authorization,...changes})).toBeNull();
});
it('still requires execution when no payroll approval exists',async()=>{
 approved=[];signed=[{id:47,token_values_json:data,signed_pdf_path:'private/signed.pdf',audit_trail:{}}];
 expect(await effectiveCompensationAgreement({agencyId:2,userId:1249,asOfDate:'2026-10-23'})).toBeNull();
});
