import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import { getProviderClaimBillingMode } from './resolveClaimProviders.service.js';

export const NPI_CHANGE_DATE = '2027-01-01';
export const NONBILLABLE_TYPES = ['TERMINATION', 'TREATMENT_PLAN', 'CONTACT_NOTE', 'CONTACT', 'APPOINTMENT_WAIVER', 'APPOINTMENT_CHANGE'];
export const parseObject = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export const policyError = (status, message) => Object.assign(new Error(message), { status });
export const dateOnly = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10);
export function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v; }
export function validNpi(value) {
  const s = String(value || '');
  if (!/^\d{10}$/.test(s)) return false;
  const digits = `80840${s}`.split('').reverse().map(Number);
  return digits.reduce((sum, n, i) => { const v = i % 2 ? n * 2 : n; return sum + (v > 9 ? v - 9 : v); }, 0) % 10 === 0;
}
export function normalizeNoteType(noteType) {
  const type = String(noteType || '').toUpperCase().replace(/[ -]+/g, '_');
  return type.includes('TERMINATION') ? 'TERMINATION' : type.includes('TREATMENT_PLAN') ? 'TREATMENT_PLAN' : type;
}
export function isNonBillableDocument(note) {
  const meta = parseObject(note.metadata_json);
  return NONBILLABLE_TYPES.includes(normalizeNoteType(note.note_type || meta.noteType)) || meta.documentationFlow === 'review' || meta.nonBillable === true;
}
export function hasClinicalAmendments(note) {
  return !!note.latest_addendum_at || Number(note.addendum_count || 0) > 0;
}
export function hasCurrentSupervisorCosign(note, supervisorUserId, contentHash = note.review_content_hash) {
  if (!supervisorUserId || !note.supervisor_cosigned_at || Number(note.supervisor_cosigned_by_user_id) !== Number(supervisorUserId)) return false;
  const signedHash = parseObject(note.metadata_json).supervisorCosign?.contentHash;
  // Amended documents require a signature over the exact note and all addenda.
  if (hasClinicalAmendments(note)) return !!signedHash && !!contentHash && signedHash === contentHash;
  return signedHash && contentHash ? signedHash === contentHash : true;
}
export function documentReviewRequirement(note, policy, mandatoryTypes = []) {
  const type = normalizeNoteType(note.note_type || parseObject(note.metadata_json).noteType);
  const mandatoryReview = hasClinicalAmendments(note) || mandatoryTypes.includes(type);
  return { mandatoryReview, reviewRequested: mandatoryReview || !isNonBillableDocument(note)
    || policy.nonBillableReview === 'all'
    || (policy.nonBillableReview === 'selected' && (policy.noteTypes || []).includes(type)) };
}
export async function nonBillableReviewTypes(agencyId) {
  const [rows] = await clinicalPool.execute(`SELECT DISTINCT COALESCE(NULLIF(note_type,''), JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.noteType'))) AS note_type
    FROM clinical_notes WHERE agency_id=? AND is_deleted=0 AND
    (JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.nonBillable'))='true' OR JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.documentationFlow'))='review')`, [agencyId]);
  return [...new Set([...NONBILLABLE_TYPES, ...rows.map(r=>normalizeNoteType(r.note_type)).filter(t=>/^[A-Z][A-Z0-9_]{0,63}$/.test(t))])];
}
export function normalizeSupervisionPolicy(input, availableTypes = NONBILLABLE_TYPES) {
  if (!['before_submission','after_submission'].includes(input.cosignTiming)) throw policyError(400, 'Choose when billable notes need cosign');
  if (!['all','selected','none'].includes(input.nonBillableReview)) throw policyError(400, 'Choose non-billable review coverage');
  if (!Array.isArray(input.noteTypes) || input.noteTypes.some(t => !availableTypes.includes(t))) throw policyError(400, 'Choose valid non-billable document types');
  if (!Number.isInteger(input.cosignDueDays) || input.cosignDueDays < 1 || input.cosignDueDays > 30) throw policyError(400, 'Cosign follow-up must be within 1–30 days');
  return { cosignTiming: input.cosignTiming, nonBillableReview: input.nonBillableReview, noteTypes: [...new Set(input.noteTypes)], cosignDueDays: input.cosignDueDays };
}
export function normalizePayerPolicy(input) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(input.payerId || '') || !String(input.planType || '').trim() || String(input.planType).length > 100) throw policyError(400, 'Exact payer ID and insurance plan type are required');
  if (!Array.isArray(input.rules) || input.rules.length > 30) throw policyError(400, 'Provide up to 30 dated payer rules');
  const rules = input.rules.map(rule => {
    if (!validDate(rule.effectiveFrom) || !validDate(rule.effectiveThrough) || rule.effectiveThrough < rule.effectiveFrom) throw policyError(400, 'Every rule needs valid effective dates');
    if (!['supervisor_rendering','service_rendering_with_supervisor'].includes(rule.providerMapping)) throw policyError(400, 'Choose a supported provider mapping');
    if (typeof rule.deferredCosignAllowed !== 'boolean' || typeof rule.mappingVerified !== 'boolean' || !String(rule.reference || '').trim() || String(rule.reference).length > 1000) throw policyError(400, 'Document the payer rule reference and verification');
    if (!Array.isArray(rule.requiredReviewTypes) || rule.requiredReviewTypes.some(t => !NONBILLABLE_TYPES.includes(t))) throw policyError(400, 'Invalid mandatory review types');
    return { effectiveFrom: rule.effectiveFrom, effectiveThrough: rule.effectiveThrough, providerMapping: rule.providerMapping,
      deferredCosignAllowed: rule.deferredCosignAllowed, mappingVerified: rule.mappingVerified, reference: rule.reference.trim(),
      requiredReviewTypes: [...new Set(rule.requiredReviewTypes)] };
  }).sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (rules.some((r,i) => i > 0 && r.effectiveFrom <= rules[i-1].effectiveThrough)) throw policyError(400, 'Payer policy periods must not overlap');
  return { payerId: input.payerId, planType: input.planType.trim(), coloradoMedicaid: input.coloradoMedicaid === true, rules };
}
export const DEFAULT_SUPERVISION_POLICY = { cosignTiming: 'before_submission', nonBillableReview: 'all', noteTypes: [], cosignDueDays: 7 };
export async function resolveDocumentationPolicy(agencyId, providerUserId, db = pool) {
  const assignments = await SupervisorAssignment.findBySupervisee(providerUserId, agencyId);
  const prefs = await getProviderClaimBillingMode({ agencyId, providerUserId });
  const supervisor = prefs.mode === 'billing_supervisor'
    ? assignments.find(a => Number(a.supervisor_id) === Number(prefs.billingSupervisorUserId) && Number(a.supervisor_id) !== Number(providerUserId))
    : SupervisorAssignment.pickClinicalCosignSupervisor(assignments, providerUserId);
  let rows;
  try { [rows] = await db.execute('SELECT * FROM clinical_supervision_policies WHERE agency_id = ? AND provider_user_id = ? ORDER BY id DESC LIMIT 1', [agencyId, providerUserId]); }
  catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; rows = []; }
  const saved = rows[0];
  const matching = saved && Number(saved.supervisor_user_id) === Number(supervisor?.supervisor_id);
  return { ...DEFAULT_SUPERVISION_POLICY, ...(matching ? parseObject(saved.policy_json) : {}), version: saved?.id || 0,
    supervisorUserId: Number(supervisor?.supervisor_id) || null, billingMode: prefs.mode };
}
export async function loadPayerPolicy(agencyId, payerId, planType, db = pool) {
  const [[row]] = await db.execute('SELECT * FROM billing_payer_policy_versions WHERE agency_id = ? AND payer_id = ? AND plan_type = ? ORDER BY id DESC LIMIT 1', [agencyId, payerId || '', planType || '']);
  return row ? { ...parseObject(row.policy_json), version: row.id } : null;
}
export async function requiredDocumentReviewTypes(agencyId, clientId, documentDate) {
  if (!clientId) return [];
  const { readClientInsurance } = await import('./clientInsurance.service.js');
  const insurance = await readClientInsurance(clientId, agencyId);
  const result = new Set(), date = dateOnly(documentDate) || new Date().toISOString().slice(0,10);
  for (const coverage of [insurance?.primary, insurance?.secondary].filter(Boolean)) {
    const policy = await loadPayerPolicy(agencyId, coverage.payerId, coverage.planType);
    const rule = policy?.rules?.find(r => r.effectiveFrom <= date && r.effectiveThrough >= date);
    for (const type of rule?.requiredReviewTypes || []) result.add(type);
  }
  return [...result];
}
export function evaluateSupervisedBilling({ policy, payerPolicy, dateOfService, serviceProvider, supervisor, note, claimDate = new Date().toISOString().slice(0,10) }) {
  const blockers = [], warnings = [];
  const dos = dateOnly(dateOfService);
  const rule = payerPolicy?.rules?.find(r => r.effectiveFrom <= dos && r.effectiveThrough >= dos) || null;
  const supervised = policy.billingMode === 'billing_supervisor';
  const cosigned = hasCurrentSupervisorCosign(note, policy.supervisorUserId);
  const amended = hasClinicalAmendments(note);
  const nonBillable = isNonBillableDocument(note);
  if (nonBillable) blockers.push('This document is non-billable');
  if (!note.provider_signed_at) blockers.push('Provider signature is required');
  if (supervised && !policy.supervisorUserId) blockers.push('Assign a responsible billing supervisor');
  if (supervised && (!rule || !rule.mappingVerified)) blockers.push('Verify the payer/product provider mapping for this date of service');
  const coMedicaid = payerPolicy?.coloradoMedicaid === true;
  // The announcement does not specify DOS versus submission date. Guard both until clarified.
  const npi2027 = coMedicaid && (dos >= NPI_CHANGE_DATE || dateOnly(claimDate) >= NPI_CHANGE_DATE);
  if ((!supervised || npi2027 || rule?.providerMapping === 'service_rendering_with_supervisor') && !validNpi(serviceProvider?.npi)) blockers.push('The treating service provider needs a valid individual NPI');
  if (supervised && !validNpi(supervisor?.npi)) blockers.push('The overseeing provider needs a valid individual NPI');
  if (npi2027 && supervised && rule?.providerMapping !== 'service_rendering_with_supervisor') blockers.push('January 2027 requires the service provider NPI on the claim; confirm the updated payer/Claim.MD mapping');
  if (coMedicaid && !npi2027 && !validNpi(serviceProvider?.npi)) warnings.push('Obtain the treating provider’s individual NPI before January 1, 2027');
  const cosignPending = (!!policy.supervisorUserId || amended) && !cosigned;
  if (cosignPending) {
    if (amended) blockers.push('Every amendment/addendum requires supervisor sign-off before submission; review settings and deferred cosign cannot waive it');
    else if (policy.cosignTiming !== 'after_submission' || !rule?.deferredCosignAllowed) blockers.push('Supervisor cosign is required before submission');
    else warnings.push(`Supervisor cosign remains due within ${policy.cosignDueDays} days of provider signature`);
  }
  const rendering = supervised && rule?.providerMapping === 'supervisor_rendering' ? supervisor : serviceProvider;
  return { blockers, warnings, rule, cosignPending, cosigned, npi2027,
    serviceProvider, supervisingProvider: supervised ? supervisor : null, renderingProvider: rendering,
    emitSupervisor: supervised && rule?.providerMapping === 'service_rendering_with_supervisor',
    policyVersion: policy.version, payerPolicyVersion: payerPolicy?.version || 0 };
}
