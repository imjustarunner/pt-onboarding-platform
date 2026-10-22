import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('attendance copays use real SQL locks and one payment through note retries and final ERA', {skip:process.env.ATTENDANCE_COPAY_MYSQL_TEST!=='1'},async t=>{
  assert.ok(['family_billing_test','copay_attendance_review_test'].includes(process.env.DB_NAME));
  for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:process.env.DB_NAME,USER:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
  assert.equal(process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64,Buffer.alloc(32).toString('base64'));
  const {default:mysql}=await import('mysql2/promise');
  const setup=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'family_billing_test',password:process.env.DB_PASSWORD,database:process.env.DB_NAME,multipleStatements:true,timezone:'Z'});
  let pool,clinical;
  try {
    // Disposable synthetic database only; never import any production environment.
    const [tables]=await setup.query('SHOW TABLES');await setup.query('SET FOREIGN_KEY_CHECKS=0');for(const table of tables)await setup.query(`DROP TABLE \`${Object.values(table)[0]}\``);await setup.query('SET FOREIGN_KEY_CHECKS=1');
    const fixture=await readFile(new URL('../../../fixtures/family-billing-security.sql',import.meta.url),'utf8');await setup.query(fixture.slice(fixture.indexOf('CREATE TABLE agencies')));
    for(const file of ['613_guardian_insurance_payment.sql','665_guardian_payment_cards_stripe.sql','1413_private_family_billing.sql','1687_dependent_portal_access.sql','1688_client_portal_independence.sql','1414_family_receivables_and_workflows.sql','1485_client_billing_readiness.sql','1486_client_coverage_verification.sql','1494_management_collections.sql','1520_guardian_shared_billing.sql','1640_insurance_followups_and_payer_shares.sql','1673_attendance_copays.sql'])await setup.query(await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8'));
    for(const file of ['family-ledger-workflows.sql','patient-service-billing.sql'])await setup.query(await readFile(new URL(`../../../fixtures/${file}`,import.meta.url),'utf8'));
    await setup.query(`ALTER TABLE agencies ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0;
      ALTER TABLE users ADD is_demo BOOLEAN DEFAULT 0,ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0,ADD status_expires_at DATETIME;
      ALTER TABLE user_agencies ADD is_active BOOLEAN DEFAULT 1;
      ALTER TABLE clinical_sessions ADD scheduled_end_at DATETIME,ADD provider_user_id INT,ADD office_event_id INT,ADD appointment_id INT,ADD claim_blocked_reason VARCHAR(255),ADD updated_at DATETIME;
      CREATE TABLE clinical_notes(id BIGINT PRIMARY KEY AUTO_INCREMENT,clinical_session_id BIGINT,agency_id INT,client_id INT,created_by_user_id INT,note_type VARCHAR(50),title VARCHAR(255),note_payload LONGTEXT,metadata_json JSON,content_hash VARCHAR(64),content_review_status VARCHAR(32),content_review_source VARCHAR(32),content_review_json JSON,updated_at DATETIME,provider_signed_by_user_id INT,provider_signed_at DATETIME,is_billable BOOLEAN DEFAULT 1,is_deleted BOOLEAN DEFAULT 0);
      CREATE TABLE clinical_note_drafts(id BIGINT PRIMARY KEY,user_id INT,agency_id INT,client_id INT,clinical_session_id BIGINT,archived_at DATETIME,input_text LONGTEXT,output_json LONGTEXT);
      CREATE TABLE claimmd_responsibility_jobs(id BIGINT PRIMARY KEY,clinical_claim_id BIGINT,agency_id INT,status VARCHAR(30));
      CREATE TABLE claimmd_remittances(id BIGINT PRIMARY KEY,status VARCHAR(30));
      CREATE TABLE claimmd_remittance_items(id BIGINT PRIMARY KEY,clinical_claim_id BIGINT,agency_id INT,remittance_id BIGINT,status VARCHAR(30));
      UPDATE agencies SET feature_flags=JSON_OBJECT('familyBillingAutomationEnabled',true,'attendanceCopaysEnabled',true) WHERE id=1;
      INSERT INTO users(id,first_name,last_name,role,email) VALUES(45,'Synthetic','Provider','provider','provider@example.invalid');
      INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(45,1,1);`);
    pool=(await import('../../config/database.js')).default;clinical=(await import('../../config/clinicalDatabase.js')).default;
    const {default:Stripe}=await import('../stripePayments.service.js');
    const {default:Cards}=await import('../../models/GuardianPaymentCard.model.js');
    const {acceptPayer,assignCard}=await import('../familyBilling.service.js');
    const {BILLING_TERMS_VERSION}=await import('../familyBillingPolicy.service.js');
    const {writeClientInsurance,readClientInsurance}=await import('../clientInsurance.service.js');
    const {saveReadiness,insuranceFingerprint}=await import('../familyLedger/readiness.js');
    const {encryptFamilyBilling}=await import('../familyBillingEncryption.service.js');
    const {recordCopayAttendance,onSignedNoteCopay,onSavedDraftCopay,suppressAppointmentAttendanceCopays,resetPendingAttendance,pendingProviderCopays,collectAttendanceCopay}=await import('../familyLedger/copayAttendance.js');
    const {setClaimResponsibility}=await import('../familyLedger/sources.js');
    const {runDueCopays}=await import('../familyLedger/copays.js');
    const {sourcePayload}=await import('../familyLedger/receivables.js');
    const {finalizePayment}=await import('../familyLedger/payments.js');
    const intents=new Map();let processorCharges=0;
    // The only external edge is a deterministic synthetic Stripe adapter. Every
    // policy, encrypted record, row lock, ledger write, and receipt is real SQL.
    Stripe.chargePaymentMethod=async args=>{
      if(intents.has(args.idempotencyKey))return intents.get(args.idempotencyKey);
      processorCharges++;
      const value={id:`pi_synthetic_${processorCharges}`,status:'succeeded',amount:args.amountCents,amount_received:args.amountCents,currency:args.currency,customer:args.customerId,metadata:args.metadata};
      intents.set(args.idempotencyKey,value);await new Promise(resolve=>setTimeout(resolve,25));return value;
    };
    Stripe.retrievePaymentIntent=async id=>[...intents.values()].find(i=>i.id===id);
    const c={agencyId:1,clientId:102,actorUserId:99},consent={accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Synthetic Parent'};
    const primary={memberId:'SYNTHETIC-COMMERCIAL',insurerName:'Synthetic commercial',payerId:'FAKE-PAYER',relationshipToSubscriber:'child'};
    await acceptPayer({...c,userId:10,consent});
    const cardId=await Cards.create({guardianUserId:10,agencyId:1,stripeCustomerId:'cus_synthetic',stripePaymentMethodId:'pm_synthetic',connectedAccountId:'acct_fixture',setupIntentId:'seti_synthetic',cardBrand:'visa',cardLast4:'4242',cardExpYear:2099,cardExpMonth:12});
    await assignCard({...c,userId:10,cardId,recurring:true,limitCents:5000,consent});
    await writeClientInsurance({...c,primary});
    await saveReadiness({...c,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'verified_copay',reason:'Synthetic verified commercial copay'});
    await setup.execute("UPDATE client_billing_readiness SET automatic_from=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY) WHERE agency_id=1 AND client_id=102");
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-7200000));
    const term={clientId:102,serviceCode:'90834',paymentBasis:'copay',amountCents:2500,totalCents:2500,priceBasis:'visit',units:1,effectiveFrom:'2026-01-01',effectiveThrough:'2099-12-31',insuranceFingerprint:insuranceFingerprint(await readClientInsurance(102,1)),evidence:'Synthetic verified benefit reference'};
    const evidence=encryptFamilyBilling({waiver:{serviceTerms:[term]},signatureName:'Synthetic Parent'},'billing-task:1:10');
    await setup.execute("INSERT INTO family_billing_tasks(agency_id,guardian_user_id,client_ids_json,status,token_hash,expires_at,terms_version,waiver_encrypted,signed_evidence_encrypted,created_by_user_id,completed_at) VALUES(1,10,'[102]','completed',?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),?,?,?,99,UTC_TIMESTAMP())",['a'.repeat(64),BILLING_TERMS_VERSION,evidence,evidence]);
    const visit=async(id,{future=false,status='scheduled',signed=true}={})=>{
      await setup.execute('INSERT INTO clinical_sessions(id,agency_id,client_id,provider_user_id,service_code,effective_service_code,scheduled_start_at,scheduled_end_at,encounter_status) VALUES(?,1,102,45,\'90834\',\'90834\',?,?,?)',[id,new Date(Date.now()+(future?3600000:-7200000)),new Date(Date.now()+(future?7200000:-3600000)),status]);
      if(signed)await setup.execute("INSERT INTO clinical_notes(id,clinical_session_id,agency_id,client_id,created_by_user_id,note_type,provider_signed_by_user_id,provider_signed_at) VALUES(?,?,1,102,45,'PROGRESS_NOTE',45,UTC_TIMESTAMP())",[id,id]);
    };
    const input=id=>({agencyId:1,sessionId:id,providerUserId:45,occurred:true});
    let paidBalance;
    await t.test('concurrent explicit confirmation and note signature create one receivable, payment and receipt',async()=>{
      await visit(9001);
      const outcomes=await Promise.allSettled([recordCopayAttendance(input(9001)),onSignedNoteCopay({agencyId:1,noteId:9001,providerUserId:45})]);
      assert.ok(outcomes.some(o=>o.status==='fulfilled'&&o.value.collection?.paid),JSON.stringify(outcomes));
      assert.equal(processorCharges,1);
      const [[counts]]=await setup.query("SELECT (SELECT COUNT(*) FROM family_receivables) balances,(SELECT COUNT(*) FROM family_ledger_payments) payments,(SELECT COUNT(*) FROM family_ledger_payments WHERE status='succeeded' AND receipt_encrypted IS NOT NULL) receipts");
      assert.deepEqual(counts,{balances:1,payments:1,receipts:1});
      [[paidBalance]]=await setup.execute('SELECT * FROM family_receivables WHERE agency_id=1');
      assert.equal(paidBalance.status,'paid');
      const [[payment]]=await setup.execute('SELECT id FROM family_ledger_payments');
      await Promise.all([finalizePayment(payment.id,1,[...intents.values()][0],'acct_fixture'),finalizePayment(payment.id,1,[...intents.values()][0],'acct_fixture')]);
      await recordCopayAttendance(input(9001));assert.equal(processorCharges,1);
    });
    await t.test('later claim and final ERA adopt the same paid balance, including a zero responsibility refund review',async()=>{
      await setup.execute("INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id,destination_payer_id) VALUES(9101,1,102,9001,'FAKE-PAYER')");
      const adopted=await setClaimResponsibility({...c,claimId:9101,amountCents:2500,responsibilityType:'copay',verificationBasis:'benefit',reason:'Synthetic confirmed copay'});
      assert.equal(adopted.id,paidBalance.id);assert.equal(adopted.source_type,'claim_responsibility');assert.equal(adopted.source_key,'9101');
      await setClaimResponsibility({...c,claimId:9101,amountCents:2500,responsibilityType:'copay',verificationBasis:'era',reason:'Synthetic final ERA'});
      await runDueCopays({agencyId:1});assert.equal(processorCharges,1);
      const closed=await setClaimResponsibility({...c,claimId:9101,amountCents:0,responsibilityType:'patient_balance',verificationBasis:'era',reason:'Synthetic corrected final ERA'});
      assert.equal(closed.id,paidBalance.id);assert.equal(sourcePayload(closed).zeroResponsibilityClosed,true);
      const [[count]]=await setup.query('SELECT COUNT(*) n FROM family_receivables');assert.equal(count.n,1);assert.equal(processorCharges,1);
    });
    await t.test('did-not-occur, early sessions, wrong providers, and missing exact terms never reach Stripe',async()=>{
      await visit(9002,{signed:false});await recordCopayAttendance({...input(9002),occurred:false});
      await assert.rejects(recordCopayAttendance(input(9002)),/canceled|cancelled|not occurring/);
      const before=processorCharges;
      await recordCopayAttendance({...input(9002),occurred:false});
      const [[missed]]=await setup.execute("SELECT COUNT(*) n,MAX(provider_signed_at) signature,MAX(is_billable) billable FROM clinical_notes WHERE clinical_session_id=9002 AND note_type='MISSED_APPOINTMENT'");
      assert.equal(missed.n,0);assert.equal(missed.signature,null);assert.equal(missed.billable,null);assert.equal(processorCharges,before);
      await visit(9003,{future:true});await assert.rejects(recordCopayAttendance(input(9003)),/session has ended/);
      await visit(9004);await assert.rejects(recordCopayAttendance({...input(9004),providerUserId:99}),/provider access/);
      await setup.execute("UPDATE clinical_sessions SET service_code='90837',effective_service_code='90837' WHERE id=9004");
      await assert.rejects(recordCopayAttendance(input(9004)),/signed agreement/);
      assert.equal(processorCharges,1);
    });
    await t.test('a reviewed missed note supplies attendance without a second confirmation or another chart note',async()=>{
      await visit(9007,{signed:false});const before=processorCharges;
      const payload=JSON.stringify({sections:{Summary:'Synthetic missed appointment'}});
      const {createHash}=await import('node:crypto');
      const {maybeEncryptNotePayload}=await import('../clinicalNoteCrypto.service.js');
      const {completeNonbillableReview}=await import('../nonbillableNoteCompletion.service.js');
      await setup.execute("INSERT INTO clinical_notes(id,clinical_session_id,agency_id,client_id,created_by_user_id,note_type,note_payload,is_billable) VALUES(9007,9007,1,102,45,'MISSED_APPOINTMENT',?,0)",[maybeEncryptNotePayload(payload)]);
      await completeNonbillableReview({noteId:9007,agencyId:1,actorUserId:45,confirmed:true,expectedHash:createHash('sha256').update(payload).digest('hex')});
      await completeNonbillableReview({noteId:9007,agencyId:1,actorUserId:45,confirmed:true,expectedHash:createHash('sha256').update(payload).digest('hex')});
      const [[decision]]=await setup.execute('SELECT attendance,decision_source FROM family_copay_attendance WHERE clinical_session_id=9007');
      assert.deepEqual(decision,{attendance:'did_not_occur',decision_source:'reviewed_note'});
      const [[notes]]=await setup.execute('SELECT COUNT(*) n,MAX(provider_signed_at) signature FROM clinical_notes WHERE clinical_session_id=9007');
      assert.equal(notes.n,1);assert.equal(notes.signature,null);assert.equal(processorCharges,before);
    });
    await t.test('guardian roles, inactive, archived and expired provider accounts cannot confirm sessions',async()=>{
      await visit(9006);
      for(const change of ["role='client_guardian'","is_active=0","is_archived=1","status='INACTIVE_EMPLOYEE'","status_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)"]){
        await setup.query(`UPDATE users SET ${change} WHERE id=45`);
        await assert.rejects(recordCopayAttendance(input(9006)),/provider access/);
        await setup.query("UPDATE users SET role='provider',is_active=1,is_archived=0,status='ACTIVE',status_expires_at=NULL WHERE id=45");
      }
      assert.equal(processorCharges,1);
    });
    await t.test('Medicaid secondary and old/revoked recurring consent fail before a charge',async()=>{
      await visit(9005);
      await writeClientInsurance({...c,primary,secondary:{memberId:'SYNTHETIC-MEDICAID',insurerName:'Colorado Medicaid',isMedicaid:true}});
      await assert.rejects(recordCopayAttendance(input(9005)),/coverage requires billing review/);
      await writeClientInsurance({...c,primary});
      await setup.execute("UPDATE guardian_billing_consents SET terms_version='family-billing-2026-09-11-v1' WHERE purpose='recurring'");
      await assert.rejects(recordCopayAttendance(input(9005)),/same-day copay authorization/);
      await setup.execute("UPDATE guardian_billing_consents SET terms_version=?,revoked_at=UTC_TIMESTAMP() WHERE purpose='recurring'",[BILLING_TERMS_VERSION]);
      await assert.rejects(recordCopayAttendance(input(9005)),/same-day copay authorization/);
      assert.equal(processorCharges,1);
    });
    await t.test('a concurrent did-not-occur decision cannot succeed while its payment is accepted',async()=>{
      await assignCard({...c,userId:10,cardId,recurring:true,limitCents:5000,consent});
      for(let id=9020;id<9025;id++){
        await visit(id,{signed:false});
        const responses=await Promise.allSettled([recordCopayAttendance(input(id)),recordCopayAttendance({...input(id),occurred:false})]);
        const [[decision]]=await setup.execute('SELECT attendance,receivable_id FROM family_copay_attendance WHERE agency_id=1 AND clinical_session_id=?',[id]);
        const [[money]]=await setup.execute("SELECT COUNT(*) n FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? AND p.status IN ('succeeded','pending','unknown','requires_action')",[decision.receivable_id||0]);
        if(responses[1].status==='fulfilled') {assert.equal(decision.attendance,'did_not_occur');assert.equal(money.n,0);}
        if(money.n)assert.equal(responses[1].status,'rejected');
        assert.ok(money.n<=1);
      }
    });
    await t.test('turning off launch control prevents both prompt and direct collection',async()=>{
      const before=processorCharges;
      await setup.execute("UPDATE agencies SET feature_flags=JSON_SET(feature_flags,'$.attendanceCopaysEnabled',false) WHERE id=1");
      assert.deepEqual(await pendingProviderCopays({agencyId:1,providerUserId:45}),{enabled:false,sessions:[]});
      assert.deepEqual(await collectAttendanceCopay({agencyId:1,sessionId:9001}),{paid:false,disabled:true});
      await assert.rejects(recordCopayAttendance(input(9005)),/not enabled/);
      assert.equal(processorCharges,before);
    });
    await t.test('a new negative decision holds a preexisting claim balance without attendance metadata',async()=>{
      await setup.execute("UPDATE agencies SET feature_flags=JSON_SET(feature_flags,'$.attendanceCopaysEnabled',true) WHERE id=1");
      await visit(9050,{status:'completed',signed:false});
      await setup.execute("INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id,destination_payer_id) VALUES(9150,1,102,9050,'FAKE-PAYER')");
      const balance=await setClaimResponsibility({...c,claimId:9150,amountCents:2500,responsibilityType:'copay',verificationBasis:'benefit',reason:'Synthetic existing verified claim'});
      assert.equal(sourcePayload(balance).attendanceSessionId,undefined);
      const before=processorCharges;
      await recordCopayAttendance({...input(9050),occurred:false});
      await runDueCopays({agencyId:1});assert.equal(processorCharges,before);
      const [[held]]=await setup.execute('SELECT status,hold_reason FROM family_receivables WHERE id=?',[balance.id]);
      assert.deepEqual(held,{status:'review',hold_reason:'attendance_not_occurred'});
      // Even manually removing the visible hold cannot bypass the attendance gate.
      await setup.execute("UPDATE family_receivables SET status='open',hold_reason=NULL WHERE id=?",[balance.id]);
      const result=await runDueCopays({agencyId:1});
      assert.ok(result.some(r=>r.paid===false&&/not occurring|canceled|cancelled|did not occur|visit or claim needs review/.test(r.message)),JSON.stringify(result));
      assert.equal(processorCharges,before);
    });
    await t.test('saved encrypted session draft collects once and a later note does not collect again',async()=>{
      const {maybeEncryptNotePayload}=await import('../clinicalNoteCrypto.service.js');
      await visit(9060,{signed:false});const before=processorCharges;
      await setup.execute('INSERT INTO clinical_note_drafts(id,user_id,agency_id,client_id,clinical_session_id,input_text,output_json) VALUES(9060,45,1,102,9060,?,?)',[maybeEncryptNotePayload('Practiced grounding during the completed session.'),maybeEncryptNotePayload(JSON.stringify({meta:{quickNote:true}}))]);
      assert.deepEqual(await onSavedDraftCopay({agencyId:1,draftId:9060,providerUserId:45}),{eligible:false});
      const saved=await onSavedDraftCopay({agencyId:1,draftId:9060,providerUserId:45,attendanceIntent:'authored_session_draft',explicitClinicalSessionId:9060});
      assert.equal(saved.collection.paid,true);assert.equal(processorCharges,before+1);
      await setup.execute("INSERT INTO clinical_notes(id,clinical_session_id,agency_id,client_id,created_by_user_id,note_type,provider_signed_by_user_id,provider_signed_at) VALUES(9060,9060,1,102,45,'PROGRESS_NOTE',45,UTC_TIMESTAMP())");
      await onSignedNoteCopay({agencyId:1,noteId:9060,providerUserId:45});assert.equal(processorCharges,before+1);
      const [[audit]]=await setup.execute('SELECT decision_source,clinical_draft_id FROM family_copay_attendance WHERE clinical_session_id=9060');
      assert.deepEqual(audit,{decision_source:'saved_draft',clinical_draft_id:9060});
    });
    await t.test('late attendance routes to review and creates no surprise next-day charge',async()=>{
      await visit(9061,{signed:false});const before=processorCharges;
      await setup.execute('UPDATE clinical_sessions SET scheduled_start_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),scheduled_end_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 23 HOUR) WHERE id=9061');
      const late=await recordCopayAttendance(input(9061));assert.equal(late.collection.needsReview,true);assert.equal(processorCharges,before);
      const [[row]]=await setup.execute('SELECT collection_status,collection_review_reason,receivable_id FROM family_copay_attendance WHERE clinical_session_id=9061');
      assert.deepEqual(row,{collection_status:'review',collection_review_reason:'late_attendance',receivable_id:null});
      await assert.rejects(collectAttendanceCopay({agencyId:1,sessionId:9061}),/later day/);assert.equal(processorCharges,before);
    });
    await t.test('unfinished negative choice can reset but a paid visit cannot silently be canceled',async()=>{
      await visit(9062,{signed:false});await recordCopayAttendance({...input(9062),occurred:false});
      assert.equal((await resetPendingAttendance({agencyId:1,sessionId:9062,providerUserId:45})).reset,true);
      const [[negative]]=await setup.execute('SELECT COUNT(*) n FROM family_copay_attendance WHERE clinical_session_id=9062');assert.equal(negative.n,0);
      await assert.rejects(suppressAppointmentAttendanceCopays({id:999,agencyId:1,clinicalSessionId:9060},45),/payment has already started/);
      const [[paid]]=await setup.execute('SELECT attendance,collection_status FROM family_copay_attendance WHERE clinical_session_id=9060');assert.deepEqual(paid,{attendance:'occurred',collection_status:'paid'});
      await suppressAppointmentAttendanceCopays({id:999,agencyId:1,clinicalSessionId:9062},45);
      const [[held]]=await setup.execute('SELECT attendance,collection_status FROM family_copay_attendance WHERE clinical_session_id=9062');assert.deepEqual(held,{attendance:'did_not_occur',collection_status:'suppressed'});
    });
    await t.test('midnight before processor dispatch cancels only the known unsent attempt',async()=>{
      const {claimProcessorDispatch}=await import('../familyLedger/paymentDispatch.js');
      const [[allocation]]=await setup.execute('SELECT id FROM family_receivable_allocations WHERE receivable_id=?',[paidBalance.id]);
      const snapshot=encryptFamilyBilling({synthetic:true},`ledger-payment:1:${allocation.id}`);
      const [inserted]=await setup.execute("INSERT INTO family_ledger_payments(agency_id,allocation_id,payer_user_id,processor,amount_cents,currency,idempotency_key,snapshot_encrypted,created_by_user_id) VALUES(1,?,10,'STRIPE',2500,'USD','midnight-no-dispatch',?,10)",[allocation.id,snapshot]);
      const checkDate=async()=>{throw Object.assign(new Error('Service date passed'),{code:'COPAY_AFTER_SERVICE_DATE'});};
      const before=processorCharges;
      await assert.rejects(claimProcessorDispatch({attempt:{id:inserted.insertId},agencyId:1,userId:10,allocationId:allocation.id,automatic:true},{database:setup,checkDate}),error=>error.code==='COPAY_AFTER_SERVICE_DATE');
      const [[row]]=await setup.execute('SELECT status,processor_intent_id,processor_dispatch_started_at FROM family_ledger_payments WHERE id=?',[inserted.insertId]);
      assert.equal(row.status,'cancelled');assert.equal(row.processor_intent_id,null);assert.ok(row.processor_dispatch_started_at);assert.equal(processorCharges,before);
      const [[audit]]=await setup.execute("SELECT COUNT(*) n FROM family_billing_audit WHERE agency_id=1 AND action='automatic_copay_stopped_before_dispatch' AND object_id=?",[inserted.insertId]);assert.equal(audit.n,1);
    });
  } finally {await setup.end();if(pool)await pool.end();if(clinical)await clinical.end();}
});
