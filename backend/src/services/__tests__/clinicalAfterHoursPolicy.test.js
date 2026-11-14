import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../staffCareEligibility.service.js',()=>({readStaffCareEligibility:vi.fn()}));
vi.mock('../billingRules.service.js',()=>({loadCredentialOverrides:vi.fn(),grantedServiceCodesForProvider:vi.fn(),credentialAllows:(tier,_code,rules)=>rules.get('intern_plus|99051')!==false&&tier==='intern_plus'}));
vi.mock('../billingPolicy.service.js',()=>({resolvePolicyRuleForServiceCode:vi.fn(),isServiceCodeEnabledForAgency:vi.fn()}));
import {evaluate99051Schedule,canonicalAfterHoursAddons,LEGACY_AFTER_HOURS_POLICY_VERSION} from '../../utils/clinicalAfterHoursPolicy.js';
import {isProBonoFunding,isProBonoServiceCode,resolveProBonoDocumentationService,proBonoClientBilling} from '../../utils/clinicalFundingPolicy.js';
import {canApply99051,reconcileClinicalAfterHours,persistedClinicalSchedule,reconcileNewClaimAfterHours,assertNoAutomaticProBonoClaim,deriveApproved99051Decision,reviewClaim99051Policy} from '../clinicalAfterHours.service.js';
import {getClinicalServiceReference} from '../clinicalServiceReference.service.js';
import {approvedVersionBillingBlockers} from '../clinicalNoteVersionBilling.service.js';

describe('owner-defined99051 schedule policy',()=>{
 it.each([
  ['2026-10-28T14:59:00Z',true],['2026-10-28T15:00:00Z',false],['2026-10-28T22:59:00Z',false],['2026-10-28T23:00:00Z',true],
  ['2026-11-09T23:59:00Z',false],['2026-11-10T00:00:00Z',true],['2026-11-07T07:00:00Z',true],['2026-11-09T06:59:00Z',true],
  ['2026-11-01T07:30:00Z',true],['2026-11-01T08:30:00Z',true],['2026-11-26T19:00:00Z',false]
 ])('%s uses source local start, including DST/weekends, including mornings before09:00 but no automatic holiday extension',(startAt,eligible)=>{
  expect(evaluate99051Schedule({startAt,timeZone:'America/Denver'}).eligible).toBe(eligible);
 });
 it('uses the actual saved timezone and treats SQL datetimes as UTC, independent of process timezone',()=>{
  expect(evaluate99051Schedule({startAt:'2026-11-09 22:00:00',timeZone:'America/New_York'})).toMatchObject({eligible:true,localStartTime:'17:00'});
  expect(evaluate99051Schedule({startAt:'2026-11-09 22:00:00',timeZone:'America/Denver'})).toMatchObject({eligible:false,localStartTime:'15:00'});
  expect(evaluate99051Schedule({startAt:new Date('2026-11-10T00:00:00Z'),timeZone:'America/Denver'})).toMatchObject({eligible:true,localStartTime:'17:00'});
 });
 it('does not qualify a16:30 weekday start just because the session continues past17:00',()=>{
  expect(evaluate99051Schedule({startAt:'2026-11-09T23:30:00Z',endAt:'2026-11-10T00:30:00Z',timeZone:'America/Denver'}).eligible).toBe(false);
 });
 it.each([{startAt:'2026-11-10T00:00:00Z'},{startAt:'2026-11-10T00:00:00Z',timeZone:'invalid/zone'},{startAt:'bad',timeZone:'America/Denver'},{startAt:'2026-11-09',timeZone:'America/Denver'}])('fails closed without a valid saved instant and zone: %j',input=>{
  expect(evaluate99051Schedule(input).eligible).toBe(false);
 });
 it('removes a forced99051 outside policy without altering other add-ons',()=>{
  expect(canonicalAfterHoursAddons(['90785','99051','90840','90785'],false)).toEqual(['90785','90840']);
  expect(canonicalAfterHoursAddons(['90785','99051','99051'],true)).toEqual(['90785','99051']);
 });
});
describe('saved medical/credential/agency restrictions',()=>{
 let d,row;
 const input={agencyId:1,providerUserId:7,primaryCode:'90837',modality:'IN_PERSON',placeOfService:'11'};
 beforeEach(()=>{
  row={is_active:1,scheduling_is_active:1,scheduling_tier_allowed:1,allowed_credential_tiers_json:['intern_plus']};
  d={database:{execute:vi.fn(async()=>[[row]])},readCare:vi.fn().mockResolvedValue({canProvideCare:true,credentialTier:'intern_plus'}),credentialOverrides:vi.fn().mockResolvedValue(new Map()),providerGrants:vi.fn().mockResolvedValue([]),policy:vi.fn().mockResolvedValue({enabledForAgency:true,allowedForCredentialTier:true}),enabled:vi.fn().mockResolvedValue(true)};
 });
 it('allows an enabled add-on for a currently qualified provider without treating it as a primary service',async()=>{
  expect(await canApply99051(input,d)).toEqual({allowed:true,reason:'existing_eligibility_confirmed'});
  expect(await canApply99051({...input,primaryCode:'99051'},d)).toMatchObject({allowed:false});
 });
 it.each(['is_active','scheduling_is_active','scheduling_tier_allowed'])('preserves explicit %s denials',async key=>{
  row[key]=0;expect(await canApply99051(input,d)).toMatchObject({allowed:false,reason:'addon_disabled'});
 });
 it('preserves care, qualification, empty-tier, saved credential and approved agency/payer policy restrictions',async()=>{
  d.readCare.mockResolvedValueOnce({canProvideCare:false,credentialTier:'intern_plus'});expect(await canApply99051(input,d)).toMatchObject({allowed:false});
  d.readCare.mockResolvedValueOnce({canProvideCare:true,credentialTier:'bachelors'});d.providerGrants.mockResolvedValue(['99051']);expect(await canApply99051(input,d)).toMatchObject({allowed:false});d.providerGrants.mockResolvedValue([]);
  row.allowed_credential_tiers_json=[];expect(await canApply99051(input,d)).toMatchObject({allowed:false});row.allowed_credential_tiers_json=['intern_plus'];
  d.credentialOverrides.mockResolvedValueOnce(new Map([['intern_plus|99051',false]]));expect(await canApply99051(input,d)).toMatchObject({allowed:false});
  d.policy.mockResolvedValueOnce({enabledForAgency:false,allowedForCredentialTier:true});expect(await canApply99051(input,d)).toMatchObject({allowed:false});
  d.enabled.mockResolvedValueOnce(false);expect(await canApply99051(input,d)).toMatchObject({allowed:false});
 });
 it('holds early mornings unless the actual saved payer rule documents authorization for that date',async()=>{
  const morning={...input,afterHoursSchedule:{reason:'weekday_morning_start',localDate:'2026-11-13'}};
  expect(await canApply99051(morning,d)).toMatchObject({allowed:false,reason:'morning_payer_review_required'});
  const approval={allowWeekdayMorning:true,payerAuthorizationReference:'Verified payer written authorization #A',reviewedByUserId:9,effectiveFrom:'2026-11-01',effectiveThrough:'2026-11-30'};
  d.policy.mockResolvedValueOnce({enabledForAgency:true,allowedForCredentialTier:true,afterHours99051:approval});expect(await canApply99051(morning,d)).toMatchObject({allowed:true});
  for(const patch of [{payerAuthorizationReference:''},{reviewedByUserId:0},{effectiveFrom:'2026-11-14'},{effectiveThrough:'2026-11-12'},{effectiveFrom:'2026-99-99'}]){d.policy.mockResolvedValueOnce({enabledForAgency:true,allowedForCredentialTier:true,afterHours99051:{...approval,...patch}});expect(await canApply99051(morning,d)).toMatchObject({allowed:false,reason:'morning_payer_review_required'});}
 });
 it.each([2,6,377])('uses the same outside-hours signal and real permission gate for agency %s',async agencyId=>{
  const resolved=await reconcileClinicalAfterHours({...input,agencyId,startAt:'2026-11-13T15:59:00Z',timeZone:'America/Denver'},d);
  expect(resolved.afterHours).toMatchObject({eligible:true,allowed:false,authorizationReason:'morning_payer_review_required'});expect(resolved.addonServiceCodes).not.toContain('99051');
 });
 it('preserves configured place-of-service and modality restrictions',async()=>{
  row.allowed_place_of_service_json=['11'];expect(await canApply99051({...input,placeOfService:'10'},d)).toMatchObject({allowed:false,reason:'place_of_service_restricted'});
  row.allowed_place_of_service_json=null;row.primary_allowed_place_of_service_json=['03'];expect(await canApply99051(input,d)).toMatchObject({allowed:false,reason:'place_of_service_restricted'});row.primary_allowed_place_of_service_json=null;
  d.policy.mockResolvedValueOnce({enabledForAgency:true,allowedForCredentialTier:true,placeOfService:'03'});expect(await canApply99051(input,d)).toMatchObject({allowed:false,reason:'place_of_service_restricted'});
  row.modality='IN_PERSON';expect(await canApply99051({...input,modality:'TELEHEALTH'},d)).toMatchObject({allowed:false,reason:'modality_restricted'});
 });
 it('adds/removes99051 as times change and preserves multi-unit authored crisis add-ons',async()=>{
  const authorize=vi.fn().mockResolvedValue({allowed:true,reason:'verified'}),base={...input,startAt:'2026-11-10T00:00:00Z',timeZone:'America/Denver',addonServiceCodes:[{code:'90840',units:3},{code:'90785',units:1}]};
  const evening=await reconcileClinicalAfterHours(base,{authorize});expect(evening.addonServiceCodes).toEqual(['90840','90785','99051']);expect(evening.billingAddons).toContainEqual({code:'90840',units:3});
  const day=await reconcileClinicalAfterHours({...base,startAt:'2026-11-09T20:00:00Z',addonServiceCodes:evening.addonServiceCodes},{authorize});expect(day.addonServiceCodes).toEqual(['90840','90785']);expect(authorize).toHaveBeenCalledTimes(1);
  const restricted=await reconcileClinicalAfterHours(base,{authorize:vi.fn().mockResolvedValue({allowed:false,reason:'payer_policy_restricted'})});expect(restricted.addonServiceCodes).not.toContain('99051');
 });
});
describe('persisted source and new-claim boundaries',()=>{
 const session={id:10,agency_id:1,client_id:20,provider_user_id:7,appointment_id:30,service_code:'90837',scheduled_start_at:'2026-11-09 20:00:00',source_timezone:'America/Denver',place_of_service:'11'};
 it('uses the authorized canonical appointment rather than a stale session or browser clock',async()=>{
  const database={execute:vi.fn().mockResolvedValue([[{id:30,agency_id:1,provider_user_id:7,start_at:'2026-11-10 00:00:00',source_timezone:'America/Denver',modality:'IN_PERSON',source_client_matches:1}]])};
  expect(await persistedClinicalSchedule(session,{database})).toMatchObject({source:'appointment',startAt:'2026-11-10 00:00:00',timeZone:'America/Denver'});
  for(const patch of [{agency_id:2},{provider_user_id:8},{source_client_matches:0}]){database.execute.mockResolvedValueOnce([[{agency_id:1,provider_user_id:7,source_client_matches:1,...patch}]]);await expect(persistedClinicalSchedule(session,{database})).rejects.toMatchObject({code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});}
 });
 it('falls back only to an authorized office occurrence/location zone or an actual persisted session',async()=>{
  const database={execute:vi.fn().mockResolvedValue([[{booked_provider_id:7,client_id:20,start_at:'2026-11-10 00:00:00',timezone:'America/Denver',location_agency_id:1,modality:'IN_PERSON'}]])};
  expect(await persistedClinicalSchedule({...session,appointment_id:null,office_event_id:40},{database})).toMatchObject({source:'office_event',timeZone:'America/Denver'});
  expect(await persistedClinicalSchedule({...session,appointment_id:null,office_event_id:null},{database})).toMatchObject({source:'clinical_session',startAt:session.scheduled_start_at});
 });
 it('reconciles only new99051 lines, preserves other explicit charges and does not mutate the caller/history',async()=>{
  const lines=[{procedureCode:'90837',units:1,chargeCents:12000},{procedureCode:'90785',units:1,chargeCents:1500},{procedureCode:'99051',units:2,chargeCents:3000}],before=structuredClone(lines);
  const authorize=vi.fn().mockResolvedValue({allowed:true,reason:'verified'});
  const daytime=await reconcileNewClaimAfterHours({session:{...session,appointment_id:null},lines},{authorize});expect(daytime.lines.map(line=>line.procedureCode)).toEqual(['90837','90785']);
  const evening=await reconcileNewClaimAfterHours({session:{...session,appointment_id:null,scheduled_start_at:'2026-11-10 00:00:00'},lines},{authorize});expect(evening.lines.at(-1)).toEqual({procedureCode:'99051',units:1,chargeCents:3000});expect(evening.lines[0].chargeCents).toBe(12000);expect(lines).toEqual(before);
 });
});
describe('pro bono funding remains distinct from clinical service',()=>{
 it.each(['PRO-BONO SERVICE','PRO_BONO_SERVICE','pro bono','PRO-BONO'])('recognizes %s as funding rather than a modality',value=>{expect(isProBonoServiceCode(value)).toBe(true);expect(isProBonoFunding({serviceCode:value})).toBe(true);});
 it('preserves zero client charge with an explicitly selected underlying clinical service and never infers one',()=>{
  expect(isProBonoFunding({serviceCode:'90837',metadata:{fundingDisposition:'pro_bono',underlyingClinicalServiceCode:'90837'}})).toBe(true);
  expect(resolveProBonoDocumentationService({serviceCode:'PRO-BONO SERVICE',metadata:{underlyingServiceCode:'H2014',durationMinutes:60}})).toEqual({serviceCode:'H2014',provenance:'saved_metadata.underlyingServiceCode'});
  expect(resolveProBonoDocumentationService({serviceCode:'PRO-BONO SERVICE',metadata:{durationMinutes:60,toolId:'clinical_90837'}})).toEqual({serviceCode:null,provenance:null});
  expect(proBonoClientBilling({amountCents:9999,packageEntitlementId:12})).toMatchObject({amountCents:0,settlementMode:'pro_bono',paymentStatus:'waived',packageEntitlementId:null});
 });
 it('does not automatically append a charge or create a payer claim for pro bono',async()=>{
  const authorize=vi.fn();const resolved=await reconcileClinicalAfterHours({agencyId:1,providerUserId:7,primaryCode:'90837',metadata:{fundingDisposition:'pro_bono',underlyingServiceCode:'90837'},startAt:'2026-11-10 00:00:00',timeZone:'America/Denver',addonServiceCodes:['99051','90785']},{authorize});
  expect(resolved.addonServiceCodes).toEqual(['90785']);expect(authorize).not.toHaveBeenCalled();
  expect(()=>assertNoAutomaticProBonoClaim({session:{service_code:'PRO-BONO SERVICE'}})).toThrow();expect(()=>assertNoAutomaticProBonoClaim({session:{service_code:'90837'},billing:{settlement_mode:'pro_bono'}})).toThrow();expect(()=>assertNoAutomaticProBonoClaim({session:{service_code:'90837'}})).not.toThrow();
 });
 it('provides traceable agency supplements without claiming either is in the supplied PDF',()=>{
  for(const value of ['99051','PRO-BONO SERVICE']){const reference=getClinicalServiceReference(value);expect(reference.status).toBe('supplemental-policy');expect(reference.source).toMatchObject({kind:'user_agency_policy',pages:[],hash:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(reference.reviewNotice).toContain('not an entry');}
  expect(getClinicalServiceReference('99051').schedulePolicy).toMatchObject({basis:'session_start',weekdayStartLocal:'17:00',weekdayMorningEligible:true});expect(getClinicalServiceReference('PRO-BONO SERVICE').zeroClientCharge).toBe(true);expect(getClinicalServiceReference('97535').status).toBe('not-in-supplied-manual');
 });
});
describe('server-bound99051 exception to immutable clinical approval',()=>{
 const note=()=>({id:80,agency_id:1,client_id:20,clinical_session_id:10,clinical_version_id:200,clinical_version_content_hash:'a'.repeat(64),metadata_json:{dateOfService:'2026-11-09',serviceCode:'90837',billingPrimaryUnits:1,billingAddons:[],structuredChart:{placeOfService:'11'}}});
 const session=()=>({id:10,agency_id:1,client_id:20,provider_user_id:7,service_code:'90837',scheduled_start_at:'2026-11-10 00:00:00',source_timezone:'America/Denver',is_telehealth:0,place_of_service:'11',appointment_id:30});
 const claim={date_of_service:'2026-11-09',place_of_service:'11'};
 const authorize=()=>vi.fn().mockResolvedValue({allowed:true,reason:'verified'});
 const raw=lines=>lines.map(line=>({procedure_code:line.procedureCode,units:line.units}));
 it('adds a qualified evening unit using the approved encounter without changing signed metadata or a current calendar',async()=>{
  const approved=note(),encounter=session(),before=structuredClone(approved),database={execute:vi.fn().mockRejectedValue(new Error('The mutable calendar must not enter approved billing'))};
  const result=await reconcileNewClaimAfterHours({session:encounter,note:approved,lines:[{procedureCode:'90837',units:1,chargeCents:12000}]},{authorize:authorize(),database});
  expect(result.lines.map(line=>line.procedureCode)).toEqual(['90837','99051']);expect(result.policyBinding).toMatchObject({included:true,startAt:'2026-11-10T00:00:00.000Z',sourceTimezone:'America/Denver',approvedRevisionId:200});
  expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines:raw(result.lines),afterHoursDecision:result.decision})).toEqual([]);
  expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines:raw(result.lines)})).toContain('The claim add-on services differ from the latest approved clinical version.');expect(approved).toEqual(before);expect(database.execute).not.toHaveBeenCalled();
 });
 it('removes a legacy morning99551 only through a verified schedule decision and keeps all other authored add-ons exact',async()=>{
  const approved=note();approved.metadata_json.billingAddons=[{code:'99051',units:1},{code:'90785',units:1}];const encounter={...session(),scheduled_start_at:'2026-11-09 16:00:00'};
  const result=await reconcileNewClaimAfterHours({session:encounter,note:approved,lines:[{procedureCode:'90837',units:1},{procedureCode:'99051',units:1},{procedureCode:'90785',units:1}]},{authorize:authorize()});
  expect(result.policyBinding.included).toBe(false);expect(result.lines.map(line=>line.procedureCode)).toEqual(['90837','90785']);expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines:raw(result.lines),afterHoursDecision:result.decision})).toEqual([]);
  expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines:[{procedure_code:'90837',units:1}],afterHoursDecision:result.decision})).toContain('The claim add-on services differ from the latest approved clinical version.');
  expect(approved.metadata_json.billingAddons).toContainEqual({code:'99051',units:1});
 });
 it('retains a persisted legacy schedule policy binding without retroactive morning repricing',async()=>{
  const approved=note(),encounter={...session(),scheduled_start_at:'2026-11-09 15:00:00'};
  const prior=await deriveApproved99051Decision({note:approved,session:encounter},{authorize:authorize(),policyVersion:LEGACY_AFTER_HOURS_POLICY_VERSION});
  expect(prior.included).toBe(false);
  const stored={...claim,metadata_json:{scheduleDerived99051:prior.binding}};
  expect((await reviewClaim99051Policy({claim:stored,note:approved,session:encounter,lines:[{procedure_code:'90837',units:1}]},{authorize:authorize()})).blockers).toEqual([]);
  expect((await deriveApproved99051Decision({note:approved,session:encounter},{authorize:authorize()})).included).toBe(true);
 });
 it('rejects a serialized/forged decision, cross-note reuse, extra units and duplicate fractional lines',async()=>{
  const approved=note(),encounter=session(),decision=await deriveApproved99051Decision({note:approved,session:encounter},{authorize:authorize()});
  const lines=[{procedure_code:'90837',units:1},{procedure_code:'99051',units:1}];
  expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines,afterHoursDecision:JSON.parse(JSON.stringify(decision))})).not.toEqual([]);
  expect(approvedVersionBillingBlockers({note:{...approved,id:81},session:encounter,claim,lines,afterHoursDecision:decision})).not.toEqual([]);
  for(const addons of [[{procedure_code:'99051',units:2}],[{procedure_code:'99051',units:.5},{procedure_code:'99051',units:.5}]])expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim,lines:[lines[0],...addons],afterHoursDecision:decision})).not.toEqual([]);
 });
 it('revalidates the stored binding before readiness/transmission and rejects changed approval, eligibility or tampering',async()=>{
  const approved=note(),encounter=session(),decision=await deriveApproved99051Decision({note:approved,session:encounter},{authorize:authorize()}),lines=[{procedure_code:'90837',units:1},{procedure_code:'99051',units:1}],stored={...claim,metadata_json:{scheduleDerived99051:decision.binding}};
  expect((await reviewClaim99051Policy({claim:stored,note:approved,session:encounter,lines},{authorize:authorize()})).blockers).toEqual([]);
  for(const changed of [{note:{...approved,clinical_version_id:201}},{session:{...encounter,scheduled_start_at:'2026-11-10 01:00:00'}},{claim:{...stored,metadata_json:{scheduleDerived99051:{...decision.binding,sourceTimezone:'UTC'}}}}])expect((await reviewClaim99051Policy({claim:stored,note:approved,session:encounter,lines,...changed},{authorize:authorize()})).blockers).not.toEqual([]);
  expect((await reviewClaim99051Policy({claim:stored,note:approved,session:encounter,lines},{authorize:vi.fn().mockResolvedValue({allowed:false,reason:'credential_removed'})})).blockers).not.toEqual([]);
 });
 it('holds missing approved timezone/date conflicts and does not substitute a current office/browser zone',async()=>{
  const approved=note(),encounter=session(),decision=await deriveApproved99051Decision({note:approved,session:encounter},{authorize:authorize()}),stored={metadata_json:{scheduleDerived99051:decision.binding}};
  for(const changed of [{...encounter,source_timezone:null},{...encounter,source_timezone:'invalid/zone'},{...encounter,scheduled_start_at:'2026-11-08 00:00:00'}])expect((await reviewClaim99051Policy({claim:stored,note:approved,session:changed,lines:[{procedure_code:'99051',units:1}]},{authorize:authorize()})).blockers).not.toEqual([]);
 });
 it('requires an actual approved note identity and content hash before any metadata exception',async()=>{
  for(const patch of [{id:null},{id:0},{clinical_version_content_hash:null},{clinical_version_content_hash:''}])expect(await deriveApproved99051Decision({note:{...note(),...patch},session:session()},{authorize:authorize()})).toBeNull();
 });
 it('does not rewrite historical claim charges or grant an exception to an unbound legacy mismatch',async()=>{
  const approved=note(),encounter=session(),lines=[{procedure_code:'90837',units:1,charge_cents:12000},{procedure_code:'99051',units:1,charge_cents:3500}],stored={...claim,amount_cents:15500,metadata_json:{retained:'historical'}},before=structuredClone({stored,lines,approved});
  const reviewed=await reviewClaim99051Policy({claim:stored,note:approved,session:encounter,lines},{authorize:authorize()});expect(reviewed.decision).toBeNull();expect(approvedVersionBillingBlockers({note:approved,session:encounter,claim:stored,lines,afterHoursDecision:reviewed.decision})).not.toEqual([]);expect({stored,lines,approved}).toEqual(before);
 });
});
