import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('insurance follow-up and split liabilities stay scoped through real SQL transactions', {skip:process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1'},async()=>{
 for(const prefix of ['DB','CLINICAL_DB'])for(const [key,value] of Object.entries({HOST:'127.0.0.1',PORT:'33316',NAME:'family_billing_test'}))assert.equal(process.env[`${prefix}_${key}`],value);
 const {default:pool}=await import('../../config/database.js');const {default:clinicalPool}=await import('../../config/clinicalDatabase.js');
 const {default:mysql}=await import('mysql2/promise');
 const db=await mysql.createConnection({host:'127.0.0.1',port:33316,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'family_billing_test',multipleStatements:true});
 try{
  const [tables]=await db.query('SHOW TABLES');await db.query('SET FOREIGN_KEY_CHECKS=0');for(const t of tables)await db.query(`DROP TABLE \`${Object.values(t)[0]}\``);await db.query('SET FOREIGN_KEY_CHECKS=1');
  // Synthetic fixture only. This guard and local-only database prevent live-data tests.
  let fixture=await readFile(new URL('../../../fixtures/family-billing-security.sql',import.meta.url),'utf8');fixture=fixture.slice(fixture.indexOf('CREATE TABLE agencies'));await db.query(fixture);
  for(const file of ['613_guardian_insurance_payment.sql','1413_private_family_billing.sql','1414_family_receivables_and_workflows.sql','1486_client_coverage_verification.sql','1520_guardian_shared_billing.sql','1640_insurance_followups_and_payer_shares.sql','1687_dependent_portal_access.sql','1688_client_portal_independence.sql'])await db.query(await readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8'));
  await db.query(`ALTER TABLE agencies ADD slug VARCHAR(100),ADD portal_url VARCHAR(100),ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0,ADD organization_type VARCHAR(20) DEFAULT 'agency',ADD feature_flags JSON;
   ALTER TABLE users ADD email VARCHAR(100),ADD status VARCHAR(30) DEFAULT 'ACTIVE',ADD is_active BOOLEAN DEFAULT 1,ADD is_archived BOOLEAN DEFAULT 0,ADD is_demo BOOLEAN DEFAULT 0;
   ALTER TABLE clients ADD date_of_birth DATE,ADD status VARCHAR(30) DEFAULT 'ACTIVE',ADD compliance_archived_at DATETIME,ADD client_type VARCHAR(32) DEFAULT 'clinical',ADD insurance_type_id INT;
   CREATE TABLE insurance_types(id INT PRIMARY KEY,insurance_key VARCHAR(64),label VARCHAR(255));
   CREATE TABLE intake_links(id INT PRIMARY KEY,scope_type VARCHAR(32),organization_id INT,form_type VARCHAR(32),master_channel VARCHAR(32));
   CREATE TABLE intake_submissions(id INT PRIMARY KEY,intake_link_id INT,guardian_user_id INT,client_id INT,status VARCHAR(32),submitted_at DATETIME);
   CREATE TABLE intake_submission_clients(intake_submission_id INT,client_id INT);
   CREATE TABLE organization_affiliations(organization_id INT,agency_id INT,is_active BOOLEAN);
   CREATE TABLE agency_schools(school_organization_id INT,agency_id INT,is_active BOOLEAN);
   INSERT INTO intake_links VALUES(1,'agency',1,'intake',NULL);
   INSERT INTO intake_submissions VALUES(1,1,10,101,'submitted',UTC_TIMESTAMP());
   ALTER TABLE family_receivables ADD insurance_fingerprint CHAR(64);
   UPDATE clients SET date_of_birth='2017-01-01';
   INSERT INTO client_billing_payers(agency_id,client_id,guardian_user_id) VALUES(1,101,10),(1,101,20);
   INSERT INTO guardian_portal_policies(agency_id,client_id,shared_billing) VALUES(1,101,1);`);
  await db.query(await readFile(new URL('../../../../database/migrations/1641_reviewed_insurance_email_tasks.sql',import.meta.url),'utf8'));
  await db.execute("UPDATE users SET email='synthetic@example.invalid' WHERE id=10");
  const {default:Profiles}=await import('../../models/GuardianInsuranceProfile.model.js');
  const {writeClientInsurance,readClientInsurance}=await import('../clientInsurance.service.js');
  const {listCardTasks,uploadCard,updateCardTask,cardContext,cardFile}=await import('../insuranceCards/service.js');
  const {cardCycle}=await import('../insuranceCards/policy.js');
  const primary={insurerName:'Synthetic commercial',memberId:'NOT-REAL'},secondary={insurerName:'Synthetic secondary commercial',memberId:'NOT-REAL-SECONDARY',isMedicaid:false};
  const profileId=await Profiles.upsert({guardianUserId:10,agencyId:1,clientId:101,primary,secondary});
  await writeClientInsurance({agencyId:1,clientId:101,primary,secondary,profileId});
  let [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['primary_front','primary_back','secondary_front','secondary_back']);
  assert.ok(Object.values(task.slots).every(slot=>slot.required===false));
  assert.equal((await listCardTasks({agencyId:1,userId:20})).length,0);
  await assert.rejects(cardContext({agencyId:2,profileId,userId:10}),e=>e.status===404);
  await assert.rejects(cardContext({agencyId:1,profileId,userId:20}),e=>e.status===404);
  // A currently linked account holder can supply insurance without accepting payment liability.
  await db.execute('DELETE FROM client_billing_payers WHERE guardian_user_id=10');
  assert.equal((await listCardTasks({agencyId:1,userId:10})).length,1);
  const saved=[];const file={mimetype:'application/pdf',buffer:Buffer.from('%PDF-1.7 synthetic'),originalname:'synthetic.pdf'};
  const deps={storage:{getGCSBucket:async()=>({name:'private-fixture',file:key=>({save:async(...args)=>saved.push({key,args})})})},crypto:{isConfigured:()=>true,encryptBuffer:async()=>({encryptedBuffer:Buffer.from('encrypted'),encryptionKeyId:'synthetic',encryptionWrappedKeyB64:'key',encryptionIvB64:'iv',encryptionAuthTagB64:'tag'})}};
  const input={agencyId:1,userId:10,profileId,cycle:task.cycle};
  // Real SQL locks, durable review/send key and a personal reminder across sessions.
  const staffTasks=await import('../insuranceCards/staffTasks.js');
  const {INTAKE_COMMUNICATION_VERSION}=await import('../intakeCommunicationChoices.service.js');
  const staffUser={id:99,role:'super_admin'},staffInput={agencyId:1,profileId,cycle:task.cycle};
  let sends=0;
  // Consent is covered by the policy tests; this fixture exercises SQL locks and delivery deduplication.
  const staffDeps={reviewer:async()=>true,choices:async()=>({version:INTAKE_COMMUNICATION_VERSION,guardianUserId:10,emailPreference:'all',signatureAccepted:true,signedAt:'2026-10-01'}),agencies:async()=>[{id:1}],preferences:async()=>({channels:{email:true}}),sender:async()=>({id:11,from_email:'billing@example.invalid'}),send:async()=>{sends++;return {id:'synthetic-delivery'};}};
  await staffTasks.snoozeCardEmail(staffUser,{...staffInput,hours:24},staffDeps);
  assert.equal((await staffTasks.listStaffCardTasks(staffUser,{},staffDeps)).rows[0].reminderDue,false);
  assert.equal((await staffTasks.listStaffCardTasks({...staffUser,id:98},{},staffDeps)).rows[0].reminderDue,true);
  const email=await staffTasks.previewCardEmail(staffUser,staffInput,staffDeps);assert.equal(email.canSend,true);
  const sendInput={...staffInput,reviewHash:email.reviewHash};
  const outcomes=await Promise.allSettled([staffTasks.sendReviewedCardEmail(staffUser,sendInput,staffDeps),staffTasks.sendReviewedCardEmail({...staffUser,id:98},sendInput,staffDeps)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(sends,1);
  const [[delivery]]=await db.execute('SELECT status,reviewed_by_user_id,reviewed_content_hash FROM insurance_card_deliveries WHERE profile_id=?',[profileId]);
  assert.equal(delivery.status,'sent');assert.equal(delivery.reviewed_content_hash,email.reviewHash);assert.ok([98,99].includes(delivery.reviewed_by_user_id));
  await assert.rejects(staffTasks.sendReviewedCardEmail(staffUser,sendInput,staffDeps),e=>e.status===409);
  assert.equal((await staffTasks.listStaffCardTasks(staffUser,{},staffDeps)).rows[0].reminderDue,false);
  // Both sides upload concurrently without losing either encrypted URL.
  await Promise.all(['primary_front','primary_back'].map(slot=>uploadCard({...input,slot},file,deps)));
  [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['secondary_front','secondary_back']);
  await Promise.all(['secondary_front','secondary_back'].map(slot=>uploadCard({...input,slot},file,deps)));
  [task]=await listCardTasks({agencyId:1,userId:10});assert.equal(task.state,'review');assert.equal(task.missingSlots.length,0);assert.equal(saved.length,4);
  assert.ok(saved.every(x=>x.key.startsWith(`insurance-cards/1/${profileId}/`)));
  const fileDeps={storage:{getGCSBucket:async()=>({name:'private-fixture',file:key=>{assert.ok(key.startsWith(`insurance-cards/1/${profileId}/primary_front-`));return {download:async()=>[Buffer.from('encrypted')],getMetadata:async()=>[{metadata:{isEncrypted:'1',originalMimeType:'application/pdf',encryptionKeyId:'synthetic',encryptionWrappedKey:'key',encryptionIv:'iv',encryptionAuthTag:'tag',encryptionAad:'source-aad'}}]};}})},crypto:{decryptBuffer:async input=>{assert.equal(input.aad,'source-aad');assert.equal(input.encryptionWrappedKeyB64,'key');return file.buffer;}}};
  assert.deepEqual((await cardFile(input,'primary_front',fileDeps)).body,file.buffer);
  await assert.rejects(cardFile({...input,userId:20},'primary_front',fileDeps),e=>e.status===404);
  const [[raw]]=await db.execute('SELECT private_payload FROM guardian_insurance_profiles WHERE id=?',[profileId]);assert.ok(!JSON.stringify(raw).includes('gs://'));
  await updateCardTask({...input,staff:true,userId:99,action:'complete',reason:'Both synthetic images readable'});
  assert.equal((await listCardTasks({agencyId:1,userId:10}))[0].state,'complete');
  await updateCardTask({...input,staff:true,userId:99,action:'replace',slots:['primary_back'],reason:'Synthetic glare'});
  [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['primary_back']);
  await updateCardTask({...input,action:'help'});assert.equal((await listCardTasks({agencyId:1,userId:10}))[0].state,'help');
  await updateCardTask({...input,action:'resume'});await uploadCard({...input,slot:'primary_back'},file,deps);assert.equal((await listCardTasks({agencyId:1,userId:10}))[0].state,'review');
  await db.execute('UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=10');
  assert.equal((await listCardTasks({agencyId:1,userId:10})).length,0);await assert.rejects(uploadCard({...input,slot:'primary_front'},file,deps),e=>e.status===404);
  await db.execute('UPDATE client_guardians SET access_enabled=1 WHERE guardian_user_id=10');
  const changed={...primary,memberId:'REPLACED-NOT-REAL'};
  await Profiles.upsert({profileId,guardianUserId:10,agencyId:1,clientId:101,primary:changed,secondary});await writeClientInsurance({agencyId:1,clientId:101,primary:changed,secondary,profileId});
  await assert.rejects(uploadCard({...input,slot:'primary_front'},file,deps),e=>e.status===409);
  [task]=await listCardTasks({agencyId:1,userId:10});assert.notEqual(task.cycle,input.cycle);assert.equal(task.missingSlots.length,4);
  // Current verification suppresses reminders without requiring either policy's images.
  const {coverageFingerprint}=await import('../coverageVerification.service.js');const {encryptFamilyBilling}=await import('../familyBillingEncryption.service.js');
  const fingerprint=coverageFingerprint(await readClientInsurance(101,1));
  await db.execute("INSERT INTO client_coverage_reviews (agency_id,client_id,service_date,insurance_fingerprint,status,evidence_encrypted,created_by_user_id) VALUES (1,101,UTC_DATE(),?,'verified',?,99)",[fingerprint,encryptFamilyBilling({reference:'Synthetic verification'},'coverage:1:101')]);
  [task]=await listCardTasks({agencyId:1,userId:10});assert.equal(task.coverageVerified,true);assert.equal(task.state,'not_required');assert.deepEqual(task.missingSlots,[]);
  assert.equal((await staffTasks.previewCardEmail(staffUser,{...staffInput,cycle:task.cycle},staffDeps)).canSend,false);
  // A changed identity cannot inherit the previous coverage verification.
  await writeClientInsurance({agencyId:1,clientId:101,primary:changed,secondary,profileId,patient:{firstName:'Changed synthetic identity'}});
  [task]=await listCardTasks({agencyId:1,userId:10});assert.equal(task.coverageVerified,false);assert.equal(task.missingSlots.length,4);
  // A late Medicaid update invalidates the previous review, but only the
  // Medicaid policy's cards are suppressed while commercial coverage remains.
  const priorReview=await staffTasks.previewCardEmail(staffUser,{...staffInput,cycle:task.cycle},staffDeps);
  const medicaid={insurerName:'Medicaid',isMedicaid:true};
  await db.execute('INSERT INTO guardian_insurance_clients(profile_id,agency_id,client_id,confirmed_by_user_id) VALUES(?,1,101,99)',[profileId]);
  await Profiles.upsert({profileId,guardianUserId:10,agencyId:1,clientId:101,primary:changed,secondary:medicaid});
  await writeClientInsurance({agencyId:1,clientId:101,primary:changed,secondary:medicaid,profileId});
  await assert.rejects(staffTasks.sendReviewedCardEmail(staffUser,{...staffInput,cycle:task.cycle,reviewHash:priorReview.reviewHash},staffDeps),e=>e.status===409);
  assert.equal(sends,1);
  [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['primary_front','primary_back']);
  assert.equal(task.slots.secondary_front.encouraged,false);assert.equal(task.slots.secondary_back.encouraged,false);
  assert.equal((await staffTasks.listStaffCardTasks(staffUser,{},staffDeps)).rows.length,1);
  await Profiles.upsert({profileId,guardianUserId:10,agencyId:1,clientId:101,primary:medicaid,secondary});
  await writeClientInsurance({agencyId:1,clientId:101,primary:medicaid,secondary,profileId});
  [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['secondary_front','secondary_back']);
  assert.equal(task.slots.primary_front.encouraged,false);assert.equal(task.slots.primary_back.encouraged,false);
  await Profiles.upsert({profileId,guardianUserId:10,agencyId:1,clientId:101,primary:medicaid,secondary:null});
  await writeClientInsurance({agencyId:1,clientId:101,primary:medicaid,secondary:null,profileId});
  [task]=await listCardTasks({agencyId:1,userId:10});assert.equal(task.state,'not_required');assert.deepEqual(task.missingSlots,[]);
  assert.equal((await staffTasks.listStaffCardTasks(staffUser,{},staffDeps)).rows.length,0);
  await Profiles.upsert({profileId,guardianUserId:10,agencyId:1,clientId:101,primary:changed,secondary:medicaid});
  await writeClientInsurance({agencyId:1,clientId:101,primary:changed,secondary:medicaid,profileId});
  // Completed app enrollment is required; an imported or unfinished record stays quiet.
  await db.execute("UPDATE intake_submissions SET status='started' WHERE id=1");
  [task]=await listCardTasks({agencyId:1,userId:10});assert.equal(task.state,'not_required');
  await db.execute("UPDATE intake_submissions SET status='submitted' WHERE id=1");
  await db.execute("INSERT INTO insurance_types VALUES(1,'medicaid','Medicaid')");
  await db.execute('UPDATE clients SET insurance_type_id=1 WHERE id=101');
  // A legacy client label cannot hide a current, explicitly commercial policy.
  [task]=await listCardTasks({agencyId:1,userId:10});assert.deepEqual(task.missingSlots,['primary_front','primary_back']);
  await db.execute('UPDATE clients SET insurance_type_id=NULL WHERE id=101');
  await db.execute('UPDATE agencies SET is_archived=1 WHERE id=1');assert.equal((await listCardTasks({agencyId:1,userId:10})).length,0);await db.execute('UPDATE agencies SET is_archived=0 WHERE id=1');
  // Shared statements do not make the other guardian's portion payable by this account.
  await db.query('INSERT INTO client_billing_payers(agency_id,client_id,guardian_user_id) VALUES(1,101,10)');
  const {createReceivable,allocationsFor}=await import('../familyLedger/receivables.js');const {requestSplit,respondToSplit,listSplitRequests}=await import('../familyLedger/sharing.js');const {listBalances}=await import('../familyLedger/views.js');const {summarizeBillingNeeds}=await import('../familyLedger/needs.js');
  const r=await createReceivable({agencyId:1,clientId:101,sourceType:'staff_charge',sourceKey:'synthetic:followup',serviceDomain:'tutoring',amountCents:10001,shares:[{payerUserId:10,basisPoints:10000}]});
  const split=await requestSplit({agencyId:1,receivableId:r.id,userId:10,shares:[{payerUserId:10,basisPoints:6000},{payerUserId:20,basisPoints:4000}],consent:{accepted:true,signatureName:'Synthetic Parent'}});
  assert.equal((await listSplitRequests({agencyId:1,userId:20}))[0].needsMyAcceptance,true);
  assert.equal((await listSplitRequests({agencyId:1,userId:10}))[0].needsMyAcceptance,false);
  assert.equal((await allocationsFor(r.id)).length,1);
  await assert.rejects(respondToSplit({agencyId:1,requestId:split.requestId,userId:30,accept:true,signatureName:'Child'}),e=>e.status===403);
  await respondToSplit({agencyId:1,requestId:split.requestId,userId:20,accept:true,signatureName:'Second Synthetic Parent'});
  const allocations=await allocationsFor(r.id);assert.deepEqual(allocations.map(a=>[a.amount_cents,a.share_basis_points,a.share_basis]),[[6001,6000,'total'],[4000,4000,'total']]);
  const first=await listBalances({agencyId:1,userId:10}),second=await listBalances({agencyId:1,userId:20});
  assert.equal(first.length,2);assert.equal(first.filter(x=>x.canPay).length,1);assert.equal(summarizeBillingNeeds({balances:first}).dueCents,6001);assert.equal(summarizeBillingNeeds({balances:second}).dueCents,4000);
  const [notices]=await db.execute('SELECT guardian_user_id FROM family_balance_notifications WHERE receivable_id=? ORDER BY guardian_user_id',[r.id]);assert.deepEqual(notices.map(x=>x.guardian_user_id),[10,20]);
  const {recordCash}=await import('../familyLedger/payments.js');
  await recordCash({agencyId:1,allocationId:allocations[0].id,payerUserId:10,amountCents:1000,idempotencyKey:'synthetic-partial-payment',actorUserId:99,note:'Synthetic test receipt'});
  const {applyFinalClaimResponsibility}=await import('../familyLedger/receivables.js');const {transaction}=await import('../familyLedger/policy.js');
  const adjusted=await createReceivable({agencyId:1,clientId:101,sourceType:'staff_charge',sourceKey:'synthetic:adjusted',serviceDomain:'tutoring',amountCents:10001,shares:[{payerUserId:10,basisPoints:6000},{payerUserId:20,basisPoints:4000}]});
  await transaction(connection=>applyFinalClaimResponsibility(adjusted,7003,{verificationReason:'Synthetic final responsibility'},99,connection));
  assert.deepEqual((await allocationsFor(adjusted.id)).map(a=>a.amount_cents),[4202,2801]);
  const partialSplit=await requestSplit({agencyId:1,receivableId:r.id,userId:10,shares:[{payerUserId:10,basisPoints:2500},{payerUserId:20,basisPoints:7500}],consent:{accepted:true,signatureName:'Synthetic Parent'}});
  await respondToSplit({agencyId:1,requestId:partialSplit.requestId,userId:20,accept:true,signatureName:'Second Synthetic Parent'});
  const partial=await allocationsFor(r.id);assert.deepEqual(partial.map(a=>[a.amount_cents,a.paid_cents,a.share_basis_points,a.share_basis]),[[3250,1000,2500,'remaining'],[6751,0,7500,'remaining']]);
  assert.equal(summarizeBillingNeeds({balances:await listBalances({agencyId:1,userId:10})}).dueCents,2250);
  const stale=await requestSplit({agencyId:1,receivableId:r.id,userId:10,shares:[{payerUserId:10,basisPoints:5000},{payerUserId:20,basisPoints:5000}],consent:{accepted:true,signatureName:'Synthetic Parent'}});
  await recordCash({agencyId:1,allocationId:allocations[0].id,payerUserId:10,amountCents:500,idempotencyKey:'synthetic-intervening-payment',actorUserId:99,note:'Synthetic test receipt'});
  assert.equal((await respondToSplit({agencyId:1,requestId:stale.requestId,userId:20,accept:true,signatureName:'Second Synthetic Parent'})).status,'cancelled');
  await db.execute('UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=20');assert.deepEqual(await listBalances({agencyId:1,userId:20}),[]);
 }finally{await db.end();await pool.end();await clinicalPool.end();}
});
