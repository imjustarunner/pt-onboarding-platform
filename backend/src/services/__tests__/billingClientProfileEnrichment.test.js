import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:async()=>state.db}}));
import {extractBillingProfileFields,enrichExistingClientsFromBillingRows,strictBillingProfileDate} from '../billingClientProfileEnrichment.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {encryptDemographicsPayload,decryptDemographicsPayload} from '../demographicsImport.service.js';
let clients,identities,observations,calls,snapshot,failObservation,assignments;
const client=(values={})=>({id:10,agency_id:2,status:'ACTIVE',full_name:'Alex Rivera',date_of_birth:'2010-04-09',gender:null,address_street:null,address_apt:null,address_city:null,address_state:null,address_zip:null,contact_phone:null,email:null,primary_insurer_name:null,insurance_member_id:null,insurance_group_number:null,insurance_subscriber_name:null,billing_insurance_payload:null,demographics_phi_enc:null,...values});
const row=(fields={},extra={})=>({sourceRowNumber:2,rowFingerprint:'a'.repeat(64),serviceDate:'2026-10-20',profileFields:{fullName:'Alex Rivera',dateOfBirth:'2010-04-09',primaryPayer:'Example Health',...fields},...extra});
const enrich=(rows=[row()],extra={})=>enrichExistingClientsFromBillingRows({agencyId:2,payrollImportId:8,actorId:99,rows,dryRun:false,...extra});
const storedInsurance=()=>decryptFamilyBilling(clients[0].billing_insurance_payload,'client-insurance:2:10');
beforeEach(()=>{
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,4).toString('base64'));vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_ID','test');vi.stubEnv('FAMILY_BILLING_PREVIOUS_KEYS_JSON','{}');
 vi.stubEnv('CLIENT_PHI_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,5).toString('base64'));vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,6).toString('base64'));
 clients=[client()];identities=[];assignments=[];observations=[];calls=[];failObservation=false;snapshot=null;
 state.db={
  beginTransaction:vi.fn(async()=>{snapshot=structuredClone({clients,identities,observations});}),commit:vi.fn(async()=>{snapshot=null;}),rollback:vi.fn(async()=>{if(snapshot){clients=snapshot.clients;identities=snapshot.identities;observations=snapshot.observations;}snapshot=null;}),release:vi.fn(),
  execute:vi.fn(async(sql,params=[])=>{
   calls.push({sql,params});
   if(sql.startsWith('SELECT id FROM payroll_imports'))return [params[0]===8&&params[1]===2?[{id:8}]:[]];
   if(sql.includes('FROM client_provider_assignments cpa JOIN clients'))return [structuredClone(assignments.filter(a=>clients.some(c=>c.id===a.client_id&&c.agency_id===params[0])&&a.is_active))];
   if(sql.includes('FROM client_provider_assignments WHERE client_id='))return [structuredClone(assignments.filter(a=>a.client_id===params[0]&&a.provider_user_id===params[1]&&a.is_active))];
   if(sql.includes('FROM client_billing_identities'))return [structuredClone(identities.filter(i=>i.agency_id===params[0]))];
   if(sql.startsWith('SELECT')&&sql.includes('FROM billing_client_profile_observations'))return [structuredClone(observations.filter(o=>o.agency_id===params[0]&&o.payroll_import_id===params[1]&&o.source_row_number===params[2]&&o.row_fingerprint===params[3]))];
   if(sql.startsWith('SELECT')&&sql.includes('FROM clients WHERE agency_id='))return [structuredClone(clients.filter(c=>c.agency_id===params[0]&&c.status!=='ARCHIVED'))];
   if(sql.startsWith('SELECT')&&sql.includes('FROM clients WHERE id='))return [structuredClone(clients.filter(c=>c.id===params[0]&&c.agency_id===params[1]))];
   if(sql.startsWith('UPDATE clients SET')){
    const columns=sql.match(/SET (.+) WHERE/)[1].split(',').map(c=>c.split('=')[0]);const c=clients.find(c=>c.id===params[params.length-2]&&c.agency_id===params[params.length-1]);
    if(!c)throw Error('Missing synthetic client');columns.forEach((column,i)=>c[column]=params[i]);return [{affectedRows:1}];
   }
   if(sql.startsWith('INSERT INTO billing_client_profile_observations')){
    if(failObservation)throw Error('Driver error containing SYNTHETIC PRIVATE VALUE');
    const columns=['agency_id','payroll_import_id','source_row_number','row_fingerprint','client_id','source_service_date','match_status','match_method','observed_fields_payload','changed_fields_json','reason_codes_json','created_by_user_id'];
    observations.push(Object.fromEntries(columns.map((key,i)=>[key,params[i]])));return [{insertId:observations.length}];
   }
   throw Error('Unexpected SQL: '+sql);
  })
 };
});
afterEach(()=>vi.unstubAllEnvs());
it('extracts allowlisted source fields and keeps account numbers distinct from explicit member IDs',()=>{
 const fields=extractBillingProfileFields({'First Name':'Alex','Last Name':'Rivera','Date of Birth':'04/09/2010','Patient account number or member id':'ACCOUNT-7','Primary Payer Name':'Example Health','Patient Email':'alex@example.test','Email':'provider@example.test','Diagnosis':'PRIVATE DX','Patient Balance Status':'Paid in Full'});
 expect(fields).toMatchObject({fullName:'Alex Rivera',dateOfBirth:'2010-04-09',explicitMemberId:'',reportedAccountIdentifier:'ACCOUNT-7',primaryPayer:'Example Health',email:'alex@example.test',reportedClaimStatus:'Paid in Full'});
 expect(fields.reasonCodes).toContain('ambiguous_account_identifier');expect(fields).not.toHaveProperty('diagnosis');
});
it('rejects invalid and future DOBs, generic provider contact fields and first-name-only identity',async()=>{
 expect(strictBillingProfileDate('2026-02-30')).toBeNull();expect(strictBillingProfileDate('02/29/2024')).toBe('2024-02-29');
 const fields=extractBillingProfileFields({'First Name':'Alex','Date of Birth':'2099-01-01','Email':'provider@example.test','Phone':'555-0100'});
 expect(fields.fullName).toBe('');expect(fields.email).toBe('');expect(fields.contactPhone).toBe('');expect(fields.reasonCodes).toContain('invalid_date_of_birth');
 const result=await enrich([row(fields)]);expect(result.rows[0].matchStatus).toBe('conflict');expect(calls.some(c=>c.sql.startsWith('UPDATE clients'))).toBe(false);
});
it('fills missing profile information on one exact full-name and DOB match, retaining the encrypted evidence',async()=>{
 const result=await enrich([row({sex:'F',addressStreet:'Synthetic street',email:'alex@example.test',explicitMemberId:'MEMBER-7'})]);
 expect(result.rows[0]).toMatchObject({clientId:10,matchStatus:'matched',matchMethod:'exact_full_name_dob'});expect(result.counts.clientsWithChanges).toBe(1);
 expect(clients[0]).toMatchObject({gender:'F',address_street:'Synthetic street',email:'alex@example.test',primary_insurer_name:'Example Health'});
 expect(storedInsurance()).toMatchObject({verifiedForClaims:false,primary:{insurerName:'Example Health',memberId:'MEMBER-7'},profileId:null,confirmedBy:null});
 expect(decryptDemographicsPayload(clients[0].demographics_phi_enc)).toMatchObject({fullName:'Alex Rivera',dateOfBirth:'2010-04-09',email:'alex@example.test'});
 const evidence=decryptFamilyBilling(observations[0].observed_fields_payload,'billing-client-profile-observation:2:8:2:'+observations[0].row_fingerprint);expect(evidence.fields.explicitMemberId).toBe('MEMBER-7');
 expect(observations[0].observed_fields_payload).not.toContain('Alex Rivera');expect(JSON.stringify(result)).not.toContain('MEMBER-7');expect(JSON.stringify(result)).not.toContain('alex@example.test');
});
it('does not match another agency or arbitrarily pick a duplicate identity',async()=>{
 clients=[client({agency_id:6})];let result=await enrich();expect(result.rows[0].matchStatus).toBe('unmatched');
 clients=[client(),client({id:11})];result=await enrich([row({}, {sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);expect(result.rows[0].matchStatus).toBe('ambiguous');expect(result.rows[0].clientId).toBeNull();expect(calls.some(c=>c.sql.startsWith('UPDATE clients'))).toBe(false);
});
it('rejects a conflicting DOB or insurance member identifier even when other names agree',async()=>{
 clients[0].insurance_member_id='EXISTING-1';let result=await enrich([row({explicitMemberId:'OTHER-2'})]);expect(result.rows[0].reasonCodes).toContain('member_id_conflict');expect(result.rows[0].clientId).toBeNull();
 result=await enrich([row({dateOfBirth:'2011-04-09'}, {sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);expect(result.rows[0].reasonCodes).toContain('date_of_birth_conflict');expect(clients[0].date_of_birth).toBe('2010-04-09');
});
it('uses an explicit member ID only with corroborating identity and can fill a missing DOB',async()=>{
 clients[0].date_of_birth=null;clients[0].insurance_member_id='MEMBER-7';const result=await enrich([row({explicitMemberId:'MEMBER-7'})]);
 expect(result.rows[0]).toMatchObject({matchStatus:'matched',matchMethod:'explicit_member_corroborated'});expect(clients[0].date_of_birth).toBe('2010-04-09');
});
it('never treats an ambiguous account/member column as an insurance member number',async()=>{
 await enrich([row(extractBillingProfileFields({'First Name':'Alex','Last Name':'Rivera','DOB':'2010-04-09','Patient account number or member id':'ACCOUNT-7','Primary Payer':'Example Health'}))]);
 expect(storedInsurance().primary).not.toHaveProperty('memberId');expect(clients[0].insurance_member_id).toBeNull();
});
it('matches canonical hashed members within the same tenant without exposing the hash or identifier',async()=>{
 clients[0].date_of_birth=null;const hash=crypto.createHmac('sha256',Buffer.alloc(32,6)).update('agency:2|member:member-7').digest('hex');identities=[{agency_id:2,client_id:10,member_id_hash:hash}];
 const result=await enrich([row({explicitMemberId:'MEMBER-7'})]);expect(result.rows[0].matchStatus).toBe('matched');expect(JSON.stringify(result)).not.toContain(hash);
});
it('preserves verified coverage, patient details, profile IDs, sources and verification metadata byte-for-byte',async()=>{
 const previous={verifiedForClaims:true,confirmedBy:23,profileId:7,coverageSources:{primary:{profileId:7,slot:'primary'}},patient:{firstName:'Confirmed',lastName:'Patient',addressLine1:'Existing patient address'},primary:{insurerName:'Confirmed Plan',memberId:'EXISTING-1',groupNumber:'CONFIRMED-GROUP'},secondary:{insurerName:'Second plan'},acceptAssignment:true,updatedAt:'2026-09-01T00:00:00.000Z'};
 const encrypted=encryptFamilyBilling(previous,'client-insurance:2:10');clients[0].billing_insurance_payload=encrypted;
 const result=await enrich([row({primaryPayer:'Other reported plan',secondaryPayer:'Other second payer',addressStreet:'New report street'})]);
 expect(result.rows[0].reasonCodes).toContain('existing_insurance_preserved');expect(clients[0].billing_insurance_payload).toBe(encrypted);expect(storedInsurance()).toEqual(previous);expect(clients[0].primary_insurer_name).toBe('Confirmed Plan');
});
it('merges only missing fields into unverified partial insurance and preserves unrelated patient and policy details',async()=>{
 const previous={verifiedForClaims:false,confirmedBy:null,profileId:null,coverageSources:null,patient:{firstName:'Existing patient',dateOfBirth:'2010-04-09'},primary:{insurerName:'Example Health',memberId:'MEMBER-7',customPolicyFlag:'keep'},secondary:null,acceptAssignment:false,otherMetadata:{keep:true}};
 clients[0].billing_insurance_payload=encryptFamilyBilling(previous,'client-insurance:2:10');
 await enrich([row({explicitMemberId:'MEMBER-7',groupNumber:'NEW-GROUP',subscriberName:'Policy Holder',secondaryPayer:'Reported second plan'})]);
 expect(storedInsurance()).toMatchObject({...previous,primary:{...previous.primary,groupNumber:'NEW-GROUP',subscriberName:'Policy Holder'}});expect(storedInsurance().secondary).toBeNull();
});
it('does not overwrite populated demographics or attach a report member ID to a conflicting payer',async()=>{
 clients[0].address_street='Confirmed address';clients[0].primary_insurer_name='Existing Payer';
 const result=await enrich([row({addressStreet:'Report address',explicitMemberId:'MEMBER-7'})]);
 expect(clients[0].address_street).toBe('Confirmed address');expect(storedInsurance().primary.insurerName).toBe('Existing Payer');expect(storedInsurance().primary.memberId).toBeUndefined();expect(result.rows[0].reasonCodes).toContain('primary_payer_conflict_retained');
});
it('honors protected DOB and address data inside existing demographic envelopes',async()=>{
 clients[0].demographics_phi_enc=encryptDemographicsPayload({fullName:'Alex Rivera',dateOfBirth:'2010-04-09',addressStreet:'Confirmed envelope address',custom:'retain'});
 const result=await enrich([row({addressStreet:'Report street',email:'alex@example.test'})]);
 const demo=decryptDemographicsPayload(clients[0].demographics_phi_enc);expect(demo.addressStreet).toBe('Confirmed envelope address');expect(demo.custom).toBe('retain');expect(demo.email).toBe('alex@example.test');expect(clients[0].address_street).toBeNull();expect(result.rows[0].reasonCodes).toContain('address_street_conflict_retained');
});
it('rejects a DOB conflict in a confirmed insurance patient record',async()=>{
 clients[0].billing_insurance_payload=encryptFamilyBilling({verifiedForClaims:true,patient:{dateOfBirth:'2011-04-09'},primary:{insurerName:'Example Health'}},'client-insurance:2:10');
 const result=await enrich();expect(result.rows[0].matchStatus).toBe('conflict');expect(result.rows[0].reasonCodes).toContain('date_of_birth_conflict');
});
it('deduplicates exact retries while retaining corrected-source revisions at the same import ordinal',async()=>{
 await enrich();const second=await enrich();expect(second.rows[0]).toMatchObject({matchStatus:'already_processed',clientId:10,matchMethod:'exact_full_name_dob'});expect(second.counts.clientsWithChanges).toBe(0);expect(observations).toHaveLength(1);
 const correctedRow=row({email:'alex@example.test'}, {rowFingerprint:'b'.repeat(64)});
 const changed=await enrich([correctedRow]);expect(changed.rows[0]).toMatchObject({matchStatus:'matched',clientId:10});expect(changed.rows[0].changedFields).toContain('email');expect(observations).toHaveLength(2);
 const firstEvidence=decryptFamilyBilling(observations[0].observed_fields_payload,'billing-client-profile-observation:2:8:2:'+observations[0].row_fingerprint);
 const correctedEvidence=decryptFamilyBilling(observations[1].observed_fields_payload,'billing-client-profile-observation:2:8:2:'+observations[1].row_fingerprint);
 expect(firstEvidence.fields.email).toBe('');expect(correctedEvidence.fields.email).toBe('alex@example.test');
 const retried=await enrich([correctedRow]);expect(retried.rows[0]).toMatchObject({matchStatus:'already_processed',clientId:10,matchMethod:'exact_full_name_dob'});expect(retried.counts.clientsWithChanges).toBe(0);expect(observations).toHaveLength(2);
});
it('preserves earlier client linkage when replacement CSV ordering puts a different client at the same ordinal',async()=>{
 clients.push(client({id:11,full_name:'Maya Chen',date_of_birth:'2012-01-02'}));await enrich();
 const replacement=await enrich([row({fullName:'Maya Chen',dateOfBirth:'2012-01-02'}, {rowFingerprint:'b'.repeat(64)})]);
 expect(replacement.rows[0]).toMatchObject({matchStatus:'matched',clientId:11});expect(observations.map(o=>o.client_id)).toEqual([10,11]);expect(observations.map(o=>o.row_fingerprint)).toEqual(['a'.repeat(64),'b'.repeat(64)]);
});
it('keeps confirmed profile facts when a corrected report revision conflicts with them',async()=>{
 await enrich();const originalInsurance=clients[0].billing_insurance_payload;
 const changed=await enrich([row({primaryPayer:'Conflicting corrected payer'}, {rowFingerprint:'b'.repeat(64)})]);
 expect(changed.rows[0].reasonCodes).toContain('primary_payer_conflict_retained');expect(clients[0].billing_insurance_payload).toBe(originalInsurance);expect(observations).toHaveLength(2);
 const retried=await enrich([row({primaryPayer:'Conflicting corrected payer'}, {rowFingerprint:'b'.repeat(64)})]);expect(retried.rows[0].reasonCodes).toContain('primary_payer_conflict_retained');expect(observations).toHaveLength(2);
});
it('performs no writes in dry-run mode and never calls lifecycle or service tables',async()=>{
 const result=await enrich([row({email:'alex@example.test'})],{dryRun:true});expect(result.counts.clientsWithChanges).toBe(1);expect(observations).toHaveLength(0);expect(calls.every(c=>c.sql.startsWith('SELECT'))).toBe(true);expect(state.db.beginTransaction).not.toHaveBeenCalled();
 await enrich();const writes=calls.filter(c=>!c.sql.startsWith('SELECT'));expect(writes.every(c=>c.sql.startsWith('UPDATE clients SET')||c.sql.startsWith('INSERT INTO billing_client_profile_observations'))).toBe(true);
 const clientWrites=writes.filter(c=>c.sql.startsWith('UPDATE clients'));expect(clientWrites.every(c=>!/(status|organization_id|provider_user_id|client_type|diagnosis|insurance_type_id)=/.test(c.sql))).toBe(true);
});
it('rolls back profile updates when evidence storage fails and does not leak driver field values',async()=>{
 failObservation=true;await expect(enrich([row({email:'alex@example.test'})])).rejects.toMatchObject({message:'Client profile enrichment could not be completed.',code:'BILLING_PROFILE_ENRICHMENT_FAILED'});
 expect(clients[0].email).toBeNull();expect(observations).toHaveLength(0);expect(state.db.rollback).toHaveBeenCalledOnce();expect(state.db.release).toHaveBeenCalledOnce();
});
it('validates source ownership and identifiers before allowing writes',async()=>{
 await expect(enrich(undefined,{payrollImportId:9})).rejects.toMatchObject({status:403});
 const result=await enrich([row({}, {rowFingerprint:'not-a-fingerprint'})]);expect(result.rows[0].matchStatus).toBe('invalid');expect(observations).toHaveLength(0);
});

it('allows exact full-name fallback only for a unique same-agency client actively assigned to the report provider',async()=>{
 assignments=[{client_id:10,provider_user_id:55,is_active:1}];
 let result=await enrich([row({dateOfBirth:''},{providerUserId:55})]);expect(result.rows[0]).toMatchObject({matchStatus:'matched',matchMethod:'exact_full_name_assigned_provider',clientId:10});
 result=await enrich([row({dateOfBirth:''},{providerUserId:56,sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);expect(result.rows[0].matchStatus).toBe('unmatched');
 result=await enrich([row({fullName:'Alex',dateOfBirth:''},{providerUserId:55,sourceRowNumber:4,rowFingerprint:'c'.repeat(64)})]);expect(result.rows[0].matchStatus).toBe('unmatched');
});
it('does not use provider assignment to resolve duplicate full names or contradict a DOB',async()=>{
 assignments=[{client_id:10,provider_user_id:55,is_active:1}];clients.push(client({id:11,date_of_birth:'2011-01-01'}));
 let result=await enrich([row({dateOfBirth:''},{providerUserId:55})]);expect(result.rows[0].matchStatus).toBe('ambiguous');
 result=await enrich([row({dateOfBirth:'2012-01-01'},{providerUserId:55,sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);expect(result.rows[0].matchStatus).toBe('conflict');
});
it('uses the latest reported payer and keeps contradictory same-date payer observations for review',async()=>{
 let result=await enrich([row({primaryPayer:'Older Plan'},{serviceDate:'2026-10-10'}),row({primaryPayer:'Newer Plan'},{serviceDate:'2026-10-20',sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);
 expect(storedInsurance().primary.insurerName).toBe('Newer Plan');expect(result.rows.map(r=>r.sourceRowNumber)).toEqual([2,3]);
 clients=[client()];observations=[];
 result=await enrich([row({primaryPayer:'First Conflicting Plan'}),row({primaryPayer:'Second Conflicting Plan'},{sourceRowNumber:3,rowFingerprint:'b'.repeat(64)})]);
 expect(clients[0].primary_insurer_name).toBeNull();expect(clients[0].billing_insurance_payload).toBeNull();expect(result.rows.every(r=>r.reasonCodes.includes('conflicting_report_primary_payer'))).toBe(true);
});

it('normalizes a reported phone number and leaves invalid contact and oversized address values as evidence only',async()=>{
 await enrich([row({contactPhone:'(303) 555-0142',addressCity:'A'.repeat(101),addressZip:'123456789012345678901'})]);
 expect(clients[0].contact_phone).toBe('+13035550142');expect(clients[0].address_city).toBeNull();expect(clients[0].address_zip).toBeNull();
 clients=[client()];observations=[];
 const result=await enrich([row({contactPhone:'call provider'})]);expect(clients[0].contact_phone).toBeNull();expect(result.rows[0].reasonCodes).toContain('invalid_contact_phone');
});

it('does not assume an unreadable existing insurance identity is empty',async()=>{
 clients[0].billing_insurance_payload='not-a-readable-encrypted-policy';
 const result=await enrich([row({explicitMemberId:'MEMBER-7'})]);expect(result.rows[0].matchStatus).toBe('conflict');expect(result.rows[0].reasonCodes).toContain('member_identifier_unverifiable');expect(calls.some(c=>c.sql.startsWith('UPDATE clients'))).toBe(false);
});
