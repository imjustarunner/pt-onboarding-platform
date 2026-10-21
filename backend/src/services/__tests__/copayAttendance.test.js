import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({db:vi.fn(),clinical:vi.fn(),insurance:vi.fn(),readiness:vi.fn(),coverage:vi.fn(),currentTerms:vi.fn(),card:vi.fn(),pay:vi.fn(),create:vi.fn(),allocations:vi.fn(),testAccount:vi.fn(),events:[],decisions:new Map(),consent:true,terms:[],enabled:true,pendingPayment:false}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>m.db(...a)}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:(...a)=>m.clinical(...a),getConnection:async()=>({execute:(...a)=>m.clinical(...a),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:(...a)=>m.insurance(...a)}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:v=>v,encryptFamilyBilling:v=>v}));
vi.mock('../familyLedger/readiness.js',()=>({getReadiness:(...a)=>m.readiness(...a),assertReady:(p)=>{if(p.setup_status!=='ready')throw Object.assign(new Error('not ready'),{status:409});}}));
vi.mock('../coverageVerification.service.js',()=>({assertCoverageCollectionSafe:(...a)=>m.coverage(...a)}));
vi.mock('../familyLedger/serviceRates.js',()=>({assertServiceTermsCurrent:(...a)=>m.currentTerms(...a)}));
vi.mock('../familyLedger/payments.js',()=>({activeCard:(...a)=>m.card(...a),payAllocation:(...a)=>m.pay(...a)}));
vi.mock('../guardianTestAccess.service.js',()=>({isGuardianTestAccountId:(...a)=>m.testAccount(...a)}));
vi.mock('../familyLedger/receivables.js',()=>({createReceivable:(...a)=>m.create(...a),allocationsFor:(...a)=>m.allocations(...a),findReceivable:async()=>({id:90,source_type:'clinical_copay'}),sourcePayload:r=>r.source_payload||{}}));
vi.mock('../familyLedger/policy.js',()=>({parseJson:(v,f)=>v?typeof v==='string'?JSON.parse(v):v:f,dateOnly:v=>new Date(v).toISOString().slice(0,10),today:()=>new Date().toISOString().slice(0,10),transaction:fn=>fn({execute:(...a)=>m.db(...a)})}));
// Mail rendering is tested independently without initializing live mail clients.
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn(),sendClientPortalEmail:vi.fn()}));
import {assertSameDayCopay,meaningfulSavedSessionDraft,onSavedDraftCopay,resetPendingAttendance,assertSessionEnded,assertOccurrence,assertCopayCard,chooseCopayTerm,copayServiceDate,recordCopayAttendance,attendanceCopayTerms,pendingProviderCopays,onSignedNoteCopay,assertAttendanceCopay,assertSessionAttendanceNotSuppressed} from '../familyLedger/copayAttendance.js';
import {assertAutomaticCopay,assertAutomaticCopayDispatchDate} from '../familyLedger/copays.js';
import {buildProviderCopayDigest,digestDate,sendProviderCopayDigests} from '../familyLedger/copayProviderDigests.js';
const session={id:30,agency_id:2,client_id:12,provider_user_id:45,office_event_id:80,scheduled_start_at:'2026-01-20T15:00:00Z',scheduled_end_at:'2026-01-20T16:00:00Z',encounter_status:'scheduled',service_code:'90834'};
const term={clientId:12,serviceCode:'90834',paymentBasis:'copay',priceBasis:'visit',units:1,totalCents:2500,effectiveFrom:'2026-01-01',effectiveThrough:'2026-12-31'};
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-01-20T17:00:00Z'));
 vi.clearAllMocks();m.events=[];m.decisions=new Map();m.consent=true;m.terms=[term];m.enabled=true;m.pendingPayment=false;
 m.insurance.mockResolvedValue({primary:{memberId:'synthetic',insurerName:'Commercial'}});
 m.readiness.mockResolvedValue({setup_status:'ready',collection_policy:'verified_copay',automatic_from:'2026-01-01'});
 m.coverage.mockResolvedValue();m.currentTerms.mockResolvedValue();m.testAccount.mockResolvedValue(false);
 m.card.mockResolvedValue({payer:{consent_id:3,recurring_limit_cents:3000},card:{id:8,stripe_setup_intent_id:'seti_test',card_exp_year:2099,card_exp_month:12}});
 m.create.mockResolvedValue({id:90});m.allocations.mockResolvedValue([{id:91,payer_user_id:22,amount_cents:2500,paid_cents:0}]);m.pay.mockResolvedValue({paid:true,paymentId:1});
 m.clinical.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT * FROM clinical_sessions'))return [[{...session}]];
  if(sql.startsWith('SELECT id FROM clinical_notes')&&sql.includes('LIMIT 1')&&sql.includes('provider_signed_at IS NOT NULL'))return [[]];
  if(sql.startsWith('SELECT id FROM clinical_notes')&&sql.includes("note_type='MISSED_APPOINTMENT'"))return [[{id:51}]];
  if(sql.startsWith('SELECT id FROM clinical_notes'))return [[{id:50}]];
  if(sql.startsWith('SELECT * FROM clinical_notes'))return [[{id:50,clinical_session_id:30,is_billable:1,provider_signed_at:'2026-01-20',created_by_user_id:45}]];
  if(sql.startsWith('SELECT clinical_session_id'))return [[{clinical_session_id:30}]];
  if(sql.startsWith('SELECT s.*'))return [[{...session}]];
  if(sql.startsWith('SELECT id,parent_claim_id'))return [[]];
  if(sql.startsWith('SELECT c.claim_lifecycle'))return [[]];
  if(sql.startsWith('UPDATE clinical_sessions'))return [{affectedRows:1}];
  throw new Error(`Unexpected clinical SQL: ${sql}`);
 });
 m.db.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT feature_flags'))return [[{feature_flags:{familyBillingAutomationEnabled:m.enabled,attendanceCopaysEnabled:m.enabled}}]];
  if(sql.startsWith('SELECT u.id'))return [[{id:45}]];
  if(sql.startsWith('SELECT guardian_user_id'))return [[{guardian_user_id:22}]];
  if(sql.startsWith('SELECT id FROM guardian_billing_consents'))return [m.consent?[{id:3}]:[]];
  if(sql.startsWith('SELECT id,signed_evidence_encrypted'))return [[{id:20,signed_evidence_encrypted:{waiver:{serviceTerms:m.terms}}}]];
  if(sql.startsWith('SELECT id FROM family_payment_plans'))return [[]];
  if(sql.startsWith('SELECT id FROM clients'))return [[{id:12}]];
  if(sql.startsWith('SELECT id FROM family_receivables'))return [[]];
  if(sql.startsWith('SELECT * FROM family_copay_attendance')||sql.startsWith('SELECT attendance FROM family_copay_attendance'))return [[m.decisions.get(Number(args[1]))].filter(Boolean)];
  if(sql.startsWith('INSERT INTO family_copay_attendance (')){m.decisions.set(args[1],{attendance:args[4],provider_user_id:args[3],decided_by_user_id:args[8],decision_source:args[5],clinical_note_id:args[6],clinical_draft_id:args[7]});return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO family_copay_attendance_events')){m.events.push(args);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO family_billing_audit'))return [{affectedRows:1}];
  if(sql.startsWith('UPDATE family_copay_attendance SET receivable_id')){m.decisions.get(args[2]).receivable_id=args[0];return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE family_copay_attendance')||sql.startsWith('UPDATE family_receivables'))return [{affectedRows:1}];
  if(sql.startsWith('SELECT p.id FROM family_ledger_payments'))return [m.pendingPayment?[{id:10}]:[]];
  if(sql.startsWith('SELECT timezone'))return [[{timezone:'America/Denver'}]];
  if(sql.startsWith('SELECT id FROM appointments'))return [[{id:70}]];
  if(sql.startsWith('DELETE FROM family_copay_attendance')){m.decisions.delete(Number(args[1]));return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM clinical_note_drafts'))return [[{id:60,clinical_session_id:30,user_id:45,agency_id:2,client_id:12,input_text:'Client practiced grounding during the session.',output_json:JSON.stringify({meta:{toolId:'clinical_psychotherapy_note'}})}]];
  if(sql.startsWith('SELECT initials'))return [[{initials:'SYNT'}]];
  throw new Error(`Unexpected SQL: ${sql}`);
 });
});
afterEach(()=>vi.useRealTimers());
describe('attendance collection boundary',()=>{
 it('refuses future, missing, and impossible session end times',()=>{
  const now=new Date('2026-01-20T15:59:59Z');
  for(const end of [null,'garbage','2026-01-20T14:00:00Z','2026-01-20T16:00:00Z'])expect(()=>assertSessionEnded({...session,scheduled_end_at:end},now)).toThrow();
  expect(()=>assertSessionEnded(session,new Date('2026-01-20T16:00:00Z'))).not.toThrow();
 });
 it.each(['cancelled','canceled','no_show','voided','rescheduled'])('never revives %s',status=>expect(()=>assertOccurrence({...session,encounter_status:status})).toThrow());
 it('requires a verified unexpired card, including an exact month boundary',()=>{
  const card={stripe_setup_intent_id:'seti_1',card_exp_month:10,card_exp_year:2026};
  expect(()=>assertCopayCard(card,new Date('2026-10-31T23:59:59Z'))).not.toThrow();
  expect(()=>assertCopayCard(card,new Date('2026-11-01T00:00:00Z'))).toThrow();
  expect(()=>assertCopayCard({...card,stripe_setup_intent_id:null})).toThrow();
 });
 it('matches the signed client, code, dates, amount, and unique copay terms',()=>{
  expect(chooseCopayTerm([term],session)).toEqual(term);
  for(const terms of [[],[term,term],[{...term,clientId:13}],[{...term,serviceCode:'90837'}],[{...term,totalCents:0}],[{...term,effectiveThrough:'2026-01-19'}]])expect(()=>chooseCopayTerm(terms,session)).toThrow();
 });
 it('uses the agency-local service date after UTC midnight and through daylight saving changes',()=>{
  const evening={...session,scheduled_start_at:'2026-10-22T01:30:00Z'};
  expect(copayServiceDate(evening,'America/Denver')).toBe('2026-10-21');
  expect(chooseCopayTerm([{...term,effectiveFrom:'2026-10-21',effectiveThrough:'2026-10-21'}],evening,'America/Denver')).toMatchObject({totalCents:2500});
  expect(()=>chooseCopayTerm([{...term,effectiveFrom:'2026-10-22',effectiveThrough:'2026-10-22'}],evening,'America/Denver')).toThrow();
  expect(copayServiceDate({...session,scheduled_start_at:'2026-11-02T06:30:00Z'},'America/Denver')).toBe('2026-11-01');
 });
 it('does nothing before launch, including note hooks and digest automation',async()=>{
  m.enabled=false;
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:true})).rejects.toThrow(/not enabled/);
  expect(await onSignedNoteCopay({agencyId:2,noteId:50,providerUserId:45})).toEqual({disabled:true});
  expect(await sendProviderCopayDigests({agencyId:2})).toEqual([]);
  expect(m.clinical.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);expect(m.pay).not.toHaveBeenCalled();
 });
 it('blocks another provider and rejects string booleans',async()=>{
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:46,occurred:true})).rejects.toThrow(/assigned provider/);
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:'false'})).rejects.toThrow(/Choose/);
  expect(m.events).toHaveLength(0);expect(m.pay).not.toHaveBeenCalled();
 });
 it.each([{primary:{memberId:'m',insurerName:'Medicaid'}},{primary:{memberId:'c'},secondary:{insurerName:'Medicaid'}},{primary:{memberId:'c'},secondary:{insurerName:'Commercial secondary'}},{}])('holds coverage requiring coordination/review',async insurance=>{
  m.insurance.mockResolvedValue(insurance);
  await expect(attendanceCopayTerms(session)).rejects.toThrow(/coverage requires billing review/);
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('holds missing same-day consent, changed coverage, unauthorized amounts, historical sessions and demo payers',async()=>{
  m.consent=false;await expect(attendanceCopayTerms(session)).rejects.toThrow(/same-day copay authorization/);m.consent=true;
  m.currentTerms.mockRejectedValueOnce(Object.assign(new Error('Coverage changed'),{status:409}));await expect(attendanceCopayTerms(session)).rejects.toThrow(/Coverage changed/);
  m.terms=[{...term,totalCents:4000}];await expect(attendanceCopayTerms(session)).rejects.toThrow(/exceeds/);m.terms=[term];
  m.readiness.mockResolvedValueOnce({setup_status:'ready',collection_policy:'verified_copay',automatic_from:'2026-02-01'});await expect(attendanceCopayTerms(session)).rejects.toThrow(/not enabled for this visit/);
  m.testAccount.mockResolvedValue(true);await expect(attendanceCopayTerms(session)).rejects.toThrow(/Demo/);
 });
 it('uses one balance and identical payment identity across provider and note retries',async()=>{
  const input={agencyId:2,sessionId:30,providerUserId:45,occurred:true};
  await recordCopayAttendance(input);
  await recordCopayAttendance({...input,source:'signed_note',noteId:50});
  expect(m.events).toHaveLength(1);expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.pay).toHaveBeenCalledTimes(2);
  expect(m.pay.mock.calls[0][0]).toEqual(m.pay.mock.calls[1][0]);
  expect(m.pay.mock.calls[0][0]).toMatchObject({allocationId:91,amountCents:2500,idempotencyKey:'automatic-copay:2:91',automatic:true});
 });
 it('records did-not-occur without charging and refuses a later positive retry',async()=>{
  await recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:false});
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:true})).rejects.toThrow(/marked as not occurring/);
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('rejects a negative decision conflicting with a signed progress note before changing attendance',async()=>{
  const original=m.clinical.getMockImplementation();
  m.clinical.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT id FROM clinical_notes')&&sql.includes('LIMIT 1')&&sql.includes('provider_signed_at IS NOT NULL')?[[{id:50}]]:original(sql,...args));
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:false})).rejects.toThrow(/completed service note/);
  expect(m.decisions.size).toBe(0);expect(m.pay).not.toHaveBeenCalled();
 });
 it('holds a negative correction when a payment is already in flight',async()=>{
  m.decisions.set(30,{attendance:'occurred',receivable_id:90});m.pendingPayment=true;
  await expect(recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:false})).rejects.toThrow(/reconcile/);
  expect(m.decisions.get(30).attendance).toBe('occurred');expect(m.events).toHaveLength(0);
 });
 it('does not pretend a failed payment undoes attendance or require a duplicate confirmation',async()=>{
  m.pay.mockRejectedValue(new Error('network failure'));
  const result=await recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:true});
  expect(result).toMatchObject({attendance:'occurred',collection:{paid:false,needsReview:true}});
  expect(m.events).toHaveLength(1);
 });
 it('rechecks a negative attendance decision at the payment boundary',async()=>{
  m.decisions.set(30,{attendance:'did_not_occur'});
  await expect(assertAttendanceCopay({source_type:'clinical_copay',source_key:'30',agency_id:2,client_id:12})).rejects.toThrow(/not been confirmed/);
 });
 it('blocks an existing claim even when its payload predates attendance copays',async()=>{
  m.decisions.set(30,{attendance:'did_not_occur'});
  await expect(assertSessionAttendanceNotSuppressed({agencyId:2,clientId:12,sessionId:30})).rejects.toThrow(/not occurring/);
  expect(m.db.mock.calls[0][0]).toContain('clients');
  expect(m.db.mock.calls[0][0]).toContain('FOR UPDATE');
 });
 it('holds rescheduled and adjudicated sessions at the payment boundary',async()=>{
  m.decisions.set(30,{attendance:'occurred',provider_user_id:45});
  const balance={source_type:'clinical_copay',source_key:'30',agency_id:2,client_id:12,service_date:'2026-01-20',source_payload:{serviceTerm:term}};
  await expect(assertAttendanceCopay(balance)).resolves.toBeUndefined();
  await expect(assertAttendanceCopay({...balance,service_date:'2026-01-19'})).rejects.toThrow(/date changed/);
  const standard=m.clinical.getMockImplementation();
  m.clinical.mockImplementation((sql,args)=>sql.startsWith('SELECT c.claim_lifecycle')?Promise.resolve([[{claim_lifecycle:'paid'}]]):standard(sql,args));
  await expect(assertAttendanceCopay(balance)).rejects.toThrow(/adjudicated/);
 });
 it('omits signed or already answered sessions from provider prompts',async()=>{
  m.decisions.set(30,{attendance:'did_not_occur'});
  expect((await pendingProviderCopays({agencyId:2,providerUserId:45})).sessions).toMatchObject([{documentationRequired:true,appointmentId:70}]);
  m.decisions.clear();m.clinical.mockResolvedValueOnce([[{...session,signed_note:1}]]);
  expect((await pendingProviderCopays({agencyId:2,providerUserId:45})).sessions).toEqual([]);
 });
 it('builds one private summary with an authenticated review button and no patient list in email',()=>{
  const email=buildProviderCopayDigest({agencyName:'ITSCO',firstName:'Demo',count:3,date:'2026-10-21',url:'https://auricwell.com/itsco/my-schedule?copayDate=2026-10-21'});
  expect(email.text).toContain('3 sessions');expect(email.text).toContain('Sign in');expect(email.html).toContain('Review sessions');expect(email.text).not.toContain('Reply Y');
  expect(digestDate(new Date('2026-10-22T01:59:00Z'),'America/Denver')).toBe(null);
  expect(digestDate(new Date('2026-10-22T02:00:00Z'),'America/Denver')).toBe('2026-10-21');
 });
});

describe('saved draft attendance and same-day collection',()=>{
 it('does not treat opening, metadata-only save, or a review-only tool as attendance',async()=>{
  expect(meaningfulSavedSessionDraft({input_text:'',output_json:JSON.stringify({meta:{toolId:'clinical_psychotherapy_note'}})})).toBe(false);
  expect(meaningfulSavedSessionDraft({input_text:'Client transferred',output_json:JSON.stringify({meta:{toolId:'clinical_termination',quickNote:true}})})).toBe(false);
  expect(await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45})).toEqual({eligible:false});
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('does not infer attendance from a client/date/code draft without an explicit appointment link',async()=>{
  expect(await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45,attendanceIntent:'authored_session_draft'})).toEqual({eligible:false});
  expect(m.pay).not.toHaveBeenCalled();expect(m.decisions.size).toBe(0);
 });
 it('accepts persisted authored quick notes and clinical drafts, with the draft audit identity',async()=>{
  expect(meaningfulSavedSessionDraft({input_text:'Practiced breathing.',output_json:JSON.stringify({meta:{quickNote:true}})})).toBe(true);
  const result=await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45,attendanceIntent:'authored_session_draft',explicitClinicalSessionId:30});
  expect(result.collection.paid).toBe(true);expect(m.decisions.get(30)).toMatchObject({decision_source:'saved_draft',clinical_draft_id:60});
  await onSignedNoteCopay({agencyId:2,noteId:50,providerUserId:45});
  expect(m.create).toHaveBeenCalledTimes(1);expect(m.events).toHaveLength(1);
 });
 it('resolves an office-only quick note to exactly one client and provider session before collecting',async()=>{
  const originalDb=m.db.getMockImplementation(),originalClinical=m.clinical.getMockImplementation();
  m.db.mockImplementation((sql,args)=>{
    if(sql.startsWith('SELECT * FROM clinical_note_drafts')&&!sql.includes('AND client_id=?'))return [[{id:60,clinical_session_id:null,office_event_id:80,user_id:45,agency_id:2,client_id:12,input_text:'Practiced grounding.',output_json:JSON.stringify({meta:{quickNote:true}})}]];
    if(sql.startsWith('UPDATE clinical_note_drafts'))return [{affectedRows:1}];return originalDb(sql,args);
  });
  m.clinical.mockImplementation((sql,args)=>sql.startsWith('SELECT id FROM clinical_sessions')?Promise.resolve([[{id:30}]]):originalClinical(sql,args));
  expect((await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45,attendanceIntent:'authored_session_draft',explicitOfficeEventId:80})).collection.paid).toBe(true);
  expect(m.clinical).toHaveBeenCalledWith(expect.stringContaining('office_event_id=? AND client_id=? AND provider_user_id=?'),[2,80,12,45]);
 });
 it('does not guess which session an ambiguous office draft belongs to',async()=>{
  const originalDb=m.db.getMockImplementation(),originalClinical=m.clinical.getMockImplementation();
  m.db.mockImplementation((sql,args)=>sql.startsWith('SELECT * FROM clinical_note_drafts')?Promise.resolve([[{id:60,clinical_session_id:null,office_event_id:80,client_id:12,input_text:'Session happened',output_json:JSON.stringify({meta:{quickNote:true}})}]]):originalDb(sql,args));
  m.clinical.mockImplementation((sql,args)=>sql.startsWith('SELECT id FROM clinical_sessions')?Promise.resolve([[{id:30},{id:31}]]):originalClinical(sql,args));
  expect(await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45,attendanceIntent:'authored_session_draft',explicitOfficeEventId:80})).toMatchObject({eligible:false,needsReview:true});
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('an early signature is not replayed as attendance after the scheduled end',async()=>{
  const original=m.clinical.getMockImplementation();
  m.clinical.mockImplementation((sql,args)=>sql.startsWith('SELECT id FROM clinical_notes')&&sql.includes('provider_signed_at>=?')?Promise.resolve([[]]):original(sql,args));
  expect(await onSignedNoteCopay({agencyId:2,noteId:50,providerUserId:45})).toEqual({eligible:false});
  expect(m.pay).not.toHaveBeenCalled();expect(m.decisions.size).toBe(0);
 });
 it('saves no attendance before session end and does not create a future timed charge',async()=>{
  vi.setSystemTime(new Date('2026-01-20T15:30:00Z'));
  expect(await onSavedDraftCopay({agencyId:2,draftId:60,providerUserId:45,attendanceIntent:'authored_session_draft',explicitClinicalSessionId:30})).toMatchObject({eligible:false,needsReview:true});
  expect(m.decisions.size).toBe(0);expect(m.pay).not.toHaveBeenCalled();
 });
 it('does not turn an already-paid attendance entry into a late collection review on note retry',async()=>{
  vi.setSystemTime(new Date('2026-01-21T17:00:00Z'));
  m.decisions.set(30,{attendance:'occurred',provider_user_id:45,collection_status:'paid',receivable_id:90});
  expect(await recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:true,source:'signed_note',noteId:50})).toMatchObject({collection:{paid:true,alreadyPaid:true}});
  expect(m.pay).not.toHaveBeenCalled();expect(m.db.mock.calls.some(([sql])=>sql.includes("collection_status='review'"))).toBe(false);
 });
 it('records a late positive decision for review without creating a balance or charging',async()=>{
  vi.setSystemTime(new Date('2026-01-21T17:00:00Z'));
  expect(await recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:true})).toMatchObject({attendance:'occurred',collection:{paid:false,needsReview:true}});
  expect(m.create).not.toHaveBeenCalled();expect(m.pay).not.toHaveBeenCalled();
 });
 it('also blocks next-day automatic claim copays that predate attendance metadata',async()=>{
  vi.setSystemTime(new Date('2026-01-21T17:00:00Z'));
  const balance={agency_id:2,client_id:12,source_type:'claim_responsibility',source_key:'80',created_at:'2026-01-20T17:00:00Z',service_date:'2026-01-20',source_payload:{responsibilityType:'copay',serviceCompleted:true,verificationBasis:'benefit'}};
  await expect(assertAutomaticCopay(balance,{id:91,payer_user_id:22,amount_cents:2500})).rejects.toThrow(/later day/);
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('rechecks the service day at processor dispatch and rejects midnight rollover',async()=>{
  const db={execute:vi.fn().mockResolvedValue([[{service_date:'2026-10-22',timezone:'America/Denver',source_type:'claim_responsibility',source_key:'80',client_id:12}]])};
  const clinical={execute:vi.fn().mockResolvedValue([[{scheduled_start_at:'2026-10-22T01:00:00Z'}]])};
  vi.setSystemTime(new Date('2026-10-22T05:59:59Z'));
  await expect(assertAutomaticCopayDispatchDate({agencyId:2,allocationId:91},db,clinical)).resolves.toBeUndefined();
  vi.setSystemTime(new Date('2026-10-22T06:00:00Z'));
  await expect(assertAutomaticCopayDispatchDate({agencyId:2,allocationId:91},db,clinical)).rejects.toMatchObject({code:'COPAY_AFTER_SERVICE_DATE'});
 });
 it('uses the agency-local date at midnight, not UTC or the note signing date',()=>{
  const evening={...session,scheduled_start_at:'2026-10-22T01:00:00Z'};
  expect(()=>assertSameDayCopay(evening,'America/Denver',new Date('2026-10-22T05:59:59Z'))).not.toThrow();
  expect(()=>assertSameDayCopay(evening,'America/Denver',new Date('2026-10-22T06:00:00Z'))).toThrow(/later day/);
 });
 it('starts the missed flow with a collection hold, without inventing a note or finalizing attendance details',async()=>{
  const result=await recordCopayAttendance({agencyId:2,sessionId:30,providerUserId:45,occurred:false});
  expect(result).toMatchObject({documentationRequired:true,charged:false});
  expect(m.clinical.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  expect(m.pay).not.toHaveBeenCalled();
 });
 it('allows a mistaken unfinished No selection to reset and never resets completed occurrence',async()=>{
  m.decisions.set(30,{attendance:'did_not_occur',decision_source:'provider'});
  const original=m.clinical.getMockImplementation();
  m.clinical.mockImplementation((sql,args)=>sql.includes("OR content_review_source='provider_review'")?Promise.resolve([[]]):original(sql,args));
  expect(await resetPendingAttendance({agencyId:2,sessionId:30,providerUserId:45})).toEqual({reset:true,charged:false,balanceHoldsRetained:true});
  expect(m.decisions.size).toBe(0);expect(m.pay).not.toHaveBeenCalled();
  m.decisions.set(30,{attendance:'occurred',decision_source:'saved_draft'});
  await expect(resetPendingAttendance({agencyId:2,sessionId:30,providerUserId:45})).rejects.toThrow(/billing review/);
 });
});
