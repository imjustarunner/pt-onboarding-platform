import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:value=>JSON.parse(value)}));
import {latestPayerResponses,readCoverageVerificationSummary} from '../coverageVerificationSummary.service.js';
import {coverageInsuranceFingerprint} from '../../utils/paperInsuranceReviewGate.js';
it('shows actual verification dates while identifying stale or changed policy evidence',async()=>{
 const insurance={primary:{insurerName:'Example',memberId:'001'}},now=new Date('2026-11-17T12:00:00Z');
 const row={status:'verified',created_at:'2026-11-16T12:00:00Z',service_date:'2026-11-17',insurance_fingerprint:coverageInsuranceFingerprint(insurance)};
 const db={execute:vi.fn(async()=>[[row]])};
 expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:true,verifiedAt:row.created_at});
 row.insurance_fingerprint='old';expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:false,verifiedAt:row.created_at});
 row.status='unresolved';expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:false,verifiedAt:null});
});

it('shows a dated payer verification only for a returned, identity-matched active policy',async()=>{
 const insurance={primary:{insurerName:'Example',memberId:'001'}};
 const row={policy_slot:'primary',status:'returned',service_date:'2026-11-18',completed_at:'2026-11-18T15:00:00Z'};
 const db={execute:vi.fn()};
 for(const [identityMatches,verified] of [[true,true],[false,false],[null,false]]){
   db.execute.mockResolvedValue([[{...row,evidence_encrypted:JSON.stringify({summary:{identityMatches,status:'active_reported'}})}]]);
   expect((await latestPayerResponses({agencyId:2,clientId:5},insurance,db)).primary).toMatchObject({verified,serviceDate:row.service_date});
 }
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('insurance_fingerprint=?'),[2,5,coverageInsuranceFingerprint(insurance)]);
});
