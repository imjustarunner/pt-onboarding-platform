import test from 'node:test';
import assert from 'node:assert/strict';

test('coverage evidence and secondary responsibility remain tenant scoped and preserve paid balances', {skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'}, async t=>{
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:'family_billing_test',USER:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
 const {default:pool}=await import('../../config/database.js'),{default:clinical}=await import('../../config/clinicalDatabase.js');
 const {writeClientInsurance}=await import('../clientInsurance.service.js');
 const {acceptPayer}=await import('../familyBilling.service.js');
 const {BILLING_TERMS_VERSION}=await import('../familyBillingPolicy.service.js');
 const {saveReadiness}=await import('../familyLedger/readiness.js');
 const {setBillingRule,allocationsFor,sourcePayload}=await import('../familyLedger/receivables.js');
 const {setClaimResponsibility}=await import('../familyLedger/sources.js');
 const {recordCash}=await import('../familyLedger/payments.js');
 const {listBalances}=await import('../familyLedger/views.js');
 const {runCoverageCheck,saveCoverageReview,listCoverageEvidence,coverageReviewBlockers,assertCoverageCollectionSafe}=await import('../coverageVerification.service.js');
 const c={agencyId:1,clientId:102,actorUserId:99};
 const primary={payerId:'PRIMARY',memberId:'SYNTHETIC-P',insurerName:'Synthetic primary',subscriberFirstName:'Test',subscriberLastName:'Person',subscriberDob:'2000-01-01',relationshipToSubscriber:'self'};
 const secondary={...primary,payerId:'SECOND',memberId:'SYNTHETIC-S',insurerName:'Synthetic secondary'};
 try{
  await acceptPayer({...c,userId:10,consent:{accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Synthetic payer'}});
  await setBillingRule({...c,kind:'single',shares:[{payerUserId:10,basisPoints:10000}],reason:'Synthetic responsibility agreement'});
  await writeClientInsurance({...c,primary});
  await saveReadiness({...c,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'verified_copay',reason:'Synthetic verified benefit'});
  await clinical.execute("INSERT INTO clinical_sessions VALUES(9000,1,102,'2026-09-20','completed')");
  await clinical.execute('INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id) VALUES(9000,1,102,9000)');
  const responsibility={...c,claimId:9000,amountCents:2500,responsibilityType:'copay',reason:'Synthetic verified benefit'};
  const original=await setClaimResponsibility(responsibility),[allocation]=await allocationsFor(original.id);
  await recordCash({...c,allocationId:allocation.id,payerUserId:10,amountCents:2500,idempotencyKey:'secondary-paid-copay-test',note:'Synthetic existing cash receipt'});
  await t.test('secondary adjudication uses the same paid visit balance and never resets its payment',async()=>{
   await writeClientInsurance({...c,primary,secondary});
   await assert.rejects(saveReadiness({...c,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'verified_copay',reason:'Invalid premature secondary copay'}),/secondary/i);
   await saveReadiness({...c,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'after_era',reason:'Collect only final responsibility'});
   await assert.rejects(setClaimResponsibility(responsibility),/final secondary ERA/);
   await clinical.execute("INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id,parent_claim_id,payer_sequence,destination_payer_id,claimmd_submitted_at) VALUES(9001,1,102,9000,9000,2,'SECOND',CURRENT_TIMESTAMP)");
   await assert.rejects(clinical.execute('INSERT INTO clinical_claims(id,agency_id,parent_claim_id) VALUES(9002,1,9000)'),e=>e.code==='ER_DUP_ENTRY');
   const reviewed=await setClaimResponsibility({...responsibility,claimId:9001,verificationBasis:'era',reason:'Final secondary EOB confirms same responsibility'});
   assert.equal(reviewed.id,original.id);assert.equal(reviewed.status,'paid');assert.equal(sourcePayload(reviewed).finalAdjudicationClaimId,9001);
   assert.equal((await allocationsFor(original.id))[0].paid_cents,2500);
   const [[count]]=await pool.execute("SELECT COUNT(*) AS total FROM family_receivables WHERE agency_id=1 AND source_type='claim_responsibility' AND source_key='9000'");assert.equal(count.total,1);
   const shown=(await listBalances({agencyId:1,userId:10,clientId:102})).find(r=>r.receivableId===original.id);assert.equal(shown.dueCents,0);
   await assert.rejects(setClaimResponsibility({...responsibility,claimId:9001,verificationBasis:'era',amountCents:3000}),/audited adjustment/);
  });
  await t.test('encrypted dated evidence invalidates after a late response and isolates other agencies',async()=>{
   const serviceDate='2026-09-20',requestKey='coverage-integration-one';
   const check=await runCoverageCheck({...c,slot:'primary',serviceDate,requestKey,profile:{officeId:8,billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Synthetic clinic'}},accountKey:'SYNTHETIC-ONLY'},{request:async()=>({elig:{eligid:'SYNTHETIC-RESPONSE',benefit:{benefit_code:'30',benefit_coverage_code:'1'}}})});
   await saveCoverageReview({...c,serviceDate,status:'verified',source:'payer_portal',reference:'Synthetic primary and secondary portal verification',primaryChecked:true,secondaryChecked:true,otherCoverageChecked:true,orderConfirmed:true});
   const evidence=await listCoverageEvidence({...c,serviceDate});assert.equal(evidence.review.status,'verified');assert.equal(Number(evidence.review.has_new_evidence),0);
   assert.equal(evidence.checks[0].evidence.result.elig.eligid,'SYNTHETIC-RESPONSE');await assertCoverageCollectionSafe(1,102);
   assert.equal((await listCoverageEvidence({agencyId:2,clientId:102,serviceDate})).checks.length,0);
   await pool.execute('UPDATE client_coverage_checks SET completed_at=DATE_ADD(CURRENT_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?',[check.id]);
   assert.equal(Number((await listCoverageEvidence({...c,serviceDate})).review.has_new_evidence),1);
   await assert.rejects(assertCoverageCollectionSafe(1,102),/new eligibility/);
   await saveCoverageReview({...c,serviceDate:'2026-09-21',status:'unresolved',source:'payer_portal',reference:'Investigating additional coverage reported by client'});
   const unresolved=await listCoverageEvidence({...c,serviceDate});assert.ok(coverageReviewBlockers({insurance:{primary,secondary},...unresolved}).some(x=>x.includes('latest other-coverage')));
  });
 }finally{await pool.end();await clinical.end();}
});
