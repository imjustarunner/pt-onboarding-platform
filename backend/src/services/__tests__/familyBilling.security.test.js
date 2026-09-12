import test, { after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { linkAllowsBilling, requireResponsiblePayer, recordBillingConsent, BILLING_TERMS_VERSION } from '../familyBillingPolicy.service.js';
import { insuranceForIntakeClient, applySubmittedClientInsurance, normalizePolicy } from '../clientInsurance.service.js';
import { validateSetupOwnership } from '../familyCardSetup.service.js';
import { verifyPaymentResult } from '../familyBillingPayment.service.js';
import { paymentCardSummary } from '../../models/GuardianPaymentCard.model.js';
import { matchesIntakeSession } from '../../middleware/intakeBillingSession.middleware.js';
import { getFamilyBillingSummary, saveFamilyInsurance, assignCard } from '../familyBilling.service.js';
import { buildClaimMdJsonClaim } from '../claimMd.service.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import {decryptIntakeSubmissionRow} from '../intakeResponsesEncryption.service.js';

beforeEach(()=>{mock.restoreAll();process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,3).toString('base64');process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID='v1';delete process.env.FAMILY_BILLING_PREVIOUS_KEYS_JSON;});
after(async()=>{mock.restoreAll();await pool.end();});

test('encryption is randomized, authenticated, and bound to owner/agency',()=>{
 const value={memberId:'private-member',subscriberName:'Private Person'};
 const a=encryptFamilyBilling(value,'insurance:1:2'),b=encryptFamilyBilling(value,'insurance:1:2');
 assert.notEqual(a,b);assert.ok(!a.includes('private-member'));assert.deepEqual(decryptFamilyBilling(a,'insurance:1:2'),value);
 assert.throws(()=>decryptFamilyBilling(a,'insurance:2:2'));
 const changed=JSON.parse(a);changed.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>decryptFamilyBilling(changed,'insurance:1:2'));
});
test('missing encryption key fails closed and old key IDs support rotation',()=>{
 const encrypted=encryptFamilyBilling({secret:1},'scope');const old=process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64;
 delete process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64;assert.throws(()=>encryptFamilyBilling({},'scope'));
 process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID='v2';process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,4).toString('base64');
 assert.throws(()=>decryptFamilyBilling(encrypted,'scope'));
 process.env.FAMILY_BILLING_PREVIOUS_KEYS_JSON=JSON.stringify({v1:old});assert.deepEqual(decryptFamilyBilling(encrypted,'scope'),{secret:1});
});
test('self accounts, revoked links, malformed permissions, and no-view links cannot manage billing',()=>{
 const base={access_enabled:1,relationship_type:'guardian'};assert.equal(linkAllowsBilling(base),true);
 for(const patch of [{access_enabled:0},{access_enabled:null},{relationship_type:'self'},{permissions_json:'{'},{permissions_json:{noView:true}},{permissions_json:{noViewOtherGuardian:true}}]) assert.equal(linkAllowsBilling({...base,...patch}),false);
});
test('a linked guardian still needs an explicit payer assignment in the same agency',async()=>{
 const calls=[];const db={execute:async(sql,args)=>{calls.push(args);return sql.includes('client_guardians')?[[{access_enabled:1,relationship_type:'guardian'}]]:[[]];}};
 await assert.rejects(requireResponsiblePayer(2,10,1,db),e=>e.status===403);assert.deepEqual(calls,[[2,10,1],[2,10,1]]);
});
test('client-specific insurance never defaults to every sibling and Medicaid IDs stay per child',()=>{
 const shared={primary:{insurerName:'Carrier',memberId:'parent-id',subscriberName:'Parent'}};
 assert.equal(insuranceForIntakeClient(shared,1,2),null);
 assert.equal(insuranceForIntakeClient({...shared,clientCoverages:[{clientIndex:0,confirmed:true}]},1,2),null);
 const perChild=insuranceForIntakeClient({...shared,medicaidByClient:[{clientIndex:0,memberId:'child-a'},{clientIndex:1,memberId:'child-b'}]},1,2);
 assert.equal(perChild.primary.memberId,'child-b');assert.equal(perChild.primary.relationshipToSubscriber,'self');
});
test('intake session tokens are mandatory and checked exactly',()=>{
 const token='a'.repeat(36);assert.equal(matchesIntakeSession(token,token),true);for(const other of ['',undefined,'b'.repeat(36),'a'.repeat(35)])assert.equal(matchesIntakeSession(other,token),false);
});
test('Stripe setup rejects another customer, guardian, agency, submission, or unconfirmed intent',()=>{
 const base={setup:{guardian_user_id:2,agency_id:1,intake_submission_id:8,customer_id:'cus_ours'},userId:2,agencyId:1,submissionId:8,intent:{status:'succeeded',customer:'cus_ours',payment_method:'pm_ours'},method:{id:'pm_ours',customer:'cus_ours',type:'card'}};
 assert.doesNotThrow(()=>validateSetupOwnership(base));
 for(const patch of [{userId:3},{agencyId:9},{submissionId:9},{intent:{...base.intent,status:'requires_action'}},{intent:{...base.intent,customer:'cus_other'}},{method:{...base.method,customer:'cus_other'}}])assert.throws(()=>validateSetupOwnership({...base,...patch}));
});
test('card API summaries exclude processor IDs and ciphertext',()=>{
 const card=paymentCardSummary({id:1,card_last4:'4242',stripe_customer_id:'secret',stripe_payment_method_id:'secret',private_payload:'encrypted',method_fingerprint:'sensitive'});
 assert.equal(card.card_last4,'4242');assert.equal(JSON.stringify(card).includes('secret'),false);assert.equal('private_payload' in card,false);
});
test('browser success cannot substitute for verified amount, currency, customer, and Stripe status',()=>{
 const expected={amountCents:2500,currency:'USD',customerId:'cus_ours'},intent={status:'succeeded',amount_received:2500,currency:'usd',customer:'cus_ours'};
 assert.doesNotThrow(()=>verifyPaymentResult(intent,expected));
 for(const patch of [{status:'processing'},{amount_received:1},{currency:'eur'},{customer:'cus_other'}])assert.throws(()=>verifyPaymentResult({...intent,...patch},expected));
});
test('consent must be affirmative, signed, and current; evidence is encrypted',async()=>{
 const calls=[];const db={execute:async(sql,args)=>{calls.push(args);return[{insertId:1}];}};
 for(const consent of [{accepted:false,version:BILLING_TERMS_VERSION,signatureName:'Parent'},{accepted:true,version:'old',signatureName:'Parent'},{accepted:true,version:BILLING_TERMS_VERSION,signatureName:''}]) await assert.rejects(recordBillingConsent({userId:2,agencyId:1,purpose:'recurring',consent},db));
 assert.equal(calls.length,0);
 await recordBillingConsent({userId:2,agencyId:1,clientId:10,cardId:4,purpose:'recurring',consent:{accepted:true,version:BILLING_TERMS_VERSION,signatureName:'Parent',limitCents:2500}},db);
 const evidence=decryptFamilyBilling(calls[0][8],'consent:1:2');assert.equal(evidence.signatureName,'Parent');assert.equal(evidence.recurringLimitCents,2500);assert.ok(evidence.terms.includes('revoke'));
});
test('nonpayer and child overview returns only payer names, never cards or insurance',async()=>{
 mock.method(pool,'execute',async sql=>{
  if(sql.includes('SELECT c.id'))return [[{id:10,full_name:'Child',access_enabled:1,relationship_type:'self'}]];
  if(sql.includes('SELECT p.guardian_user_id'))return [[{guardian_user_id:3,first_name:'Other',last_name:'Parent',payment_card_id:55,consent_id:5}]];
  if(sql.includes('agency_billing_accounts'))return [[]];
  throw new Error('Private data queried for nonpayer');
 });
 const result=await getFamilyBillingSummary(2,1);assert.deepEqual(result.cards,[]);assert.deepEqual(result.profiles,[]);
 assert.deepEqual(result.clients[0].responsiblePayers,[{name:'Other Parent'}]);assert.equal(result.clients[0].canManageBilling,false);assert.equal('paymentCardId' in result.clients[0],false);
});
test('multi-client insurance requires explicit coverage and prohibits shared Medicaid IDs',async()=>{
 mock.method(pool,'execute',async sql=>sql.includes('client_guardians')?[[{access_enabled:1,relationship_type:'guardian'}]]:[[{guardian_user_id:2}]]);
 const base={userId:2,agencyId:1,clientIds:[10,11],coverageConfirmed:true,primary:{insurerName:'Carrier',memberId:'x',subscriberName:'Parent',relationshipToSubscriber:'child'}};
 await assert.rejects(saveFamilyInsurance({...base,coverageScope:'client'}),e=>e.status===400);
 await assert.rejects(saveFamilyInsurance({...base,coverageScope:'account_holder',primary:{...base.primary,isMedicaid:true}}),e=>e.status===400);
});
test('assigning another guardian’s card rolls back without creating consent',async()=>{
 let rolledBack=false;const db={beginTransaction:async()=>{},rollback:async()=>{rolledBack=true;},release:()=>{},execute:async sql=>{
  if(sql.includes('client_guardians'))return [[{access_enabled:1,relationship_type:'guardian'}]];
  if(sql.includes('client_billing_payers'))return [[{guardian_user_id:2}]];
  if(sql.includes('SELECT id FROM clients'))return [[{id:10}]];
  if(sql.includes('guardian_payment_cards'))return [[]];
  throw new Error('Unexpected write');
 }};mock.method(pool,'getConnection',async()=>db);
 await assert.rejects(assignCard({userId:2,agencyId:1,clientId:10,cardId:999,recurring:true}),e=>e.status===403);assert.equal(rolledBack,true);
});
const insurance={verifiedForClaims:true,acceptAssignment:true,primary:{payerId:'12345',insurerName:'Carrier',memberId:'MEMBER-1',subscriberFirstName:'Parent',subscriberLastName:'One',subscriberDob:'1980-01-01',subscriberSex:'F',subscriberAddressLine1:'1 Main',subscriberCity:'Denver',subscriberState:'CO',subscriberPostalCode:'80000',relationshipToSubscriber:'child'},patient:{firstName:'Child',lastName:'One',dateOfBirth:'2010-01-01',sex:'M',addressLine1:'1 Main',city:'Denver',state:'CO',postalCode:'80000'}};
const claim={id:1,billing_npi:'1234567893',rendering_npi:'1234567893',diagnosis_codes_json:'["F41.1"]',place_of_service:'11',date_of_service:'2026-09-11'};
const practice={name:'Practice',tax_id:'12-3456789',street_address:'1 Main',city:'Denver',state:'CO',postal_code:'80000',phone_number:'3035550100'};
const lines=[{procedure_code:'90834',charge_cents:12500,units:1,modifiers_json:'["GT"]',diagnosis_pointers:'1'}];
test('Claim.MD uses documented patient/subscriber fields, cents-to-dollars and secondary information',()=>{
 const payload=buildClaimMdJsonClaim(claim,lines,{insurance:{...insurance,secondary:{...insurance.primary,memberId:'SECONDARY'}},practice});
 assert.equal(payload.pat_name_f,'Child');assert.equal(payload.ins_name_f,'Parent');assert.equal(payload.pat_rel,'19');assert.equal(payload.ins_number,'MEMBER-1');assert.equal(payload.other_ins_number,'SECONDARY');assert.equal(payload.charge[0].charge,'125.00');assert.equal(payload.charge[0].mod1,'GT');assert.equal(payload.diag_1,'F411');assert.equal(payload.charge[0].diag_ref,'A');assert.equal(payload.accept_assign,'Y');
});
test('claims with missing identity, payer ID, or unreviewed insurance are blocked',()=>{
 for(const bad of [{...insurance,verifiedForClaims:false},{...insurance,primary:{...insurance.primary,payerId:''}},{...insurance,patient:{}}])assert.throws(()=>buildClaimMdJsonClaim(claim,lines,{insurance:bad,practice}),e=>e.status===409);
});

test('a second guardian’s submitted policy does not overwrite existing coverage',async()=>{
 let writes=0;const payload=encryptFamilyBilling({primary:{memberId:'ORIGINAL'},profileId:3},'client-insurance:1:10');
 const db={execute:async sql=>{if(sql.startsWith('UPDATE'))writes++;return sql.includes('billing_insurance_payload')?[[{billing_insurance_payload:payload}]]:[[{id:10}]];}};
 assert.equal(await applySubmittedClientInsurance({agencyId:1,clientId:10,profileId:4,primary:{memberId:'OTHER'}},db),false);assert.equal(writes,0);
});
test('intake cannot create plaintext insurance rows when encryption is absent',async()=>{
 const old=process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64,guardianKey=process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64;
 delete process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64;delete process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64;
 let writes=0;mock.method(pool,'execute',async()=>{writes++;return[{insertId:1}];});
 try{await assert.rejects(IntakeSubmission.create({intakeLinkId:1,intakeData:{insuranceInfo:{primary:{memberId:'SECRET'}}}}));assert.equal(writes,0);assert.throws(()=>decryptIntakeSubmissionRow({payload_encrypted:Buffer.from('invalid')}),e=>e.status===503);}
 finally{if(old)process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64=old;if(guardianKey)process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64=guardianKey;}
});
test('malformed claim fields are rejected without silently truncating identity or billing values',()=>{
 assert.throws(()=>normalizePolicy({memberId:'X'.repeat(256)}));assert.throws(()=>normalizePolicy({subscriberDob:'2026-02-30'}));
 for(const line of [{...lines[0],diagnosis_pointers:'99'},{...lines[0],charge_cents:NaN},{...lines[0],modifiers_json:'invalid'},{...lines[0],service_date:'2026-02-30'}])assert.throws(()=>buildClaimMdJsonClaim(claim,[line],{insurance,practice}),e=>e.status===409);
});
