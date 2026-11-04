/**
 * Server-only source adapters for external assistant review packets.
 *
 * Callers MUST retain mapping/sourceRevision privately and persist packet encrypted.
 * A screened narrative is not a claim of legal de-identification. No raw source is
 * returned on a blocked result and no model is invoked by this module.
 */
import crypto from 'node:crypto';
import mainPool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { createSessionPrivacyContext } from './sessionAiPrivacy.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
import { pickAuthoritativeTreatmentPlan } from './treatmentPlanPrecedence.service.js';
import { splitTreatmentPlanSections } from './treatmentPlanSections.service.js';
import { resolveNoteDocumentationPolicy, documentReviewRequirement, hasCurrentSupervisorCosign } from './supervisedBillingPolicy.service.js';
import { noteReviewContent } from './clinicalReviewDocument.service.js';
import { getEffectiveNote } from './clinicalNoteVersion.service.js';

const PACKET_VERSION = 'assistant-review-packet-v1';
const PROGRESS_TYPES = ['PROGRESS', 'PROGRESS_NOTE', 'SOAP', 'DAP', 'BIRP', 'GIRP', 'SESSION_NOTE', 'PSYCHOTHERAPY'];
const ACTIVE_CLIENT_SQL = "c.terminated_at IS NULL AND c.status='ACTIVE'";
const MAX_SOURCE_CHARACTERS = 300000;
const REVIEW_ROLES = new Set(['clinical', 'compliance']);
const object = value => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};
const stable = value => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const opaque = () => `src_${crypto.randomUUID().replaceAll('-', '')}`;
const invalid = code => Object.assign(new Error('Assistant source preparation is unavailable'), { reasonCode: code });
const blocked = reasonCode => ({ packet: null, mapping: null, sourceRevision: null, status: 'blocked', reasonCode });
const isRestricted = row => {
  const meta = object(row?.metadata_json);
  return [row?.privatePsychotherapyNote, row?.restricted, meta.privatePsychotherapyNote, meta.restricted].some(value => value === true || value === 1 || value === 'true' || value === '1');
};
const activeClient = row => !!row && !row.terminated_at && String(row.status || '').toUpperCase() === 'ACTIVE';
const progressNote = note => PROGRESS_TYPES.includes(String(note.note_type || object(note.metadata_json).noteType || '').toUpperCase().replaceAll(' ', '_'));
const scopeMatches = (row, agencyId, clientId) => Number(row?.agency_id) === agencyId && Number(row?.client_id) === clientId;
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const scale = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 10 ? Number(value) : null;

function assertInput({ agencyId, clientId, subrole }) {
  if (!id(agencyId) || !id(clientId) || !REVIEW_ROLES.has(subrole)) throw invalid('INVALID_SCOPE');
}
function privacyApproved(policy) {
  return policy?.enabled === true && policy?.baaVerified === true && policy?.approved === true
    && policy?.sampleReviewPassed === true && typeof policy.revision === 'string' && !!policy.revision.trim()
    && typeof policy.externalService === 'string' && policy.externalService.trim().length >= 2
    && typeof policy.baaReference === 'string' && policy.baaReference.trim().length >= 5
    && typeof policy.sampleReviewReference === 'string' && policy.sampleReviewReference.trim().length >= 5;
}
function identifiersFrom(rows) {
  const keys = ['full_name', 'initials', 'identifier_code', 'first_name', 'last_name', 'preferred_name', 'email', 'personal_email', 'work_email', 'contact_phone', 'phone_number', 'personal_phone', 'work_phone', 'date_of_birth', 'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip', 'home_street_address', 'home_address_line2', 'home_city', 'home_state', 'home_postal_code'];
  return [...new Set(rows.flatMap(row => keys.map(key => row?.[key])).filter(value => value != null && String(value).trim().length >= 2).map(value => String(value)))];
}
const INSURANCE_IDENTIFIER_LABEL = /\b(?:member|policy|subscriber|insurance)[ _-]*(?:id|number|#)(?![A-Z0-9_])["']?\s*[:#=]?/i;
function stripSourceIdentifiers(text) {
  const stripped = String(text || '')
    .replace(/(?:^|\n)[ \t]*(?:(?:electronically[ \t]+)?signed[ \t]+by|(?:provider|supervisor|clinician)[ \t]+signature|signature[ \t]+block|attested[ \t]+by|co[ -]?signed[ \t]+by)[ \t]*[:=-]?[^\n]*/gi, '\n[SIGNATURE_BLOCK_REMOVED]')
    .replace(/\b(?:client|patient|provider|guardian|clinician)[ _-]+initials["']?\s*[:=#][ \t]*["']?[A-Z.]{1,12}/gi, '[INITIALS_REMOVED]')
    .replace(/\b(?:member|policy|subscriber|insurance)[ _-]*(?:id|number|#)(?![A-Z0-9_])["']?\s*[:#=]?[ \t]*["']?[A-Z0-9][A-Z0-9-]*(?:[ \t]+[A-Z0-9-]*\d[A-Z0-9-]*){0,4}/gi, '[INSURANCE_IDENTIFIER_REMOVED]')
    .replace(/\b(?:user|client|patient|provider|clinician|agency|note|claim|chart|record|session|goal|objective|treatment[ _-]?plan)\s*(?:id\s*[:#]?|#)\s*\d+\b/gi, '[REFERENCE]')
    .replace(/\b(?:user|client|patient|provider|agency|clinical_note|clinical_session|claim|goal|objective|treatment_plan)_?id["']?\s*[:=]\s*["']?\d+/gi, '[REFERENCE]');
  if (INSURANCE_IDENTIFIER_LABEL.test(stripped)) throw invalid('IDENTIFIER_REQUIRES_REVIEW');
  return stripped;
}

function plainPayload(payload) {
  const plain = maybeDecryptNotePayload(payload);
  const parsed = object(plain);
  if (parsed._enc) throw invalid('SOURCE_UNREADABLE');
  // Metadata, signatures, names and title are never serialized from structured notes.
  const sections = parsed.sections || parsed.note?.sections;
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    return Object.entries(sections).filter(([, value]) => typeof value === 'string').map(([key, value]) => `${key}: ${value}`).join('\n\n');
  }
  if (typeof parsed.note === 'string') return parsed.note;
  // Plain legacy notes are screened as a whole. Unknown structured payloads fail closed.
  if (plain.trim().startsWith('{') || plain.trim().startsWith('[')) throw invalid('SOURCE_FORMAT_UNSUPPORTED');
  return plain;
}

/** Internal IDs only. Always follow nextCursor, including empty pages after incremental filtering. */
export async function inventoryEligibleCharts({ agencyId, afterId = 0, limit = 50, changedSince = null } = {}, deps = {}) {
  if (!id(agencyId) || !Number.isSafeInteger(Number(afterId)) || Number(afterId) < 0) throw invalid('INVALID_SCOPE');
  let cutoff = null;
  if (changedSince != null) {
    const utc = typeof changedSince === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(changedSince)
      ? changedSince.replace(' ', 'T') + 'Z' : changedSince;
    cutoff = new Date(utc);
    if (!Number.isFinite(cutoff.getTime())) throw invalid('INVALID_CHANGE_CURSOR');
  }
  const size = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const main = deps.mainDb || mainPool;
  const [rows] = await main.execute(`SELECT c.id,c.updated_at FROM clients c WHERE c.agency_id=? AND c.id>? AND ${ACTIVE_CLIENT_SQL} ORDER BY c.id LIMIT ${size + 1}`, [Number(agencyId), Number(afterId)]);
  const page = rows.slice(0, size), nextCursor = rows.length > size ? Number(page.at(-1).id) : null;
  if (!cutoff || !page.length) return { charts: page.map(row => ({ clientId: Number(row.id) })), nextCursor };
  const placeholders = page.map(() => '?').join(','), scope = alias => `${alias}.agency_id=? AND ${alias}.client_id IN (${placeholders})`;
  const terms = [
    [`SELECT n.client_id FROM clinical_notes n WHERE ${scope('n')} AND n.updated_at>=?`, 1],
    [`SELECT e.client_id FROM clinical_note_addenda e WHERE ${scope('e')} AND (e.created_at>=? OR e.author_signed_at>=?)`, 2],
    [`SELECT n.client_id FROM clinical_note_revisions v JOIN clinical_notes n ON n.id=v.clinical_note_id AND n.agency_id=v.agency_id WHERE ${scope('n')} AND v.created_at>=?`, 1],
    [`SELECT n.client_id FROM clinical_note_revision_signatures sig JOIN clinical_notes n ON n.id=sig.clinical_note_id AND n.agency_id=sig.agency_id WHERE ${scope('n')} AND sig.signed_at>=?`, 1],
    [`SELECT n.client_id FROM clinical_note_revision_approvals approval JOIN clinical_notes n ON n.id=approval.clinical_note_id AND n.agency_id=approval.agency_id WHERE ${scope('n')} AND approval.approved_at>=?`, 1],
    [`SELECT p.client_id FROM clinical_treatment_plans p WHERE ${scope('p')} AND p.updated_at>=?`, 1],
    [`SELECT p.client_id FROM clinical_treatment_plan_goals g JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id WHERE ${scope('p')} AND (g.updated_at>=? OR g.superseded_at>=?)`, 2],
    [`SELECT p.client_id FROM clinical_treatment_plan_objectives o JOIN clinical_treatment_plan_goals g ON g.id=o.goal_id JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id WHERE ${scope('p')} AND (o.updated_at>=? OR o.superseded_at>=?)`, 2],
    [`SELECT r.client_id FROM clinical_treatment_objective_ratings r WHERE ${scope('r')} AND (r.rated_at>=? OR r.created_at>=?)`, 2],
    [`SELECT s.client_id FROM clinical_sessions s WHERE ${scope('s')} AND s.updated_at>=?`, 1],
    [`SELECT c.client_id FROM clinical_claims c WHERE ${scope('c')} AND c.updated_at>=?`, 1],
    [`SELECT c.client_id FROM clinical_claim_lines l JOIN clinical_claims c ON c.id=l.clinical_claim_id WHERE ${scope('c')} AND l.updated_at>=?`, 1]
  ];
  const params = terms.flatMap(([, dates]) => [Number(agencyId), ...page.map(row => Number(row.id)), ...Array(dates).fill(cutoff)]);
  // Deliberately include deletion/restoration/supersession touches. Filtering only
  // currently signed or active rows here would miss removal from an old packet.
  const [changed] = await (deps.clinicalDb || clinicalPool).execute(terms.map(([sql]) => sql).join(' UNION '), params);
  const ids = new Set(changed.map(row => Number(row.client_id)));
  for (const row of page) {
    const raw = row.updated_at;
    const value = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw;
    const touched = raw == null ? NaN : new Date(value).getTime();
    // Unknown timestamps cannot establish that a source is unchanged.
    if (!Number.isFinite(touched) || touched >= cutoff.getTime()) ids.add(Number(row.id));
  }
  return { charts: page.filter(row => ids.has(Number(row.id))).map(row => ({ clientId: Number(row.id) })), nextCursor };
}

async function defaultLoadSources({ agencyId, clientId }, deps) {
  const main = deps.mainDb || mainPool, clinical = deps.clinicalDb || clinicalPool;
  const [[client]] = await main.execute('SELECT c.id,c.agency_id,c.status,c.terminated_at,c.full_name,c.initials,c.identifier_code,c.email,c.contact_phone,c.date_of_birth,c.address_street,c.address_apt,c.address_city,c.address_state,c.address_zip FROM clients c WHERE c.id=? AND c.agency_id=?', [clientId, agencyId]);
  if (!activeClient(client)) throw invalid('CHART_NOT_ACTIVE');
  // All SELECTs are read-only. Source hashes are checked again before accepting results.
  const [storedNotes] = await clinical.execute(`SELECT n.*,(SELECT COUNT(*) FROM clinical_note_addenda ax WHERE ax.clinical_note_id=n.id AND ax.agency_id=n.agency_id) total_addendum_count,s.scheduled_start_at AS encounter_at,s.place_of_service AS encounter_pos,s.service_code AS encounter_code,s.duration_minutes AS encounter_minutes,s.is_telehealth
    FROM clinical_notes n LEFT JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id AND s.client_id=n.client_id
    LEFT JOIN clinical_note_revision_heads h ON h.clinical_note_id=n.id AND h.agency_id=n.agency_id
    LEFT JOIN clinical_note_revisions v ON v.id=h.effective_revision_id AND v.clinical_note_id=n.id AND v.agency_id=n.agency_id
    WHERE n.agency_id=? AND n.client_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL
      AND UPPER(REPLACE(COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v.snapshot_json,'$.noteType')),'null'),''),NULLIF(n.note_type,''),JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.noteType')),''),' ','_')) IN (${PROGRESS_TYPES.map(() => '?').join(',')})
      AND ${sharedNotePredicate('n')}
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.privatePsychotherapyNote')),'false') NOT IN ('true','1')
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.restricted')),'false') NOT IN ('true','1')
    ORDER BY COALESCE(STR_TO_DATE(LEFT(JSON_UNQUOTE(JSON_EXTRACT(v.snapshot_json,'$.encounterContext.scheduledStartAt')),19),'%Y-%m-%dT%H:%i:%s'),s.scheduled_start_at,STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.dateOfService')),'%Y-%m-%d')) DESC,n.id DESC LIMIT 5`, [agencyId, clientId, ...PROGRESS_TYPES]);
  const notes = [];
  for (const storedNote of storedNotes) {
    // This adapter only SELECTs initialized version history. It must never
    // initialize legacy revisions or expose an unsigned pending amendment.
    const effective = await (deps.loadEffectiveNote || getEffectiveNote)({ note: storedNote }, clinical);
    if (Number(effective.clinical_version_number) > 1) {
      const [[approval]] = await clinical.execute('SELECT id,revision_id,signature_id,content_hash,approved_at FROM clinical_note_revision_approvals WHERE revision_id=? AND clinical_note_id=? AND agency_id=?',
        [effective.clinical_version_id, effective.id, effective.agency_id]);
      const approvalAction = effective.clinical_version_origin === 'supervisor' || effective.clinical_version_requires_supervisor_cosign ? 'supervisor_sign' : 'author_sign';
      if (!approval?.approved_at || approval.content_hash !== effective.clinical_version_content_hash
          || !(effective.clinical_version_signatures || []).some(signature => Number(signature.id) === Number(approval.signature_id)
            && signature.contentHash === approval.content_hash && signature.action === approvalAction)) throw invalid('APPROVED_CLINICAL_VERSION_UNAVAILABLE');
      effective.clinical_version_approval = approval;
    }
    const context = effective.clinical_version_encounter_context || {};
    notes.push({ ...effective, encounter_at: context.scheduledStartAt || effective.encounter_at,
      encounter_pos: context.placeOfService ?? effective.encounter_pos, encounter_code: context.serviceCode ?? effective.encounter_code,
      encounter_minutes: context.durationMinutes ?? effective.encounter_minutes,
      is_telehealth: context.isTelehealth ?? effective.is_telehealth,
      total_addendum_count: (effective.clinical_version_addenda || []).filter(entry => entry.author_signed_at).length });
  }
  const [plans] = await clinical.execute("SELECT * FROM clinical_treatment_plans WHERE agency_id=? AND client_id=? AND status='active' ORDER BY COALESCE(effective_date,DATE(created_at)) DESC,id DESC", [agencyId, clientId]);
  const plan = pickAuthoritativeTreatmentPlan(plans.filter(row => !isRestricted(row)));
  if (plan) {
    const [goals] = await clinical.execute("SELECT * FROM clinical_treatment_plan_goals WHERE treatment_plan_id=? AND superseded_at IS NULL AND status<>'superseded' ORDER BY goal_index,id", [plan.id]);
    plan.goals = goals;
    for (const goal of goals) {
      const [objectives] = await clinical.execute("SELECT * FROM clinical_treatment_plan_objectives WHERE goal_id=? AND superseded_at IS NULL AND status<>'superseded' ORDER BY objective_index,id", [goal.id]);
      goal.objectives = objectives;
    }
  }
  const noteIds = notes.map(note => note.id), objectiveIds = (plan?.goals || []).flatMap(goal => (goal.objectives || []).map(objective => objective.id));
  let addenda = [], ratings = [], claims = [], lines = [];
  if (noteIds.length) {
    [addenda] = await clinical.execute(`SELECT * FROM clinical_note_addenda WHERE agency_id=? AND client_id=? AND clinical_note_id IN (${noteIds.map(() => '?').join(',')}) AND author_signed_at IS NOT NULL ORDER BY created_at,id`, [agencyId, clientId, ...noteIds]);
    const approvedEntries = new Set(notes.flatMap(note => (note.clinical_version_addenda || []).map(entry => `${note.id}:${entry.id}`)));
    addenda = addenda.filter(entry => approvedEntries.has(`${entry.clinical_note_id}:${entry.id}`));
    [claims] = await clinical.execute(`SELECT id,agency_id,client_id,clinical_note_id,place_of_service,date_of_service,claim_lifecycle,billing_revision,updated_at FROM clinical_claims WHERE agency_id=? AND client_id=? AND clinical_note_id IN (${noteIds.map(() => '?').join(',')}) AND is_deleted=0 ORDER BY id`, [agencyId, clientId, ...noteIds]);
    if (claims.length > 100) throw invalid('SOURCE_TOO_LARGE');
    if (claims.length) [lines] = await clinical.execute(`SELECT l.id,l.clinical_claim_id,l.clinical_note_id,l.procedure_code,l.modifiers_json,l.units,l.service_date,l.updated_at FROM clinical_claim_lines l JOIN clinical_claims c ON c.id=l.clinical_claim_id WHERE c.agency_id=? AND c.client_id=? AND c.id IN (${claims.map(() => '?').join(',')}) ORDER BY l.clinical_claim_id,l.line_number,l.id`, [agencyId, clientId, ...claims.map(claim => claim.id)]);
    if (objectiveIds.length) [ratings] = await clinical.execute(`SELECT * FROM clinical_treatment_objective_ratings WHERE agency_id=? AND client_id=? AND clinical_note_id IN (${noteIds.map(() => '?').join(',')}) AND objective_id IN (${objectiveIds.map(() => '?').join(',')}) ORDER BY COALESCE(date_of_service,DATE(rated_at)),rated_at,id LIMIT 5001`, [agencyId, clientId, ...noteIds, ...objectiveIds]);
  }
  if (ratings.length > 5000) throw invalid('SOURCE_TOO_LARGE');
  const documentationPolicies = {};
  for (const note of notes) {
    try {
      const policy = await (deps.loadDocumentationPolicy || (value => resolveNoteDocumentationPolicy(value, main, clinical)))(note);
      documentationPolicies[note.id] = { version: policy.version, supervisorUserId: policy.supervisorUserId || null, nonBillableReview: policy.nonBillableReview, noteTypes: policy.noteTypes || [] };
    } catch { documentationPolicies[note.id] = null; }
  }
  const providerIds = [...new Set(notes.flatMap(note => [note.created_by_user_id, note.provider_signed_by_user_id,
    ...(note.clinical_version_signatures || []).map(signature => signature.actorUserId)]).filter(id))];
  const [providers] = providerIds.length ? await main.execute(`SELECT id,first_name,last_name,email,personal_email,work_email,personal_phone,work_phone,phone_number,home_street_address,home_address_line2,home_city,home_state,home_postal_code FROM users WHERE id IN (${providerIds.map(() => '?').join(',')}) ORDER BY id`, providerIds) : [[]];
  const [guardians] = await main.execute('SELECT u.id,u.first_name,u.last_name,u.email,u.personal_email,u.work_email,u.personal_phone,u.work_phone,u.phone_number,u.home_street_address,u.home_address_line2,u.home_city,u.home_state,u.home_postal_code FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? ORDER BY u.id', [clientId]);
  return { client, notes, plan, addenda, ratings, claims, lines, documentationPolicies, knownIdentifiers: identifiersFrom([client, ...providers, ...guardians]), clientNames: [client.full_name].filter(Boolean), providerNames: providers.map(provider => [provider.first_name, provider.last_name].filter(Boolean).join(' ')) };
}

function normalizeSources(input, agencyId, clientId) {
  if (!activeClient(input.client) || Number(input.client.agency_id) !== agencyId || Number(input.client.id) !== clientId) throw invalid('CHART_NOT_ACTIVE');
  const notes = (input.notes || []).filter(note => scopeMatches(note, agencyId, clientId) && !note.is_deleted && note.provider_signed_at && !isRestricted(note) && progressNote(note));
  const chronology = note => note.encounter_at || object(note.metadata_json).dateOfService;
  if (notes.some(note => !chronology(note) || !Number.isFinite(new Date(chronology(note)).getTime()))) throw invalid('ENCOUNTER_CHRONOLOGY_MISSING');
  notes.sort((a, b) => new Date(chronology(b)) - new Date(chronology(a)) || Number(b.id) - Number(a.id));
  notes.splice(5);
  for (const note of notes) note.total_addendum_count = Math.max(Number(note.total_addendum_count || note.addendum_count || 0), (input.addenda || []).filter(entry => scopeMatches(entry, agencyId, clientId) && Number(entry.clinical_note_id) === Number(note.id)).length);
  const plan = input.plan && scopeMatches(input.plan, agencyId, clientId) && input.plan.status === 'active' && !isRestricted(input.plan) ? input.plan : null;
  const noteIds = new Set(notes.map(note => Number(note.id)));
  const objectiveIds = new Set((plan?.goals || []).filter(goal => !goal.superseded_at && goal.status !== 'superseded').flatMap(goal => (goal.objectives || []).filter(objective => !objective.superseded_at && objective.status !== 'superseded').map(objective => Number(objective.id))));
  return { ...input, plan, notes,
    addenda: (input.addenda || []).filter(entry => scopeMatches(entry, agencyId, clientId) && noteIds.has(Number(entry.clinical_note_id)) && entry.author_signed_at),
    ratings: (input.ratings || []).filter(rating => scopeMatches(rating, agencyId, clientId) && noteIds.has(Number(rating.clinical_note_id)) && objectiveIds.has(Number(rating.objective_id))),
    claims: (input.claims || []).filter(claim => scopeMatches(claim, agencyId, clientId) && noteIds.has(Number(claim.clinical_note_id))) };
}
async function snapshot(input, deps) {
  assertInput(input);
  const agencyId = Number(input.agencyId), clientId = Number(input.clientId);
  const raw = await (deps.loadSources || (args => defaultLoadSources(args, deps)))({ agencyId, clientId });
  const sources = normalizeSources(raw, agencyId, clientId);
  const policy = input.subrole === 'compliance' ? await (deps.loadCompliancePolicy || (() => input.privacyPolicy?.compliancePolicy || null))({ agencyId, sources }) : null;
  return { sources, policy, sourceRevision: hash({ version: PACKET_VERSION, agencyId, clientId, subrole: input.subrole, privacyPolicy: input.privacyPolicy, sources, policy }) };
}

/** No DLP/model/network generation. Only source database reads for completion-time stale checks. */
export async function readSourceRevision(input, deps = {}) {
  const result = await snapshot(input, deps);
  return result.sourceRevision;
}

function validCode(value) { return /^[A-Z0-9]{5}$/.test(String(value || '').toUpperCase()) ? String(value).toUpperCase() : null; }
function validPos(value) { return /^\d{2}$/.test(String(value || '')) ? String(value) : null; }
function ruleApplies(rule, sources) {
  const from = day(rule.effectiveFrom), through = day(rule.effectiveThrough);
  if (!validDay(from) || !validDay(through) || through < from) return false;
  // This flag is an owner attestation. This adapter does not independently match
  // a payer/product; the packet explicitly retains that limitation.
  if (rule.applicabilityVerified !== true) return false;
  const dates = sources.claims.map(claim => day(claim.date_of_service)).filter(Boolean);
  return dates.length > 0 && dates.every(date => date >= from && date <= through);
}

function safeSignatureState(note, entries, policy) {
  const signedEntries = [...entries].sort((a, b) => Number(a.id) - Number(b.id));
  if (Number(note.clinical_version_number) > 1) {
    const actions = new Set((note.clinical_version_signatures || []).map(signature => signature.action));
    const cosignRequired = !!note.clinical_version_requires_supervisor_cosign, supervisorCosigned = actions.has('supervisor_sign');
    return { providerSigned: actions.has('author_sign'), authorAcknowledged: actions.has('author_acknowledge'),
      cosignRequired, supervisorCosigned, signedEntriesPresent: signedEntries.length > 0,
      status: !cosignRequired ? 'not_required' : supervisorCosigned ? 'current' : 'pending' };
  }
  // Independently signed additions do not alter the original version's approval.
  const boundEntries = note.clinical_version_id ? note.clinical_version_signed_addenda || [] : signedEntries;
  const contentHash = crypto.createHash('sha256').update(noteReviewContent(note.note_payload, boundEntries)).digest('hex');
  const totalEntries = note.clinical_version_id ? boundEntries.length : Math.max(signedEntries.length, Number(note.total_addendum_count || note.addendum_count || 0));
  const complete = note.clinical_version_id ? true : totalEntries === signedEntries.length;
  const current = { ...note, addendum_count: totalEntries, latest_addendum_at: boundEntries.at(-1)?.created_at || null,
    ...(note.clinical_version_id ? { legacy_review_content_hash: contentHash } : {}) };
  const requested = policy ? documentReviewRequirement(current, policy).reviewRequested : null;
  const cosignRequired = totalEntries ? true : policy ? !!policy.supervisorUserId && requested : null;
  const supervisorCosigned = policy && complete ? hasCurrentSupervisorCosign(current, policy.supervisorUserId, contentHash) : null;
  return { providerSigned: !!note.provider_signed_at, cosignRequired, supervisorCosigned, signedEntriesPresent: signedEntries.length > 0,
    status: cosignRequired === null || supervisorCosigned === null ? 'unknown' : !cosignRequired ? 'not_required' : supervisorCosigned ? 'current' : note.supervisor_cosigned_at ? 'stale' : 'pending' };
}

export async function buildClinicalReviewPacket(input, deps = {}) {
  if (!privacyApproved(input?.privacyPolicy)) return blocked('PRIVACY_POLICY_NOT_APPROVED');
  try {
    const { sources, policy, sourceRevision } = await snapshot(input, deps);
    const mapping = { agencyId: Number(input.agencyId), clientId: Number(input.clientId), subrole: input.subrole, sources: {} };
    const reference = (kind, sourceId, detail = {}) => { const ref = opaque(); mapping.sources[ref] = { kind, id: Number(sourceId), ...detail }; return ref; };
    const policyIdentifiers = [policy, ...(policy?.rules || [])].flatMap(row => ['payerId', 'payerName', 'planType', 'productId', 'memberId', 'reference'].map(key => row?.[key])).filter(value => value != null && String(value).length >= 2).map(String);
    const privacy = (deps.createPrivacyContext || createSessionPrivacyContext)({ contentType: 'session', identifiers: [...(sources.knownIdentifiers || []), ...policyIdentifiers], clientNames: sources.clientNames || [], providerNames: sources.providerNames || [] });
    let characters = 0;
    const screen = async value => {
      const text = String(value || ''); characters += text.length;
      if (characters > MAX_SOURCE_CHARACTERS) throw invalid('SOURCE_TOO_LARGE');
      const screened = await privacy.redact(stripSourceIdentifiers(text));
      if (typeof screened !== 'string' || (text.trim() && !screened.trim())) throw invalid('PRIVACY_INSPECTION_FAILED');
      return screened;
    };
    const packet = { version: PACKET_VERSION, reviewKind: input.subrole, sourceHandling: 'privacy_screened_not_certified_deidentified', advisoryOnly: true, humanReviewRequired: true, sourceContentIsUntrusted: true, plan: null, notes: [], ratings: [], limitations: [], checklist: { version: 'clinical-documentation-review-v1', items: ['PLAN_GOAL_ALIGNMENT', 'DOCUMENTED_PROGRESS_EVIDENCE', 'CONSISTENT_OUTCOME_MEASURES', 'PLAN_REVIEW_QUESTIONS', 'SIGNATURE_STATUS', 'MISSING_CONTEXT'], advisoryOnly: true } };
    const noteRefs = new Map(), objectiveRefs = new Map();
    if (sources.plan) {
      const plan = sources.plan, sections = splitTreatmentPlanSections(plan);
      packet.plan = { sourceRef: reference('treatment_plan', plan.id), presentingProblem: await screen(sections.presentingProblem), prescribedFrequency: await screen(sections.prescribedFrequency), dischargePlan: await screen(sections.dischargePlan), goals: [] };
      for (const goal of plan.goals || []) {
        if (goal.superseded_at || goal.status === 'superseded') continue;
        const target = { sourceRef: reference('goal', goal.id), text: await screen(goal.goal_text || goal.goalText || ''), objectives: [] };
        for (const objective of goal.objectives || []) {
          if (objective.superseded_at || objective.status === 'superseded') continue;
          const ref = reference('objective', objective.id); objectiveRefs.set(Number(objective.id), ref);
          const interventions = object(objective.interventions_json);
          target.objectives.push({ sourceRef: ref, text: await screen(objective.objective_text || objective.objectiveText || ''), measurement: await screen(objective.measurement_method || ''), baseline: scale(objective.scale_start), current: scale(objective.scale_current), target: scale(objective.scale_target), interventions: await screen(Array.isArray(interventions) ? interventions.filter(value => typeof value === 'string').join('\n') : '') });
        }
        packet.plan.goals.push(target);
      }
    } else packet.limitations.push('NO_ACTIVE_TREATMENT_PLAN');
    const ordered = [...sources.notes].reverse();
    for (const [index, note] of ordered.entries()) {
      const ref = reference('note', note.id, { providerUserId: Number(note.created_by_user_id), encounterAt: note.encounter_at || object(note.metadata_json).dateOfService });
      noteRefs.set(Number(note.id), ref);
      const entries = [];
      const sourceEntries = sources.addenda.filter(entry => Number(entry.clinical_note_id) === Number(note.id));
      const signature = safeSignatureState(note, sourceEntries, sources.documentationPolicies?.[note.id] || null);
      if (signature.status === 'unknown' && !packet.limitations.includes('SIGNATURE_POLICY_UNAVAILABLE')) packet.limitations.push('SIGNATURE_POLICY_UNAVAILABLE');
      for (const entry of sourceEntries) {
        entries.push({ sourceRef: reference('note_entry', entry.id), kind: ['addendum', 'correction', 'late_entry'].includes(entry.entry_kind) ? entry.entry_kind : 'unclassified', body: await screen(maybeDecryptNotePayload(entry.body)), reason: await screen(entry.entry_reason || '') });
      }
      packet.notes.push({ sourceRef: ref, sequence: index + 1, signature, narrative: await screen(plainPayload(note.note_payload)), encounter: { durationMinutes: note.encounter_minutes != null && Number.isFinite(Number(note.encounter_minutes)) && Number(note.encounter_minutes) >= 0 && Number(note.encounter_minutes) <= 1440 ? Number(note.encounter_minutes) : null, placeOfService: validPos(note.encounter_pos), modality: note.is_telehealth === 1 || note.is_telehealth === true ? 'telehealth' : note.is_telehealth === 0 || note.is_telehealth === false ? 'in_person' : 'unknown' }, entries });
    }
    if (!packet.notes.length) packet.limitations.push('NO_SIGNED_PROGRESS_NOTES');
    if (packet.notes.length < 5) packet.limitations.push('FEWER_THAN_FIVE_SIGNED_PROGRESS_NOTES');
    for (const rating of sources.ratings) packet.ratings.push({ objectiveRef: objectiveRefs.get(Number(rating.objective_id)), noteRef: noteRefs.get(Number(rating.clinical_note_id)), value: scale(rating.scale_value), target: scale(rating.scale_target_at_rating), disposition: ['rated', 'deferred', 'on_hold', 'not_addressed'].includes(rating.disposition) ? rating.disposition : 'unknown', raterRole: ['clinician', 'client', 'other'].includes(rating.rater_kind) ? rating.rater_kind : 'unknown' });
    if (input.subrole === 'compliance') {
      const claims = new Map(sources.claims.map(claim => [Number(claim.id), claim]));
      packet.services = [];
      packet.limitations.push('EXISTING_SUBMISSION_REVIEW_REQUIRED'); // Recorded lines are not the effective override-resolved transmission payload.
      for (const line of sources.lines || []) {
        const claim = claims.get(Number(line.clinical_claim_id));
        if (!claim || !noteRefs.has(Number(claim.clinical_note_id))) continue;
        const modifiers = object(line.modifiers_json);
        packet.services.push({ sourceRef: reference('claim_line', line.id, { claimId: Number(claim.id) }), noteRef: noteRefs.get(Number(claim.clinical_note_id)), code: validCode(line.procedure_code), units: line.units != null && line.units !== '' && Number.isFinite(Number(line.units)) && Number(line.units) > 0 && Number(line.units) <= 10000 ? Number(line.units) : null, placeOfService: validPos(claim.place_of_service), modifiers: Array.isArray(modifiers) ? modifiers.filter(value => /^[A-Z0-9]{2}$/.test(String(value))).map(String) : [] });
      }
      const applicable = policy?.approved === true && String(policy.version || '').trim() && String(policy.reference || '').trim() && Array.isArray(policy.rules) ? policy.rules.filter(rule => ruleApplies(rule, sources)) : [];
      packet.policy = { status: applicable.length ? 'OWNER_APPROVED_RULES_SUPPLIED' : 'APPLICABLE_POLICY_UNVERIFIED', rules: [] };
      mapping.policy = policy; // Owner policy reference, dates and payer details stay private.
      for (const rule of applicable) packet.policy.rules.push({ sourceRef: reference('policy_rule', rule.id || 0), instruction: await screen(rule.instruction || rule.text || '') });
      if (!applicable.length) packet.limitations.push('NO_VERIFIED_APPLICABLE_PAYER_POLICY');
      else packet.limitations.push('PAYER_APPLICABILITY_REQUIRES_HUMAN_VERIFICATION');
      if (!packet.services.length) packet.limitations.push('NO_CURRENT_CLAIM_LINES');
    }
    // A final inspection covers assembled labels, policy and numerical context too.
    const assembled = JSON.stringify(packet);
    if (await screen(assembled) !== assembled) throw invalid('PRIVACY_RESIDUAL_DETECTED');
    return { packet, mapping, sourceRevision, status: 'ready', reasonCode: null };
  } catch (error) { return blocked(error?.reasonCode || (error?.code === 'SESSION_PRIVACY_UNAVAILABLE' ? 'PRIVACY_INSPECTION_FAILED' : 'SOURCE_PREPARATION_FAILED')); }
}
