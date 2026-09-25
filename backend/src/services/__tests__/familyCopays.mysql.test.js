import test from 'node:test';
import assert from 'node:assert/strict';

test('copay readiness, portal balances, automatic collection and reconciliation use one ledger', {skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'}, async t=>{
  for(const [key,value] of Object.entries({DB_HOST:'127.0.0.1',DB_PORT:'33316',DB_NAME:'family_billing_test',DB_USER:'family_billing_test',CLINICAL_DB_HOST:'127.0.0.1',CLINICAL_DB_PORT:'33316',CLINICAL_DB_NAME:'family_billing_test'}))assert.equal(process.env[key],value);
  const {default:pool}=await import('../../config/database.js');
  const {default:clinical}=await import('../../config/clinicalDatabase.js');
  const {default:Stripe}=await import('../stripePayments.service.js');
  const {default:Cards}=await import('../../models/GuardianPaymentCard.model.js');
  const {acceptPayer,assignCard}=await import('../familyBilling.service.js');
  const {BILLING_TERMS_VERSION}=await import('../familyBillingPolicy.service.js');
  const {writeClientInsurance}=await import('../clientInsurance.service.js');
  const {saveReadiness}=await import('../familyLedger/readiness.js');
  const {createReceivable,allocationsFor,updateBalanceReview,adjustBalance,setBillingRule}=await import('../familyLedger/receivables.js');
  const {payAllocation,recordCash,finalizePayment,reconcileSavedPayment}=await import('../familyLedger/payments.js');
  const {refundPayment}=await import('../familyLedger/refunds.js');
  const {listBalances,receiptFor,renderReceiptPdf}=await import('../familyLedger/views.js');
  const {setClaimResponsibility}=await import('../familyLedger/sources.js');
  const {runDueCopays}=await import('../familyLedger/copays.js');
  const c={agencyId:1,clientId:102,actorUserId:99},consent={accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Synthetic payer'};
  let calls=0;const intents=new Map();
  Stripe.chargePaymentMethod=async args=>{calls++;const intent={id:`pi_copay_${calls}`,status:'succeeded',amount:args.amountCents,amount_received:args.amountCents,currency:args.currency,customer:args.customerId,metadata:args.metadata};intents.set(intent.id,intent);return intent;};
  Stripe.retrievePaymentIntent=async id=>intents.get(id);
  const primary={memberId:'SYNTHETIC-COMMERCIAL',insurerName:'Synthetic commercial',relationshipToSubscriber:'self'};
  const setup=extra=>saveReadiness({...c,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'verified_copay',reason:'Verified synthetic plan and payment schedule',...extra});
  const rows=()=>listBalances({agencyId:1,userId:10,clientId:102});
  const visit=async(id,status='completed')=>{await clinical.execute('INSERT INTO clinical_sessions(id,agency_id,client_id,scheduled_start_at,encounter_status) VALUES(?,1,102,?,?)',[id,'2026-09-20 15:00:00',status]);await clinical.execute('INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id) VALUES(?,1,102,?)',[id,id]);};
  const copay=id=>setClaimResponsibility({...c,claimId:id,amountCents:2500,responsibilityType:'copay',reason:'Verified benefit copay'});
  try {
    await pool.execute('DELETE FROM client_billing_readiness WHERE agency_id=1 AND client_id=102');
    await pool.execute('UPDATE clients SET billing_insurance_payload=NULL WHERE id=102');
    await acceptPayer({...c,userId:10,consent});
    await setBillingRule({...c,kind:'single',shares:[{payerUserId:10,basisPoints:10000}],reason:'Synthetic payer responsibility'});
    const cardId=await Cards.create({guardianUserId:10,agencyId:1,stripeCustomerId:'cus_copay',stripePaymentMethodId:'pm_copay',connectedAccountId:'acct_fixture',setupIntentId:'seti_copay',cardBrand:'visa',cardLast4:'4242'});
    await assignCard({...c,userId:10,cardId,recurring:false});
    let gross,paidPayment,paidAllocation;
    await t.test('missing insurance never becomes a full cash bill or collection',async()=>{
      gross=await createReceivable({...c,sourceType:'staff_charge',sourceKey:'copay-audit:unknown',serviceDomain:'mental_health',amountCents:20000});
      assert.equal(gross.status,'review');const visible=(await rows()).find(r=>r.receivableId===gross.id);assert.equal(visible.dueCents,0);assert.equal(visible.totalCents,null);
      const [a]=await allocationsFor(gross.id);
      await assert.rejects(payAllocation({agencyId:1,userId:10,allocationId:a.id,amountCents:20000,idempotencyKey:'unknown-coverage-test'}),e=>e.status===409);assert.equal(calls,0);
      await assert.rejects(setup(),e=>e.status===409);
    });
    await writeClientInsurance({...c,primary});
    await t.test('completion and setup gates prevent premature and historical automatic charges',async()=>{
      await visit(8100,'scheduled');await assert.rejects(copay(8100),/completed visit/);
      await visit(8101);const old=await copay(8101);assert.equal(old.status,'review');
      await setup();await updateBalanceReview({...c,receivableId:old.id,release:true,insuranceReviewed:true,reason:'Prior balance reviewed for manual payment'});
      // Make the historical boundary deterministic at MySQL second precision.
      await pool.execute("UPDATE family_receivables SET created_at='2026-01-01' WHERE id=?",[old.id]);
      const result=await runDueCopays({agencyId:1});assert.equal(result.length,0);assert.equal(calls,0);
    });
    await t.test('automatic copay requires consent, posts once, and stays paid through duplicate webhooks',async()=>{
      await pool.execute("UPDATE client_billing_readiness SET automatic_from=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 2 SECOND) WHERE agency_id=1 AND client_id=102");
      await visit(8102);const r=await copay(8102);[paidAllocation]=await allocationsFor(r.id);
      let result=await runDueCopays({agencyId:1});assert.equal(result[0].paid,false);assert.equal(calls,0);
      await assignCard({...c,userId:10,cardId,recurring:true,limitCents:5000,consent});
      result=await runDueCopays({agencyId:1});assert.equal(result[0].paid,true,JSON.stringify(result));paidPayment=result[0].paymentId;assert.equal(calls,1);
      await Promise.all([finalizePayment(paidPayment,1,intents.get('pi_copay_1'),'acct_fixture'),reconcileSavedPayment({agencyId:1,paymentId:paidPayment})]);
      assert.equal((await runDueCopays({agencyId:1})).length,0);assert.equal(calls,1);
      const shown=(await rows()).find(b=>b.receivableId===r.id);assert.equal(shown.dueCents,0);assert.equal(shown.paidCents,2500);assert.equal(shown.billingState,'paid');
      await assert.rejects(recordCash({...c,allocationId:paidAllocation.id,payerUserId:10,amountCents:2500,idempotencyKey:'duplicate-cash-test',note:'Already paid card'}),e=>e.status===409);
      await assert.rejects(setClaimResponsibility({...c,claimId:8102,amountCents:3000,responsibilityType:'patient_balance',verificationBasis:'era',reason:'Changed EOB requires same balance adjustment'}),/audited adjustment/);
      const receipt=await receiptFor({agencyId:1,paymentId:paidPayment,userId:10});assert.equal(receipt.clientName,'Child Two');assert.equal(receipt.serviceDate,'2026-09-20');assert.equal(receipt.responsibilityType,'Copay');assert.equal(receipt.remainingAtPaymentCents,0);assert.equal(receipt.shareCents,2500);
      assert.equal((await renderReceiptPdf(receipt)).subarray(0,4).toString(),'%PDF');
      await assert.rejects(receiptFor({agencyId:2,paymentId:paidPayment,userId:10}),e=>e.status===404);
    });
    await t.test('changed insurance and paused billing hide uncollected amounts and block direct API payment',async()=>{
      await visit(8103);const r=await copay(8103),[a]=await allocationsFor(r.id);
      await writeClientInsurance({...c,primary:{...primary,memberId:'CHANGED-COVERAGE'}});
      const shown=(await rows()).find(b=>b.receivableId===r.id);assert.equal(shown.dueCents,0);assert.equal(shown.totalCents,null);
      await assert.rejects(payAllocation({agencyId:1,userId:10,allocationId:a.id,amountCents:2500,idempotencyKey:'coverage-changed-test'}),/Coverage changed/);
      await setup({setupStatus:'paused'});assert.equal((await rows()).find(b=>b.receivableId===r.id).dueCents,0);
      await setup({collectionPolicy:'after_era'});
      await pool.execute('UPDATE family_receivables SET created_at=CURRENT_TIMESTAMP WHERE id=?',[r.id]);
      await pool.execute("UPDATE client_billing_readiness SET automatic_from=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 2 SECOND) WHERE agency_id=1 AND client_id=102");
      await updateBalanceReview({...c,receivableId:r.id,release:true,insuranceReviewed:true,reason:'Reverified changed coverage'});
      assert.equal((await runDueCopays({agencyId:1}))[0].paid,false);assert.equal(calls,1);
      await updateBalanceReview({...c,receivableId:r.id,release:true,insuranceReviewed:true,verificationBasis:'era',reason:'EOB confirms 25 dollar responsibility'});
      assert.equal((await runDueCopays({agencyId:1}))[0].paid,true);assert.equal(calls,2);
    });
    await t.test('cash receipts and refund adjustments never invent new debt or duplicate charges',async()=>{
      const r=await createReceivable({...c,sourceType:'staff_charge',sourceKey:'copay-audit:cash',serviceDomain:'coaching',amountCents:3000,serviceDate:'2026-09-20'}),[a]=await allocationsFor(r.id);
      const request={...c,allocationId:a.id,payerUserId:10,amountCents:3000,idempotencyKey:'copay-audit-cash',note:'Cash in office'};
      const [one,two]=await Promise.all([recordCash(request),recordCash(request)]);assert.equal(one.paymentId,two.paymentId);
      await refundPayment({...c,paymentId:one.paymentId,amountCents:500,idempotencyKey:'copay-audit-refund',reason:'Final responsibility reduced, cash returned'});
      const held=(await rows()).find(b=>b.receivableId===r.id);assert.equal(held.dueCents,0);assert.equal(held.billingState,'review');
      await adjustBalance({...c,receivableId:r.id,amountCents:2500,reason:'Final responsibility after refund'});
      assert.equal((await rows()).find(b=>b.receivableId===r.id).dueCents,0);
      const receipt=await receiptFor({agencyId:1,paymentId:one.paymentId,userId:10});assert.equal(receipt.amountCents,3000);assert.equal(receipt.refundedCents,500);assert.equal(receipt.netPaidCents,2500);assert.equal(receipt.shareCents,3000);
    });
    await t.test('a stale paid counter cannot create a bill or permit another charge',async()=>{
      const r=await createReceivable({...c,sourceType:'staff_charge',sourceKey:'copay-audit:integrity',serviceDomain:'coaching',amountCents:3000}),[a]=await allocationsFor(r.id);
      await pool.execute('UPDATE family_receivable_allocations SET paid_cents=500 WHERE id=?',[a.id]);
      const shown=(await rows()).find(b=>b.receivableId===r.id);assert.equal(shown.dueCents,0);assert.equal(shown.canPay,false);
      await assert.rejects(recordCash({...c,allocationId:a.id,payerUserId:10,amountCents:2500,idempotencyKey:'integrity-cash-test',note:'Must reconcile first'}),/disagree/);
      await pool.execute('UPDATE family_receivable_allocations SET paid_cents=0 WHERE id=?',[a.id]);
    });
    await t.test('a service-code amendment pauses patient collection while the claim is reviewed',async()=>{
      await visit(8105);const r=await copay(8105),[a]=await allocationsFor(r.id);
      await clinical.execute("INSERT INTO clinical_claim_change_requests (agency_id,clinical_session_id,clinical_note_id,addendum_id,proposed_lines_encrypted,created_by_user_id) VALUES(1,8105,8105,8105,'synthetic-test-placeholder',99)");
      assert.equal((await rows()).find(b=>b.receivableId===r.id).dueCents,0);
      await assert.rejects(payAllocation({agencyId:1,userId:10,allocationId:a.id,amountCents:2500,idempotencyKey:'amendment-copay-test'}),/claim needs review/);
      await assert.rejects(updateBalanceReview({...c,receivableId:r.id,insuranceReviewed:true,release:true,reason:'Cannot approve pending correction'}),/claim needs review/);
      await clinical.execute("UPDATE clinical_claim_change_requests SET status='applied' WHERE agency_id=1 AND addendum_id=8105");
      assert.equal((await rows()).find(b=>b.receivableId===r.id).dueCents,0);
      await updateBalanceReview({...c,receivableId:r.id,insuranceReviewed:true,release:true,verificationBasis:'era',reason:'Corrected claim still leaves the same copay'});
      assert.equal((await rows()).find(b=>b.receivableId===r.id).dueCents,2500);
    });
    await t.test('final zero closes a new balance without billing setup or payer assignment',async()=>{
      await visit(8190);
      await pool.execute("UPDATE client_billing_readiness SET setup_status='incomplete' WHERE agency_id=1 AND client_id=102");
      const before=(await pool.execute('SELECT next_sequence FROM family_billing_rules WHERE agency_id=1 AND client_id=102'))[0][0].next_sequence;
      const r=await setClaimResponsibility({...c,claimId:8190,verificationBasis:'era',reason:'Final remittance confirms no patient responsibility'});
      assert.equal(r.status,'paid');assert.equal(r.amount_cents,0);assert.equal(r.hold_reason,null);
      const after=(await pool.execute('SELECT next_sequence FROM family_billing_rules WHERE agency_id=1 AND client_id=102'))[0][0].next_sequence;assert.equal(after,before);
      const [allocation]=await allocationsFor(r.id);assert.equal(allocation.amount_cents,0);
      await writeClientInsurance({...c,primary});await setup({collectionPolicy:'manual'});
    });
    await t.test('final zero adjusts an unpaid copay in place and removes it from open aging',async()=>{
      await visit(8191);const original=await copay(8191);
      const r=await setClaimResponsibility({...c,claimId:8191,amountCents:0,verificationBasis:'era',reason:'Posted final ERA: no patient responsibility'});
      assert.equal(r.id,original.id);assert.equal(r.amount_cents,0);assert.equal(r.status,'paid');
      const shown=(await rows()).find(b=>b.receivableId===r.id);assert.equal(shown.billingState,'closed');assert.equal(shown.patientResponsibilityCents,0);assert.equal(shown.canPay,false);
      const {aging}=await import('../familyLedger/collections.js');assert.equal((await aging({agencyId:1})).some(b=>b.receivableId===r.id),false);
      const again=await setClaimResponsibility({...c,claimId:8191,verificationBasis:'era',reason:'Repeated posting of same final ERA'});assert.equal(again.id,r.id);assert.equal(again.amount_cents,0);
    });
    await t.test('prior copay receipts survive zero responsibility and a refund does not reopen debt',async()=>{
      await visit(8192);const original=await copay(8192),[a]=await allocationsFor(original.id);
      const receipt=await recordCash({...c,allocationId:a.id,payerUserId:10,amountCents:1000,idempotencyKey:'zero-responsibility-cash',note:'Synthetic partial copay received'});
      await setClaimResponsibility({...c,claimId:8192,amountCents:0,verificationBasis:'era',reason:'Final ERA leaves no patient responsibility'});
      const shown=(await rows()).find(b=>b.receivableId===original.id);assert.equal(shown.totalCents,0);assert.equal(shown.dueCents,0);assert.equal(shown.paidCents,1000);assert.equal(shown.refundReviewCents,1000);assert.equal(shown.billingState,'closed');
      await refundPayment({...c,paymentId:receipt.paymentId,amountCents:1000,idempotencyKey:'zero-responsibility-refund',reason:'Return copay after final zero responsibility'});
      const {findReceivable}=await import('../familyLedger/receivables.js');const closed=await findReceivable(1,original.id);assert.equal(closed.amount_cents,0);assert.equal(closed.status,'paid');
      const history=await receiptFor({agencyId:1,paymentId:receipt.paymentId,userId:10});assert.equal(history.amountCents,1000);assert.equal(history.refundedCents,1000);
      assert.equal((await rows()).find(b=>b.receivableId===original.id).billingState,'closed');
    });
    await t.test('unconfirmed card attempts must be reconciled before a zero adjustment',async()=>{
      await visit(8193);const r=await copay(8193),[a]=await allocationsFor(r.id);
      await pool.execute("INSERT INTO family_ledger_payments (agency_id,allocation_id,payer_user_id,processor,amount_cents,idempotency_key,snapshot_encrypted,status) VALUES (1,?,10,'STRIPE',2500,'zero-pending-test','synthetic-no-call','unknown')",[a.id]);
      await assert.rejects(setClaimResponsibility({...c,claimId:8193,verificationBasis:'era',reason:'Cannot lose a pending card payment'}),/pending payment/);
      assert.equal((await allocationsFor(r.id))[0].amount_cents,2500);
      await pool.execute("UPDATE family_ledger_payments SET status='cancelled' WHERE idempotency_key='zero-pending-test'");
    });
    await t.test('secondary Medicaid blocks collection even with commercial copay and signed authorization',async()=>{
      await writeClientInsurance({...c,primary,secondary:{memberId:'SYNTHETIC-MEDICAID',insurerName:'Health First Colorado',isMedicaid:true}});
      await assert.rejects(setup(),/Medicaid/);
      await setup({collectionPolicy:'manual'});await visit(8104);await assert.rejects(copay(8104),/final secondary ERA/);
      await assert.rejects(payAllocation({agencyId:1,userId:10,allocationId:paidAllocation.id,amountCents:2500,idempotencyKey:'medicaid-copay-test'}),e=>e.status===409);assert.equal(calls,2);
    });
  }finally{await pool.end();await clinical.end();}
});
