import test from 'node:test';import assert from 'node:assert/strict';
test('source-linked cash settles claim copays and sessions and activates package/event enrollment exactly once',{skip:process.env.FAMILY_BILLING_MYSQL_TEST!=='1'},async()=>{
 assert.equal(process.env.DB_NAME,'family_billing_test');assert.equal(process.env.DB_PORT,'33316');assert.equal(process.env.CLINICAL_DB_NAME,'family_billing_test');assert.equal(process.env.CLINICAL_DB_PORT,'33316');
 const {default:pool}=await import('../../config/database.js');const {default:clinical}=await import('../../config/clinicalDatabase.js');
 const {createPackageOrder,createEventOrder,setClaimResponsibility,importSessionCharge,fulfillPaidBalances}=await import('../familyLedger/sources.js');
 const {allocationsFor,updateBalanceReview,setBillingRule}=await import('../familyLedger/receivables.js');const {recordCash}=await import('../familyLedger/payments.js');const {payFamilyCharge}=await import('../familyBillingPayment.service.js');
 async function settle(row){for(const a of await allocationsFor(row.id))if(Number(a.amount_cents)>Number(a.paid_cents))await recordCash({agencyId:1,allocationId:a.id,payerUserId:a.payer_user_id,amountCents:Number(a.amount_cents)-Number(a.paid_cents),idempotencyKey:`source-test:${a.id}`,actorUserId:99,note:'Synthetic cash received'});await fulfillPaidBalances({agencyId:1});}
 try{
  await pool.execute('UPDATE clients SET billing_insurance_payload=NULL');
  await setBillingRule({agencyId:1,clientId:102,kind:'single',shares:[{payerUserId:10,basisPoints:10000}],actorUserId:99,reason:'Confirmed synthetic payer'});
  await pool.execute("INSERT INTO learning_session_charges(id,agency_id,client_id,learning_program_session_id,total_cents,currency,charge_type) VALUES(70,1,102,80,2500,'USD','SESSION_FEE')");
  const session=await importSessionCharge({agencyId:1,chargeId:70,actorUserId:99});assert.equal(session.service_domain,'coaching');
  await assert.rejects(payFamilyCharge({agencyId:1,chargeId:70,userId:10,expectedAmountCents:2500}),e=>e.status===409&&e.message.includes('assigned payer'));
  await settle(session);const [[charge]]=await pool.execute('SELECT charge_status FROM learning_session_charges WHERE id=70');assert.equal(charge.charge_status,'CAPTURED');
  await clinical.execute('INSERT INTO clinical_claims(id,agency_id,client_id) VALUES(70,1,102)');
  const copay=await setClaimResponsibility({agencyId:1,claimId:70,amountCents:1500,responsibilityType:'copay',reason:'Verified benefit copay',actorUserId:99});await settle(copay);assert.equal(copay.source_key,'70');
  await assert.rejects(setClaimResponsibility({agencyId:2,claimId:70,amountCents:1000,responsibilityType:'copay',reason:'Other tenant',actorUserId:99}),e=>e.status===404);
  const order=await createPackageOrder({agencyId:1,clientId:102,packageId:91,payerUserId:10,actorUserId:99,idempotencyKey:'synthetic-package-order'});
  const [[pending]]=await pool.execute('SELECT * FROM booking_package_entitlements WHERE package_id=91');assert.equal(pending.sessions_remaining,0);assert.equal(pending.status,'PENDING');
  await settle(order);await fulfillPaidBalances({agencyId:1});
  const [[active]]=await pool.execute('SELECT * FROM booking_package_entitlements WHERE id=?',[pending.id]);assert.equal(active.sessions_remaining,4);assert.equal(active.status,'ACTIVE');
  const [[credits]]=await pool.execute('SELECT COUNT(*) AS n FROM booking_package_ledger WHERE entitlement_id=?',[pending.id]);assert.equal(credits.n,1);
  const [[member]]=await pool.execute('SELECT COUNT(*) AS n FROM learning_class_client_memberships WHERE learning_class_id=90 AND client_id=102');assert.equal(member.n,1);
  const event=await createEventOrder({agencyId:1,clientId:102,eventId:92,amountCents:2000,serviceDomain:'coaching',actorUserId:99,reason:'Published event price'});assert.equal(event.status,'review');
  await updateBalanceReview({agencyId:1,receivableId:event.id,actorUserId:99,release:true,reason:'Reviewed event charge'});await settle(event);await fulfillPaidBalances({agencyId:1});
  const [[enrolled]]=await pool.execute('SELECT COUNT(*) AS n FROM company_event_clients WHERE company_event_id=92 AND client_id=102 AND is_active=1');assert.equal(enrolled.n,1);
 }finally{await pool.end();await clinical.end();}
});
