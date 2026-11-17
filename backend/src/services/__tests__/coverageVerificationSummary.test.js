import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {readCoverageVerificationSummary} from '../coverageVerificationSummary.service.js';
import {coverageInsuranceFingerprint} from '../../utils/paperInsuranceReviewGate.js';
it('shows actual verification dates while identifying stale or changed policy evidence',async()=>{
 const insurance={primary:{insurerName:'Example',memberId:'001'}},now=new Date('2026-11-17T12:00:00Z');
 const row={status:'verified',created_at:'2026-11-16T12:00:00Z',service_date:'2026-11-17',insurance_fingerprint:coverageInsuranceFingerprint(insurance)};
 const db={execute:vi.fn(async()=>[[row]])};
 expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:true,verifiedAt:row.created_at});
 row.insurance_fingerprint='old';expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:false,verifiedAt:row.created_at});
 row.status='unresolved';expect(await readCoverageVerificationSummary({agencyId:2,clientId:5},insurance,db,now)).toMatchObject({current:false,verifiedAt:null});
});
