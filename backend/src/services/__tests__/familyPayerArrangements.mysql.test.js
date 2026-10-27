import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('two-guardian splits, rotation, and installment plans use the same scoped ledger', {skip:process.env.PAYER_ARRANGEMENTS_MYSQL_TEST!=='1'},async t=>{
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:'family_billing_test',USER:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
 assert.equal(process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64,Buffer.alloc(32).toString('base64'));
 const {default:mysql}=await import('mysql2/promise');
 const setup=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'family_billing_test',password:process.env.DB_PASSWORD,database:'family_billing_test',multipleStatements:true,timezone:'Z'});
 let pool,clinical;
 try{
  // Disposable local/CI fixture only. Never load a production environment file.
  const [tables]=await setup.query('SHOW TABLES');await setup.query('SET FOREIGN_KEY_CHECKS=0');for(const table of tables)await setup.query(`DROP TABLE \`${Object.values(table)[0]}\``);await setup.query('SET FOREIGN_KEY_CHECKS=1');
  const fixture=await readFile(new URL('../../../fixtures/family-billing-security.sql',import.meta.url),'utf8');await setup.query(fixture.slice(fixture.indexOf('CREATE TABLE agencies')));
  for(const file of ['613_guardian_insurance_payment.sql','665_guardian_payment_cards_stripe.sql','1413_private_family_billing.sql','1687_dependent_portal_access.sql','1688_client_portal_independence.sql','1414_family_receivables_and_workflows.sql','1485_client_billing_readiness.sql','1486_client_coverage_verification.sql','1494_management_collections.sql','1520_guardian_shared_billing.sql','1640_insurance_followups_and_payer_shares.sql','1673_attendance_copays.sql'])await setup.query(await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8'));
  for(const file of ['family-ledger-workflows.sql','patient-service-billing.sql'])await setup.query(await readFile(new URL(`../../../fixtures/${file}`,import.meta.url),'utf8'));
  await setup.query(`ALTER TABLE agencies ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0;
   ALTER TABLE users ADD is_demo BOOLEAN DEFAULT 0,ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0,ADD status_expires_at DATETIME;
   ALTER TABLE user_agencies ADD is_active BOOLEAN DEFAULT 1;`);
  pool=(await import('../../config/database.js')).default;clinical=(await import('../../config/clinicalDatabase.js')).default;
  const {createReceivable,allocationsFor,setBillingRule}=await import('../familyLedger/receivables.js');
  const {acceptPayer,assignCard}=await import('../familyBilling.service.js');
  const {BILLING_TERMS_VERSION}=await import('../familyBillingPolicy.service.js');
  const {saveReadiness}=await import('../familyLedger/readiness.js');
  const {listBalances}=await import('../familyLedger/views.js');
  const {requestSplit,respondToSplit,listSplitRequests}=await import('../familyLedger/sharing.js');
  const {proposePlan,acceptPlan,cancelPlan,runDuePlans,PLAN_TERMS_VERSION}=await import('../familyLedger/plans.js');
  const {assertCollectible}=await import('../familyLedger/policy.js');
  const {default:Cards}=await import('../../models/GuardianPaymentCard.model.js');
  const {default:Stripe}=await import('../stripePayments.service.js');
  const {payAllocation}=await import('../familyLedger/payments.js');
  const consent={accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Fictional Guardian'};
  for(const userId of [10,20])await acceptPayer({agencyId:1,clientId:101,userId,consent});
  await saveReadiness({agencyId:1,clientId:101,coverageMode:'self_pay',setupStatus:'ready',collectionPolicy:'manual',reason:'Explicit fictional self-pay terms; no insurance policy or external lookup',actorUserId:99});
  const shares=[{payerUserId:10,basisPoints:5000},{payerUserId:20,basisPoints:5000}];
  const charge=(key,extra={})=>createReceivable({agencyId:1,clientId:101,sourceType:'staff_charge',sourceKey:key,serviceDomain:'mental_health',amountCents:12000,insuranceReviewed:true,actorUserId:99,payload:{responsibilityType:'self_pay',serviceCompleted:true},...extra});
  let processorCalls=0;const intents=new Map(),calls=[];
  Stripe.chargePaymentMethod=async args=>{calls.push(args);processorCalls++;const intent={id:`pi_arrangements_${processorCalls}`,status:'succeeded',amount:args.amountCents,amount_received:args.amountCents,currency:args.currency,customer:args.customerId,metadata:args.metadata};intents.set(intent.id,intent);return intent;};
  Stripe.retrievePaymentIntent=async id=>intents.get(id);
  let planSource;
  await t.test('a standing 50/50 rule allocates every cent once and each payer sees only their share',async()=>{
   await setBillingRule({agencyId:1,clientId:101,kind:'split',shares,actorUserId:99,reason:'Both fictional guardians accepted equal responsibility'});
   const r=await charge('arrangement:split',{amountCents:10001});assert.equal(r.status,'open');
   const rows=await allocationsFor(r.id);assert.deepEqual(rows.map(a=>Number(a.amount_cents)),[5001,5000]);
   assert.equal((await charge('arrangement:split',{amountCents:10001})).id,r.id);
   assert.equal((await allocationsFor(r.id)).length,2);
   for(const [userId,amount]of [[10,5001],[20,5000]]){const visible=(await listBalances({agencyId:1,userId,clientId:101})).filter(b=>b.receivableId===r.id);assert.equal(visible.length,1);assert.equal(visible[0].dueCents,amount);assert.equal(visible[0].canPay,true);}
   await assert.rejects(payAllocation({agencyId:1,userId:20,allocationId:rows[0].id,amountCents:5001,idempotencyKey:'wrong-parent-payment'}),e=>e.status===403);assert.equal(processorCalls,0);
   assert.equal((await listBalances({agencyId:2,userId:10,clientId:101})).length,0);
  });
  await t.test('alternation advances only for a new charge, including concurrent requests',async()=>{
   await setBillingRule({agencyId:1,clientId:101,kind:'alternate',shares,actorUserId:99,reason:'Both fictional guardians agreed to alternate sessions'});
   const selected=[];
   for(let i=0;i<4;i++){const r=await charge(`arrangement:rotate:${i}`);selected.push(Number((await allocationsFor(r.id))[0].payer_user_id));}
   assert.deepEqual(selected,[10,20,10,20]);await charge('arrangement:rotate:0');
   const next=await charge('arrangement:rotate:4');assert.equal(Number((await allocationsFor(next.id))[0].payer_user_id),10);
   const concurrent=await Promise.all([0,1,2,3].map(i=>charge(`arrangement:parallel:${i}`)));
   const assigned=await Promise.all(concurrent.map(async r=>Number((await allocationsFor(r.id))[0].payer_user_id)));
   assert.equal(assigned.filter(id=>id===10).length,2);assert.equal(assigned.filter(id=>id===20).length,2);
   const [dupeA,dupeB]=await Promise.all([charge('arrangement:duplicate'),charge('arrangement:duplicate')]);assert.equal(dupeA.id,dupeB.id);
   const after=await charge('arrangement:after-duplicate');assert.equal(Number((await allocationsFor(after.id))[0].payer_user_id),10);
  });
  await t.test('an existing balance changes to 50/50 only after the other payer accepts',async()=>{
   const r=await charge('arrangement:request',{shares:[{payerUserId:10,basisPoints:10000}]});
   const request=await requestSplit({agencyId:1,receivableId:r.id,userId:10,shares,consent});
   assert.deepEqual((await allocationsFor(r.id)).map(a=>Number(a.amount_cents)),[12000]);
   assert.equal((await listSplitRequests({agencyId:1,userId:20})).some(r=>r.id===request.requestId&&r.needsMyAcceptance),true);
   await assert.rejects(respondToSplit({agencyId:1,requestId:request.requestId,userId:20,accept:true,signatureName:''}),e=>e.status===400);
   await assert.rejects(respondToSplit({agencyId:1,requestId:request.requestId,userId:30,accept:true,signatureName:'Unapproved payer'}),e=>e.status===403);
   assert.equal((await respondToSplit({agencyId:1,requestId:request.requestId,userId:20,accept:true,signatureName:'Fictional Second Guardian'})).status,'accepted');
   assert.deepEqual((await allocationsFor(r.id)).map(a=>Number(a.amount_cents)),[6000,6000]);
   await assert.rejects(respondToSplit({agencyId:1,requestId:request.requestId,userId:20,accept:true,signatureName:'Fictional Second Guardian'}),e=>e.status===409);
   planSource=r;
  });
  await t.test('declining a split preserves the existing assignment',async()=>{
   const r=await charge('arrangement:decline',{shares:[{payerUserId:10,basisPoints:10000}]});const request=await requestSplit({agencyId:1,receivableId:r.id,userId:10,shares,consent});
   assert.equal((await respondToSplit({agencyId:1,requestId:request.requestId,userId:20,accept:false})).status,'declined');assert.deepEqual((await allocationsFor(r.id)).map(a=>Number(a.amount_cents)),[12000]);
  });
  await t.test('installments require owner consent, sum to that share, charge only its card once, and can be revoked',async()=>{
   const [allocation]=await allocationsFor(planSource.id);
   const date=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10),installments=[{amountCents:2000,dueDate:date(0)},{amountCents:2000,dueDate:date(31)},{amountCents:2000,dueDate:date(62)}];
   await assert.rejects(proposePlan({agencyId:1,allocationId:allocation.id,installments:[{amountCents:2000,dueDate:date(0)},{amountCents:2000,dueDate:date(31)}],actorUserId:99}),e=>e.status===400);
   const plan=await proposePlan({agencyId:1,allocationId:allocation.id,installments,actorUserId:99});
   await assert.rejects(proposePlan({agencyId:1,allocationId:allocation.id,installments,actorUserId:99}),e=>e.status===409);
   const planConsent={...consent,version:PLAN_TERMS_VERSION};
   await assert.rejects(acceptPlan({agencyId:1,planId:plan.planId,userId:20,autoPay:true,consent:planConsent}),e=>e.status===403);
   await assert.rejects(acceptPlan({agencyId:1,planId:plan.planId,userId:10,autoPay:false,consent:{...planConsent,accepted:false}}),e=>e.status===400);
   await assert.rejects(acceptPlan({agencyId:1,planId:plan.planId,userId:10,autoPay:true,consent:planConsent}),e=>e.status===409);
   const card=await Cards.create({guardianUserId:10,agencyId:1,stripeCustomerId:'cus_arrangements10',stripePaymentMethodId:'pm_arrangements10',connectedAccountId:'acct_fixture',setupIntentId:'seti_arrangements10',cardBrand:'visa',cardLast4:'1010',cardExpYear:2099,cardExpMonth:12});
   await assignCard({agencyId:1,clientId:101,userId:10,cardId:card,recurring:false});
   await acceptPlan({agencyId:1,planId:plan.planId,userId:10,autoPay:true,consent:planConsent});assert.equal(processorCalls,0);
   const due=await runDuePlans({agencyId:1});assert.equal(due[0].paid,true,JSON.stringify(due));assert.equal(processorCalls,1);assert.equal(calls[0].customerId,'cus_arrangements10');assert.equal(calls[0].amountCents,2000);
   await runDuePlans({agencyId:1});assert.equal(processorCalls,1);
   await assert.rejects(cancelPlan({agencyId:1,planId:plan.planId,userId:20}),e=>e.status===403);
   await cancelPlan({agencyId:1,planId:plan.planId,userId:10});await runDuePlans({agencyId:1});assert.equal(processorCalls,1);
   const [[saved]]=await setup.execute('SELECT status,auto_pay FROM family_payment_plans WHERE id=?',[plan.planId]);assert.equal(saved.status,'cancelled');assert.equal(Number(saved.auto_pay),0);
  });
  await t.test('live-demo manual plans work without enabling collection or changing real insurance holds',async()=>{
   await setup.query(`INSERT INTO agencies(id,name,slug,feature_flags) VALUES(450,'Synthetic demo','auricwell-qa-demo','{"qaSandbox":{"syntheticOnly":true}}');INSERT INTO clients(id,agency_id,full_name,initials,date_of_birth) VALUES(45001,450,'Synthetic demo child','SDC','2017-01-01');INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,access_enabled) VALUES(45001,10,'guardian',1);`);
   await acceptPayer({agencyId:450,clientId:45001,userId:10,consent});
   const r=await createReceivable({agencyId:450,clientId:45001,sourceType:'qa_appointment',sourceKey:'synthetic:one',serviceDomain:'mental_health',amountCents:6000,reviewRequired:true,payload:{syntheticOnly:true,noCollection:true}});
   const [allocation]=await allocationsFor(r.id),date=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10),installments=[{amountCents:3000,dueDate:date(0)},{amountCents:3000,dueDate:date(31)}];
   const plan=await proposePlan({agencyId:450,allocationId:allocation.id,installments,actorUserId:99});const planConsent={...consent,version:PLAN_TERMS_VERSION};
   await assert.rejects(acceptPlan({agencyId:450,planId:plan.planId,userId:10,autoPay:true,consent:planConsent}),e=>e.status===409);
   await acceptPlan({agencyId:450,planId:plan.planId,userId:10,autoPay:false,consent:planConsent});
   const [visible]=await listBalances({agencyId:450,userId:10,clientId:45001});assert.equal(visible.plan.status,'active');assert.equal(visible.canPay,false);assert.equal(visible.canArrangePayments,true);assert.equal(visible.autoPayAvailable,false);
   await assert.rejects(assertCollectible({...r,status:'open',hold_reason:null}),e=>e.status===409);assert.equal(processorCalls,1);
   const held=await charge('arrangement:held',{reviewRequired:true,shares:[{payerUserId:10,basisPoints:10000}]});const [heldAllocation]=await allocationsFor(held.id);
   await assert.rejects(proposePlan({agencyId:1,allocationId:heldAllocation.id,installments,actorUserId:99}),e=>e.status===409);
  });
  await t.test('revoked guardian access cannot authorize a future payer rule',async()=>{
   await setup.execute('UPDATE client_guardians SET access_enabled=0 WHERE client_id=101 AND guardian_user_id=20');
   await assert.rejects(setBillingRule({agencyId:1,clientId:101,kind:'split',shares,actorUserId:99,reason:'Must reject revoked guardian'}),e=>e.status===403);
  });
 }finally{await setup.end();if(pool)await pool.end();if(clinical)await clinical.end();}
});
