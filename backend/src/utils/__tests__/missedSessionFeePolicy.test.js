import test from 'node:test';
import assert from 'node:assert/strict';
import { missedFeeProjection, assertMissedFeeEligibility, validatePackageFeeReview } from '../missedSessionFeePolicy.js';
test('fee share examples and category proportions use actual cash cents', () => {
  assert.equal(missedFeeProjection({category:3,collectedCents:8000}).pendingCents,3200);
  assert.equal(missedFeeProjection({category:2,collectedCents:8000}).pendingCents,2400);
  assert.equal(missedFeeProjection({category:1,collectedCents:2000}).pendingCents,400);
  assert.equal(missedFeeProjection({category:3,collectedCents:0}).pendingCents,0);
});
test('a separately agreed package fee retains credits and rejects retroactive terms or forfeitures',()=>{
  const review={entitlementId:50,agreementReference:'Signed package amendment 100',signedOn:'2026-10-29',effectiveOn:'2026-11-01',permittedFeeCents:2000,separateFeePermitted:true,existingExemptionResolved:true,makeupCreditRetained:true};
  const input={review,entitlementId:50,amountCents:2000,eventDate:'2026-11-10',history:[]};
  assert.equal(validatePackageFeeReview(input).permittedFeeCents,2000);
  for(const changes of [{entitlementId:51},{permittedFeeCents:1999},{signedOn:'2026-11-11'},{effectiveOn:'2026-11-11'},{existingExemptionResolved:false},{makeupCreditRetained:false}])assert.throws(()=>validatePackageFeeReview({...input,review:{...review,...changes}}));
  assert.throws(()=>validatePackageFeeReview({...input,history:[{id:1,reason_code:'SESSION_NOSHOW_FORFEIT',direction:'CONSUME'}]}));
  assert.throws(()=>validatePackageFeeReview({...input,history:[{id:1,reason_code:'BOOKING_RESERVE',direction:'RESERVE'}]}));
  assert.throws(()=>validatePackageFeeReview({...input,history:[{id:1,reason_code:'MISSED_FREE_MISS',direction:'RELEASE'}]}));
  assert.doesNotThrow(()=>validatePackageFeeReview({...input,history:[{id:1,reason_code:'SESSION_NOSHOW_FORFEIT',direction:'CONSUME'},{id:2,reason_code:'MISSED_WAIVER_RESTORE',direction:'CREDIT'}]}));
  assert.doesNotThrow(()=>validatePackageFeeReview({...input,history:[{id:1,reason_code:'MISSED_FREE_MISS',direction:'ADJUST'},{id:2,reason_code:'MISSED_WAIVER_RESTORE',direction:'CREDIT'}]}));
});
test('partial collections round on cumulative proceeds; refunds never produce negative payroll', () => {
  const first=missedFeeProjection({category:2,collectedCents:3333});
  assert.equal(first.pendingCents,1000);
  assert.equal(missedFeeProjection({category:2,collectedCents:10000,approvedCents:first.pendingCents}).pendingCents,2000);
  const refunded=missedFeeProjection({category:3,collectedCents:8000,refundedCents:4000,approvedCents:3200});
  assert.equal(refunded.pendingCents,0);assert.equal(refunded.reviewRequired,true);assert.equal(refunded.entitlementCents,1600);
});
test('invalid amounts or categories cannot create compensation', () => {
  for(const values of [{category:4,collectedCents:8000},{category:1,collectedCents:-1},{category:1,collectedCents:2.5},{category:1,collectedCents:100,refundedCents:101}])assert.throws(()=>missedFeeProjection(values));
});
test('prospective policy, documented agreement, Medicaid and package gates', () => {
  const eligible={status:'no_show',medicaid:false,packageEntitlementId:null,agreementConfirmed:true,evidence:'signed agreement #100',eventDate:'2026-11-10',effectiveOn:'2026-11-01',enabled:true};
  assert.doesNotThrow(()=>assertMissedFeeEligibility(eligible));
  assert.doesNotThrow(()=>assertMissedFeeEligibility({...eligible,status:'late_canceled'}));
  for(const changes of [{status:'completed'},{medicaid:true},{packageEntitlementId:5},{agreementConfirmed:false},{evidence:''},{eventDate:'2026-10-31'},{enabled:false}])assert.throws(()=>assertMissedFeeEligibility({...eligible,...changes}));
});
