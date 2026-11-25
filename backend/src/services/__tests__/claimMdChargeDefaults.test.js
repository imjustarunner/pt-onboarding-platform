import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {normalizeFeeScope,resolveFeeFromEntries,latestFeeEntries,PLATFORM_STARTER_FEES} from '../../utils/feeScheduleRates.js';
import {configuredProviderTaxonomy,claimBillingIdentity} from '../claimBillingIdentity.service.js';
import {reimbursementReviewFlags,saveClaimPatientEstimate} from '../claimFinancialReview.service.js';
import {excludeNoteFromBilling,assertNoteBillingAllowed} from '../noteBillingDisposition.service.js';
const row=(id,scope_key,rate_cents,extra={})=>({id,owner_key:'agency:2',record_type:'rate',mode:'insurance',service_code:'90791',scope_key,rate_cents,...extra});
describe('claim pricing defaults',()=>{
 it('uses the requested $135 platform starter and supports an agency-scoped client rate',()=>{
  expect(PLATFORM_STARTER_FEES['90791']).toBe(13500);
  expect(normalizeFeeScope({agencyId:2,scope:'client',clientId:3})).toMatchObject({scopeKey:'client:3',ownerKey:'agency:2'});
  expect(()=>normalizeFeeScope({agencyId:2,scope:'client'})).toThrow('client');
 });
 it('resolves practice, provider type, payer, provider, then client without leaking another client or company',()=>{
  const entries=latestFeeEntries([row(1,'practice',13500),row(2,'category:category_2',14000),row(3,'payer:AET',14500),row(4,'provider:7:payer:AET',15000),row(5,'client:3',15500),row(6,'client:4',99999),row(7,'client:3',99999,{owner_key:'agency:9'})]);
  const input={agencyId:2,serviceCode:'90791',payerId:'AET',providerUserId:7,categoryKey:'category_2',clientId:3,entries};
  expect(resolveFeeFromEntries(input)).toMatchObject({rateCents:15500,source:'client'});
  expect(resolveFeeFromEntries({...input,scope:'provider'}).rateCents).toBe(15000);
  expect(resolveFeeFromEntries({...input,scope:'payer'}).rateCents).toBe(14500);
  expect(resolveFeeFromEntries({...input,scope:'category'}).rateCents).toBe(14000);
  expect(normalizeFeeScope({agencyId:2,scope:'category',mode:'insurance',categoryKey:'category_2'}).scopeKey).toBe('category:category_2');
 });
});
describe('configured provider billing identity',()=>{
 it('prefers agency credentialing taxonomy and rejects conflicting configured values',async()=>{
  const db={execute:vi.fn(async()=>[[{field_key:'taxonomy_code',agency_id:null,value:'101Y00000X'},{field_key:'provider_identity_taxonomy_code',agency_id:2,value:'103T00000X'}]])};
  expect(await configuredProviderTaxonomy({agencyId:2,userId:7},db)).toBe('103T00000X');
  db.execute.mockResolvedValue([[{field_key:'taxonomy_code',agency_id:2,value:'101Y00000X'},{field_key:'taxonomy_code',agency_id:2,value:'103T00000X'}]]);
  await expect(configuredProviderTaxonomy({agencyId:2,userId:7},db)).rejects.toHaveProperty('status',409);
 });
 it('uses the verified payer rendering mapping and never guesses an unverified supervised mapping',async()=>{
  const overrides={database:{execute:vi.fn(async()=>[[{id:7,first_name:'Provider',credential:'LPC'},{id:8,first_name:'Supervisor',credential:'LPC'}]])},insurance:async()=>({primary:{payerId:'AET'}}),policy:async()=>({billingMode:'billing_supervisor',supervisorUserId:8}),payer:async()=>({}),npi:async({userId})=>String(userId).repeat(10),taxonomy:async()=> '101Y00000X',evaluate:()=>({rule:{mappingVerified:true},renderingProvider:{id:8,npi:'8888888888'}})};
  const input={claim:{agency_id:2,client_id:3,date_of_service:'2026-11-25'},note:{},session:{provider_user_id:7}};
  expect(await claimBillingIdentity(input,overrides)).toMatchObject({renderingNpi:'8888888888',taxonomyCode:'101Y00000X'});
  overrides.evaluate=()=>({rule:null,renderingProvider:{id:7,npi:'7777777777'}});
  expect(await claimBillingIdentity(input,overrides)).toMatchObject({renderingNpi:null,taxonomyCode:null,warnings:[expect.stringContaining('Verify')]});
 });
});
describe('reimbursement review flags',()=>{
 it('flags more than $5 of nonpatient adjustment and exact billed reimbursement only as review suggestions',()=>{
  expect(reimbursementReviewFlags({billedCents:13500,paidCents:13500,adjustmentCents:0}).map(f=>f.code)).toEqual(['paid_exact_billed']);
  expect(reimbursementReviewFlags({billedCents:13500,paidCents:10000,adjustmentCents:3500,responsibilityCents:3000})).toEqual([]);
  expect(reimbursementReviewFlags({billedCents:13500,paidCents:10000,adjustmentCents:3501,responsibilityCents:3000})[0].code).toBe('adjustment_over_five');
  expect(reimbursementReviewFlags({billedCents:0,paidCents:0,adjustmentCents:0})).toEqual([]);
 });
 it.each([10001,-1,20.5])('rejects invalid coinsurance basis points %s without a transaction',async coinsuranceBasisPoints=>{
  const source={getConnection:vi.fn()};await expect(saveClaimPatientEstimate({agencyId:2,claimId:3,revision:1,coinsuranceBasisPoints,reason:'Reviewed evidence',actorUserId:7},source)).rejects.toHaveProperty('status',400);expect(source.getConnection).not.toHaveBeenCalled();
 });
});
describe('administrative billing exclusions',()=>{
 it('enforces a billing exclusion for both direct claims and encounter-based attempts',async()=>{
  const db={execute:vi.fn(async()=>[[{id:1,disposition:'therapy_notes'}]])};await expect(assertNoteBillingAllowed({agencyId:2,noteId:3,sessionId:4},db)).rejects.toHaveProperty('status',409);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('clinical_session_id=?'),[2,3,4]);
 });
 it.each(['provider','admin','support'])('refuses %s administrative exclusion before any database write',async role=>{
  const db={getConnection:vi.fn()};await expect(excludeNoteFromBilling({agencyId:2,noteId:3,actor:{id:7,role},disposition:'therapy_notes',reason:'Documented in Therapy Notes',confirmed:true},db)).rejects.toHaveProperty('status',403);expect(db.getConnection).not.toHaveBeenCalled();
 });
});
