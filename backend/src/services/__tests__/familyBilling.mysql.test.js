import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
// This test may only target the disposable fixture DB documented in
// docs/security/family-billing.md. It never uses application/staging credentials.
test('MySQL: migrated family billing preserves encryption, isolation, consent, and payment idempotency', {skip:process.env.FAMILY_BILLING_MYSQL_TEST !== '1'}, async()=>{
 assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'33316');assert.equal(process.env.DB_NAME,'family_billing_test');assert.equal(process.env.DB_USER,'family_billing_test');
 const {default:pool}=await import('../../config/database.js');
 const {acceptPayer,getFamilyBillingSummary,assignCard,revokeRecurring,saveFamilyInsurance}=await import('../familyBilling.service.js');
 const {BILLING_TERMS_VERSION,requireResponsiblePayer}=await import('../familyBillingPolicy.service.js');
 const {default:Cards}=await import('../../models/GuardianPaymentCard.model.js');
 const {default:Stripe}=await import('../stripePayments.service.js');
 const {payFamilyCharge,reconcileFamilyPayment}=await import('../familyBillingPayment.service.js');
 const {decryptFamilyBilling}=await import('../familyBillingEncryption.service.js');
 const consent={accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Synthetic Parent'};
 try {
  await assert.rejects(requireResponsiblePayer(10,101,1),e=>e.status===403);
  for(const [userId,clientId] of [[10,101],[10,102],[20,101]])await acceptPayer({userId,clientId,agencyId:1,consent});
  await assert.rejects(acceptPayer({userId:30,clientId:101,agencyId:1,consent}),e=>e.status===403);
  await assert.rejects(acceptPayer({userId:10,clientId:201,agencyId:1,consent}),e=>e.status===403);
  const cardId=await Cards.create({guardianUserId:10,agencyId:1,stripeCustomerId:'cus_fixture',stripePaymentMethodId:'pm_fixture',connectedAccountId:'acct_fixture',setupIntentId:'seti_fixture',cardBrand:'visa',cardLast4:'4242',cardExpMonth:'12',cardExpYear:'2030',cardholderName:'Synthetic Parent'});
  for(const clientId of [101,102])await assignCard({userId:10,agencyId:1,clientId,cardId,recurring:false});
  await assert.rejects(assignCard({userId:20,agencyId:1,clientId:101,cardId,recurring:false}),e=>e.status===403);
  await assignCard({userId:10,agencyId:1,clientId:101,cardId,recurring:true,limitCents:5000,consent});
  const profileId=await saveFamilyInsurance({userId:10,agencyId:1,clientIds:[101,102],coverageScope:'account_holder',coverageConfirmed:true,primary:{insurerName:'Synthetic insurer',memberId:'PRIVATE-MEMBER',subscriberName:'Synthetic Parent',relationshipToSubscriber:'child'}});
  const own=await getFamilyBillingSummary(10,1),other=await getFamilyBillingSummary(20,1),child=await getFamilyBillingSummary(30,1);
  assert.equal(own.cards.length,1);assert.deepEqual(own.profiles.find(p=>p.id===profileId).clientIds.sort(),[101,102]);
  assert.equal(other.cards.length,0);assert.equal(other.profiles.length,0);assert.equal(child.cards.length,0);assert.equal(child.profiles.length,0);assert.equal(child.clients[0].canManageBilling,false);assert.equal(child.clients[0].responsiblePayers.length,2);
  const [[rawCard]]=await pool.execute('SELECT * FROM guardian_payment_cards WHERE id = ?',[cardId]);assert.equal(rawCard.stripe_customer_id,null);assert.equal(rawCard.cardholder_name,null);assert.ok(!JSON.stringify(rawCard.private_payload).includes('cus_fixture'));
  const [[rawClient]]=await pool.execute('SELECT * FROM clients WHERE id=101');assert.equal(rawClient.insurance_member_id,null);assert.equal(decryptFamilyBilling(rawClient.billing_insurance_payload,'client-insurance:1:101').primary.memberId,'PRIVATE-MEMBER');
  // Actual gateway calls are mocked; all SQL, encryption and access checks are real.
  let gatewayCalls=0;
  Stripe.chargePaymentMethod=async args=>{gatewayCalls++;return{id:'pi_fixture',status:'succeeded',amount:args.amountCents,amount_received:args.amountCents,currency:args.currency,customer:args.customerId};};
  await pool.execute("INSERT INTO learning_session_charges(id,agency_id,client_id,total_cents,currency,charge_type) VALUES(1,1,101,2500,'USD','ADJUSTMENT')");
  const paid=await payFamilyCharge({agencyId:1,userId:10,chargeId:1,expectedAmountCents:2500});assert.equal(paid.paid,true);
  const duplicate=await payFamilyCharge({agencyId:1,userId:10,chargeId:1,expectedAmountCents:2500});assert.equal(duplicate.alreadyPaid,true);assert.equal(gatewayCalls,1);
  await assert.rejects(reconcileFamilyPayment({id:'pi_fixture',status:'succeeded',amount_received:2500,currency:'usd',customer:'cus_fixture'},'acct_other'),e=>e.status===403);
  await reconcileFamilyPayment({id:'pi_fixture',status:'succeeded',amount_received:2500,currency:'usd',customer:'cus_fixture'},'acct_fixture');
  await revokeRecurring({userId:10,agencyId:1,clientId:101});
  await pool.execute("INSERT INTO learning_session_charges(id,agency_id,client_id,total_cents,currency,charge_type) VALUES(2,1,101,2500,'USD','ADJUSTMENT')");
  await assert.rejects(payFamilyCharge({agencyId:1,userId:10,chargeId:2,automatic:true}),e=>e.status===409);assert.equal(gatewayCalls,1);
  // A declined intent must be cancelled before a different card gets a new key.
  await pool.execute("INSERT INTO learning_session_charges(id,agency_id,client_id,total_cents,currency,charge_type) VALUES(3,1,101,2500,'USD','ADJUSTMENT')");
  const keys=[];let cancelled=false;
  Stripe.chargePaymentMethod=async args=>{keys.push(args.idempotencyKey);return{id:keys.length===1?'pi_declined':'pi_retry',status:keys.length===1?'requires_payment_method':'succeeded',amount:args.amountCents,amount_received:keys.length===1?0:args.amountCents,currency:args.currency,customer:args.customerId};};
  await assert.rejects(payFamilyCharge({agencyId:1,userId:10,chargeId:3,expectedAmountCents:2500}),e=>e.status===402);
  const secondCardId=await Cards.create({guardianUserId:10,agencyId:1,stripeCustomerId:'cus_fixture',stripePaymentMethodId:'pm_second',connectedAccountId:'acct_fixture',setupIntentId:'seti_second',cardBrand:'visa',cardLast4:'4444'});
  await assignCard({userId:10,agencyId:1,clientId:101,cardId:secondCardId,recurring:false});
  Stripe.retrievePaymentIntent=async()=>({id:'pi_declined',status:'requires_payment_method'});
  Stripe.cancelPaymentIntent=async()=>{cancelled=true;return{id:'pi_declined',status:'canceled'};};
  assert.equal((await payFamilyCharge({agencyId:1,userId:10,chargeId:3,expectedAmountCents:2500})).paid,true);
  assert.equal(cancelled,true);assert.equal(keys.length,2);assert.notEqual(keys[0],keys[1]);
  await payFamilyCharge({agencyId:1,userId:10,chargeId:3,expectedAmountCents:2500});assert.equal(keys.length,2);
  // Editing the selected children updates mappings and removes stale canonical coverage.
  await saveFamilyInsurance({userId:10,agencyId:1,profileId,clientIds:[101],coverageScope:'account_holder',coverageConfirmed:true,primary:{insurerName:'Synthetic insurer',memberId:'UPDATED-MEMBER',subscriberName:'Synthetic Parent',relationshipToSubscriber:'child'}});
  const [[removedCoverage]]=await pool.execute('SELECT billing_insurance_payload FROM clients WHERE id=102');assert.equal(removedCoverage.billing_insurance_payload,null);
  const [assignments]=await pool.execute('SELECT client_id FROM guardian_insurance_clients WHERE profile_id=?',[profileId]);assert.deepEqual(assignments.map(a=>a.client_id),[101]);
  await Cards.deactivate(cardId,10,1);
  const [[payer]]=await pool.execute('SELECT payment_card_id,consent_id FROM client_billing_payers WHERE guardian_user_id=10 AND client_id=102');assert.equal(payer.payment_card_id,null);assert.equal(payer.consent_id,null);
  const [leaks]=await pool.execute('SELECT id FROM guardian_insurance_profiles WHERE primary_member_id IS NOT NULL');assert.equal(leaks.length,0);
  // Execute the actual migration script against synthetic legacy rows, twice.
  await pool.execute("INSERT INTO guardian_insurance_profiles(guardian_user_id,agency_id,client_id,primary_insurer_name,primary_member_id) VALUES(20,1,102,'Legacy fixture','LEGACY-MEMBER')");
  await pool.execute("INSERT INTO guardian_payment_cards(guardian_user_id,agency_id,payment_provider,stripe_customer_id,stripe_payment_method_id,auto_charge) VALUES(20,1,'STRIPE','cus_legacy','pm_legacy',1)");
  await pool.execute("UPDATE clients SET insurance_member_id='LEGACY-CLIENT' WHERE id=102");
  await pool.execute("INSERT INTO clinical_claims(id,agency_id,member_id,payer_name) VALUES(1,1,'LEGACY-CLAIM','Fixture')");
  const scriptEnv={...process.env,CLINICAL_DB_HOST:'127.0.0.1',CLINICAL_DB_PORT:'33316',CLINICAL_DB_NAME:'family_billing_test',CLINICAL_DB_USER:'family_billing_test',CLINICAL_DB_PASSWORD:'synthetic-only'};
  for(let attempt=0;attempt<2;attempt++)await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[new URL('../../scripts/backfillFamilyBillingEncryption.js',import.meta.url).pathname,'--apply'],{env:scriptEnv,stdio:'pipe'});let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(output)));});
  const [[legacyCard]]=await pool.execute('SELECT * FROM guardian_payment_cards WHERE guardian_user_id=20');assert.equal(legacyCard.stripe_customer_id,null);assert.equal(legacyCard.auto_charge,0);assert.equal(decryptFamilyBilling(legacyCard.private_payload,'card:1:20').legacyRequiresReview,true);
  const [[legacyClaim]]=await pool.execute('SELECT * FROM clinical_claims WHERE id=1');assert.equal(legacyClaim.member_id,null);assert.equal(decryptFamilyBilling(legacyClaim.insurance_payload,'claim-insurance:1:1').primary.memberId,'LEGACY-CLAIM');
  const [[legacyClient]]=await pool.execute('SELECT * FROM clients WHERE id=102');assert.equal(legacyClient.insurance_member_id,null);assert.equal(decryptFamilyBilling(legacyClient.billing_insurance_payload,'client-insurance:1:102').primary.memberId,'LEGACY-CLIENT');
  // Secondary Medicaid blocks an actual pending charge without posting a payment.
  const {writeClientInsurance}=await import('../clientInsurance.service.js');
  await writeClientInsurance({agencyId:1,clientId:101,primary:{insurerName:'Commercial fixture'},secondary:{insurerName:'Health First Colorado',memberId:'SYNTHETIC-MEDICAID',isMedicaid:true}});
  await assert.rejects(payFamilyCharge({agencyId:1,userId:10,chargeId:2,expectedAmountCents:2500}),e=>e.status===409&&e.message.includes('Medicaid'));
  const [[paymentCount]]=await pool.execute('SELECT COUNT(*) AS n FROM learning_payments WHERE learning_session_charge_id=2');assert.equal(paymentCount.n,0);
 } finally {await pool.end();}
});
