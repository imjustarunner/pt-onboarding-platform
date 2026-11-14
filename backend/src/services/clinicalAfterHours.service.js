import pool from '../config/database.js';
import {createHash} from 'node:crypto';
import {evaluate99051Schedule,canonicalAfterHoursAddons,clinicalScheduleInstant,AFTER_HOURS_POLICY_VERSION,LEGACY_AFTER_HOURS_POLICY_VERSION} from '../utils/clinicalAfterHoursPolicy.js';
import {markScheduleDerived99051Decision} from '../utils/scheduleDerived99051Decision.js';
import {isProBonoFunding,isProBonoServiceCode} from '../utils/clinicalFundingPolicy.js';
import {isClinicalAddon} from '../utils/clinicalServiceCodeCatalog.js';
import {isServiceCodeDeniedForTier} from '../utils/clinicalServiceCodeEligibility.js';
import {readStaffCareEligibility} from './staffCareEligibility.service.js';
import {credentialAllows,loadCredentialOverrides,grantedServiceCodesForProvider} from './billingRules.service.js';
import {resolvePolicyRuleForServiceCode,isServiceCodeEnabledForAgency} from './billingPolicy.service.js';

const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'null');}catch{return null;}};
const code=value=>String(value||'').trim().toUpperCase();

/** Dedicated add-on authorization; primary-service catalogs intentionally omit
 * add-ons. Existing denials always win; this does not infer payer coverage. */
export async function canApply99051({agencyId,providerUserId,primaryCode,modality,placeOfService,afterHoursSchedule},overrides={}) {
  const d={database:pool,readCare:readStaffCareEligibility,credentialOverrides:loadCredentialOverrides,providerGrants:grantedServiceCodesForProvider,policy:resolvePolicyRuleForServiceCode,enabled:isServiceCodeEnabledForAgency,...overrides};
  if(!Number(agencyId)||!Number(providerUserId)||!code(primaryCode)||isClinicalAddon(primaryCode)||isProBonoServiceCode(primaryCode))return {allowed:false,reason:'eligible_primary_service_required'};
  const care=await d.readCare(providerUserId,agencyId,d.database);
  if(!care.canProvideCare||isServiceCodeDeniedForTier(care.credentialTier,'99051'))return {allowed:false,reason:'provider_not_eligible'};
  const [[medical]]=await d.database.execute(`SELECT m.*,s.is_active AS scheduling_is_active,e.allowed AS scheduling_tier_allowed,p.allowed_credential_tiers_json AS primary_allowed_credential_tiers_json,p.allowed_place_of_service_json AS primary_allowed_place_of_service_json
    FROM agency_medical_service_codes m LEFT JOIN scheduling_service_codes s ON s.code=m.service_code
    JOIN agency_medical_service_codes p ON p.agency_id=m.agency_id AND p.service_code=? AND p.is_active=1 AND COALESCE(p.is_addon,0)=0
    LEFT JOIN credential_service_code_eligibility e ON e.service_code=m.service_code AND e.credential_tier=?
    WHERE m.agency_id=? AND m.service_code='99051' LIMIT 1`,[code(primaryCode),care.credentialTier,agencyId]);
  if(!medical||Number(medical.is_active)!==1||(medical.scheduling_is_active!=null&&Number(medical.scheduling_is_active)!==1)||(medical.scheduling_tier_allowed!=null&&Number(medical.scheduling_tier_allowed)!==1))return {allowed:false,reason:'addon_disabled'};
  const tiers=parse(medical.allowed_credential_tiers_json);
  if(Array.isArray(tiers)&&!tiers.includes(care.credentialTier))return {allowed:false,reason:'credential_restricted'};
  const primaryTiers=parse(medical.primary_allowed_credential_tiers_json);
  if(Array.isArray(primaryTiers)&&!primaryTiers.includes(care.credentialTier))return {allowed:false,reason:'primary_service_restricted'};
  const [rules,grants,policy,enabled,primaryPolicy,primaryEnabled]=await Promise.all([d.credentialOverrides('CO'),d.providerGrants(agencyId,providerUserId),d.policy({agencyId,serviceCode:'99051',credentialTier:care.credentialTier}),d.enabled({agencyId,serviceCode:'99051'}),d.policy({agencyId,serviceCode:code(primaryCode),credentialTier:care.credentialTier}),d.enabled({agencyId,serviceCode:code(primaryCode)})]);
  if(!enabled||!primaryEnabled||(policy&&(!policy.enabledForAgency||!policy.allowedForCredentialTier))||(primaryPolicy&&(!primaryPolicy.enabledForAgency||!primaryPolicy.allowedForCredentialTier)))return {allowed:false,reason:'agency_policy_restricted'};
  if(afterHoursSchedule?.reason==='weekday_morning_start'){
    const approval=policy?.afterHours99051,date=afterHoursSchedule.localDate;
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(+new Date(String(value)+'T12:00:00Z'))&&new Date(String(value)+'T12:00:00Z').toISOString().slice(0,10)===value;
    if(approval?.allowWeekdayMorning!==true||!String(approval.payerAuthorizationReference||'').trim()||!(Number(approval.reviewedByUserId)>0)||!validDate(approval.effectiveFrom)||!validDate(date)||date<approval.effectiveFrom||(approval.effectiveThrough&&(!validDate(approval.effectiveThrough)||date>approval.effectiveThrough)))return {allowed:false,reason:'morning_payer_review_required'};
  }
  if(!credentialAllows(care.credentialTier,'99051',rules)&&!grants.map(code).includes('99051'))return {allowed:false,reason:'credential_restricted'};
  if(!credentialAllows(care.credentialTier,primaryCode,rules)&&!grants.map(code).includes(code(primaryCode)))return {allowed:false,reason:'primary_service_restricted'};
  for(const allowedPos of [parse(medical.allowed_place_of_service_json),parse(medical.primary_allowed_place_of_service_json)])if(Array.isArray(allowedPos)&&allowedPos.length&&(!placeOfService||!allowedPos.map(String).includes(String(placeOfService))))return {allowed:false,reason:'place_of_service_restricted'};
  for(const configured of [policy?.placeOfService,primaryPolicy?.placeOfService])if(configured){const permitted=Array.isArray(configured)?configured:String(configured).split(/[,|\s]+/);if(!placeOfService||!permitted.map(String).includes(String(placeOfService)))return {allowed:false,reason:'place_of_service_restricted'};}
  const delivery=String(modality||'').toUpperCase();
  if(medical.modality&&String(medical.modality).toUpperCase()!=='EITHER'&&String(medical.modality).toUpperCase()!==delivery)return {allowed:false,reason:'modality_restricted'};
  return {allowed:true,reason:'existing_eligibility_confirmed'};
}

export async function reconcileClinicalAfterHours({agencyId,providerUserId,primaryCode,startAt,timeZone,modality,placeOfService,addonServiceCodes=[],metadata,billing},overrides={}) {
  const schedule=evaluate99051Schedule({startAt,timeZone,policyVersion:overrides.policyVersion||AFTER_HOURS_POLICY_VERSION});
  let authorization={allowed:false,reason:schedule.reason};
  if(isProBonoFunding({serviceCode:primaryCode,metadata,billing}))authorization={allowed:false,reason:'pro_bono_no_automatic_charge'};
  else if(schedule.eligible)authorization=await (overrides.authorize||canApply99051)({agencyId,providerUserId,primaryCode,modality,placeOfService,afterHoursSchedule:schedule},overrides);
  const allowed=schedule.eligible&&authorization.allowed;
  const addons=canonicalAfterHoursAddons(addonServiceCodes,allowed);
  return {addonServiceCodes:addons,billingAddons:addons.map(value=>{const previous=addonServiceCodes.find(item=>item&&typeof item==='object'&&code(item.code)===value);return previous?{...previous,code:value,units:value==='99051'?1:previous.units||1}:{code:value,units:1};}),afterHours:{...schedule,allowed,authorizationReason:authorization.reason}};
}

export async function savedOfficeBookingTimezone(officeEventId,agencyId,{database=pool}={}) {
  const [[office]]=await database.execute(`SELECT l.timezone FROM office_events e JOIN office_locations l ON l.id=e.office_location_id
    WHERE e.id=? AND (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies s WHERE s.office_location_id=l.id AND s.agency_id=?))`,[officeEventId,agencyId,agencyId]);
  if(!office?.timezone)throw Object.assign(new Error('The office schedule timezone could not be verified. Reopen the actual office appointment.'),{status:409,code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});
  try{new Intl.DateTimeFormat('en-US',{timeZone:office.timezone});}catch{throw Object.assign(new Error('The saved office timezone needs review.'),{status:409,code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});}
  return office.timezone;
}

/** Prefer an actual linked appointment, then an office occurrence and its saved
 * location timezone, then the persisted clinical session. No caller/browser time. */
export async function persistedClinicalSchedule(session,{database=pool}={}) {
  let appointment=null;
  if(session?.appointment_id){[[appointment]]=await database.execute('SELECT a.id,a.agency_id,a.provider_user_id,a.start_at,a.source_timezone,a.modality,a.office_event_id,EXISTS(SELECT 1 FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id=?) AS source_client_matches FROM appointments a WHERE a.id=?',[session.client_id,session.appointment_id]);
    if(!appointment||Number(appointment.agency_id)!==Number(session.agency_id)||Number(appointment.provider_user_id)!==Number(session.provider_user_id)||Number(appointment.source_client_matches)!==1)throw Object.assign(new Error('The linked appointment schedule could not be verified.'),{status:409,code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});
  }
  if(session?.office_event_id){const [[office]]=await database.execute('SELECT e.start_at,e.booked_provider_id,e.assigned_provider_id,e.client_id,e.modality,e.office_location_id,l.timezone,l.agency_id AS location_agency_id FROM office_events e JOIN office_locations l ON l.id=e.office_location_id WHERE e.id=?',[session.office_event_id]);
    if(!office||Number(office.booked_provider_id||office.assigned_provider_id)!==Number(session.provider_user_id)||(!appointment&&Number(office.client_id)!==Number(session.client_id))||(appointment&&Number(appointment.office_event_id)!==Number(session.office_event_id)))throw Object.assign(new Error('The linked office schedule could not be verified.'),{status:409,code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});
    if(Number(office.location_agency_id)!==Number(session.agency_id)){const [[shared]]=await database.execute('SELECT 1 FROM office_location_agencies WHERE office_location_id=? AND agency_id=? LIMIT 1',[office.office_location_id,session.agency_id]);if(!shared)throw Object.assign(new Error('The linked office location is outside this workspace.'),{status:409,code:'AFTER_HOURS_SOURCE_UNAVAILABLE'});}
    return {startAt:office.start_at,timeZone:office.timezone,modality:office.modality||appointment?.modality,source:'office_event'};}
  if(appointment)return {startAt:appointment.start_at,timeZone:appointment.source_timezone,modality:appointment.modality,source:'appointment'};
  return {startAt:session?.scheduled_start_at,timeZone:session?.source_timezone,modality:session?.is_telehealth?'TELEHEALTH':'IN_PERSON',source:'clinical_session'};
}

/** New claim lines only. Existing charges/history are never repriced. */
export async function reconcileNewClaimAfterHours({session,note,lines,metadata,billing},overrides={}) {
  // A signed version freezes its encounter source. Moving a linked operational
  // appointment later must never reprice an already approved clinical visit.
  const decision=note?.clinical_version_id?await deriveApproved99051Decision({note,session,billing},overrides):null;
  const actual=note?.clinical_version_id?{startAt:session?.scheduled_start_at,timeZone:session?.source_timezone,modality:session?.is_telehealth?'TELEHEALTH':'IN_PERSON'}:await persistedClinicalSchedule(session,overrides);
  const primaryCode=code(session?.service_code);
  const resolved=decision?{afterHours:{...evaluate99051Schedule(actual),allowed:decision.included}}:await reconcileClinicalAfterHours({agencyId:session?.agency_id,providerUserId:session?.provider_user_id,primaryCode,...actual,placeOfService:session?.place_of_service,metadata,billing,addonServiceCodes:lines.filter(line=>code(line.procedureCode)!==primaryCode).map(line=>line.procedureCode)},overrides);
  const retained=lines.filter(line=>code(line.procedureCode)!=='99051');
  if(resolved.afterHours.allowed){const prior=lines.find(line=>code(line.procedureCode)==='99051');retained.push(prior?{...prior,units:1}:{procedureCode:'99051',units:1,diagnosisPointers:'1'});}
  return {lines:retained,afterHours:resolved.afterHours,decision,policyBinding:decision?.binding||null};
}

const stable=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])));
const digest=value=>createHash('sha256').update(stable(value)).digest('hex');
const addonCount=lines=>lines.filter(line=>code(line.procedure_code||line.procedureCode)==='99051');

/** Freeze only approved encounter facts, never a mutable calendar or request.
 * This decision can excuse a99051 difference, never a clinical service change. */
export async function deriveApproved99051Decision({note,session,billing},overrides={}) {
  if(!Number(note?.clinical_version_id)||!Number.isSafeInteger(Number(note?.id))||Number(note.id)<1||!String(note?.clinical_version_content_hash||'').trim())return null;
  const startAt=clinicalScheduleInstant(session?.scheduled_start_at),timeZone=String(session?.source_timezone||'').trim();
  const schedule=evaluate99051Schedule({startAt,timeZone,policyVersion:overrides.policyVersion||AFTER_HOURS_POLICY_VERSION});
  if(!startAt||!schedule.localDate||!Number(session?.agency_id)||!Number(session?.id)||!Number(session?.client_id)||!Number(session?.provider_user_id)||!code(session?.service_code))return null;
  const metadata=parse(note.metadata_json)||{},approvedDate=metadata.dateOfService||metadata.date_of_service;
  if(approvedDate&&String(approvedDate instanceof Date?approvedDate.toISOString():approvedDate).slice(0,10)!==schedule.localDate)return null;
  const resolved=await reconcileClinicalAfterHours({agencyId:session.agency_id,providerUserId:session.provider_user_id,primaryCode:session.service_code,startAt,timeZone,modality:session.is_telehealth?'TELEHEALTH':'IN_PERSON',placeOfService:session.place_of_service,metadata:note.metadata_json,billing},overrides);
  const facts={kind:'schedule_derived_99051',policyVersion:schedule.policyVersion,agencyId:Number(session.agency_id),clientId:Number(session.client_id),clinicalSessionId:Number(session.id),providerUserId:Number(session.provider_user_id),noteId:Number(note.id),approvedRevisionId:Number(note.clinical_version_id),approvedContentHash:note.clinical_version_content_hash||null,primaryServiceCode:code(session.service_code),startAt,sourceTimezone:timeZone,serviceDate:schedule.localDate,placeOfService:String(session.place_of_service||''),isTelehealth:Number(session.is_telehealth)===1,included:resolved.afterHours.allowed};
  const binding={...facts,bindingHash:digest(facts)};
  return markScheduleDerived99051Decision({included:binding.included,binding});
}

/** Recomputed by prepareClaimReview, including its final call under transmission
 * locks. Historic claim amounts and signed clinical metadata are never changed. */
export async function reviewClaim99051Policy({claim,note,session,lines,billing},overrides={}) {
  const binding=parse(claim?.metadata_json)?.scheduleDerived99051;
  const actual=addonCount(lines),metadata=parse(note?.metadata_json)||{};
  const expected=(Array.isArray(metadata.billingAddons)?metadata.billingAddons:[]).filter(addon=>code(addon.code||addon.serviceCode||addon.service_code)==='99051');
  if(!binding&&!actual.length&&!expected.length)return {decision:null,blockers:[]};
  if(binding?.policyVersion&&![AFTER_HOURS_POLICY_VERSION,LEGACY_AFTER_HOURS_POLICY_VERSION].includes(binding.policyVersion))return {decision:null,blockers:['The saved99051 schedule policy version is not recognized. Review this draft before transmission.']};
  const decision=await deriveApproved99051Decision({note,session,billing},{...overrides,...(binding?.policyVersion?{policyVersion:binding.policyVersion}:{})});
  if(!decision)return {decision:null,blockers:['The approved encounter start and source timezone must be verified before applying the99051 after-hours policy.']};
  if(binding&&stable(binding)!==stable(decision.binding))return {decision:null,blockers:['The99051 schedule policy binding changed. Reconcile this draft with the approved encounter and current service eligibility.']};
  const countMatches=decision.included?actual.length===1&&Number(actual[0].units)===1:actual.length===0;
  if(!countMatches)return {decision:null,blockers:['The claim99051 line does not match the approved encounter schedule and current eligibility; exactly one unit is allowed only when qualified.']};
  // A matching legacy line needs no exception. Any clinical-metadata difference
  // requires the persisted server binding created by the reviewed draft workflow.
  if(!binding)return {decision:null,blockers:[]};
  return {decision,blockers:[]};
}

export async function savedClinicalFunding(session,{database=pool}={}) {
  if(!session?.appointment_id)return null;
  const [[billing]]=await database.execute('SELECT b.* FROM appointment_billing b JOIN appointments a ON a.id=b.appointment_id WHERE a.id=? AND a.agency_id=? AND a.provider_user_id=? LIMIT 1',[session.appointment_id,session.agency_id,session.provider_user_id]);
  return billing||null;
}

export function assertNoAutomaticProBonoClaim({session,noteMetadata,billing}) {
  if(isProBonoFunding({serviceCode:session?.service_code,metadata:session?.metadata_json,billing})||isProBonoFunding({serviceCode:session?.service_code,metadata:noteMetadata,billing}))throw Object.assign(new Error('Pro bono means no client charge and does not authorize an automatic insurance claim. Billing must verify a separate approved payer funding policy.'),{status:409,code:'PRO_BONO_FUNDING_REVIEW_REQUIRED'});
}
