import crypto from 'node:crypto';
import { screeningResponseBags, screeningSourceFields, screeningSourceKind } from './h0002SourceEvidence.js';
import { buildPsc17Fields } from '../data/validatedClinicalScreens.en.js';
import { applyScreeningTranscription, screeningPresentingProblem, screeningLocation, validateScreeningDraft } from './h0002ReviewDetails.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import Client from '../models/Client.model.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { isClinicalSafetyPositive, mergeShowIfValues } from '../utils/intakeShowIf.js';
import { providerBillingNpi } from './providerBillingNpi.service.js';
import { validNpi } from './supervisedBillingPolicy.service.js';
import { resolveServiceSupervisor } from './serviceBillingSupervisor.service.js';
import { parsePscScore, scorePsc17, suggestScreeningOutcome, validateScreeningReview, SCREENING_OUTCOMES } from './h0002ScreeningRules.js';

export const H0002_SOURCE = 'h0002_digital_screening';
const json = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const fail = (status, message) => Object.assign(new Error(message), { status });
export const screeningDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

export async function loadScreeningSource(taskId) {
  const [[task]] = await pool.execute('SELECT * FROM tasks WHERE id=?', [taskId]);
  if (!task || task.source_ref_type !== 'school_intake_review') throw fail(404, 'Screening task not found');
  const meta = json(task.metadata);
  if (task.source_ref_id !== `${Number(meta.submissionId)}:${Number(meta.clientId)}`) throw fail(409, 'Screening source does not match its client');
  const submission = await IntakeSubmission.findById(meta.submissionId);
  if (!submission || submission.status !== 'submitted' || !submission.submitted_at) throw fail(409, 'A submitted screening is required');
  const [links] = await pool.execute('SELECT client_id FROM intake_submission_clients WHERE intake_submission_id=? ORDER BY id', [submission.id]);
  let clientIndex = links.findIndex(row => Number(row.client_id) === Number(meta.clientId));
  if (clientIndex < 0 && Number(submission.client_id) === Number(meta.clientId)) clientIndex = 0;
  if (clientIndex < 0) throw fail(409, 'The submission is not linked to this client');
  const client = await Client.findById(meta.clientId, { includeSensitive: true });
  if (!client || Number(client.agency_id) !== Number(task.assigned_to_agency_id) || Number(client.is_demo)) throw fail(409, 'Screening client scope is invalid');
  const link = await IntakeLink.findById(submission.intake_link_id);
  const intakeData = json(submission.intake_data);
  const responses = intakeData.responses || intakeData;
  const bags = screeningResponseBags(intakeData, clientIndex);
  const fields = screeningSourceFields(link);
  const sourceKind = screeningSourceKind(link, intakeData, clientIndex);
  const byKey = new Map(fields.map(field => [field.key, field]));
  const items = Array.from({ length: 17 }, (_, index) => {
    const key = `psc_${index + 1}`;
    const bag = bags.find(bag => bag[key] != null && String(bag[key]).trim());
    return { key, score: parsePscScore(bag?.[key], byKey.get(key)) };
  });
  const psc = scorePsc17(items, byKey);
  const supplementalKeys = /harm|suicid|aggress|health|medical|medication|counsel|psychiatr|therap|reason|concern|goal|gain|helpful|abuse|neglect|trauma|allerg/i;
  const supplemental = bags.flatMap(bag => Object.entries(bag).filter(([key, value]) => supplementalKeys.test(key) && value != null && String(value).trim()));
  const isNegative = value => typeof value === 'string' && /^(no|none|none reported|no concerns|ninguno|ninguna|no aplica|not applicable|n\/a)$/i.test(value.trim());
  const reportedConcerns = supplemental.some(([, value]) => !isNegative(value));
  // Absence of history answers is not evidence of a clean history.
  const noConcernsReported = ['harm|suicid', 'health|medical', 'counsel|psychiatr|therap', 'reason|concern|goal|gain|helpful'].every(pattern => supplemental.some(([key, value]) => new RegExp(pattern, 'i').test(key) && isNegative(value))) && !reportedConcerns;
  const safetyFlag = bags.some(bag => {
    if (isClinicalSafetyPositive(mergeShowIfValues(bag))) return true;
    const alert = bag.clinicalSafetyAlert;
    return alert === true || (alert && typeof alert === 'object' && Object.values(alert).some(value => value === true))
      || Object.entries(bag).some(([key, value]) => /harm|suicid|abuse|neglect/i.test(key) && /^(yes|true|1)$/i.test(String(value)));
  });
  const { buildClinicalSummaryText } = await import('../controllers/publicIntake.controller.js');
  const summary = buildClinicalSummaryText({ link: { ...link, intake_fields: fields, intake_steps: [{ fields }] }, intakeData, clientIndex });
  const submittedAt = new Date(submission.submitted_at).toISOString();
  const sourceHash = hash(JSON.stringify({ submissionId: submission.id, clientIndex, intakeData, fields }));
  const suggestedOutcome = suggestScreeningOutcome(psc, { noConcernsReported });
  const clientType = String(link.scope_type || '').toLowerCase() === 'school' ? 'school' : 'office';
  const packetMethod = /paper|upload|scan/i.test(String(responses.submission?.submissionMethod || intakeData.submissionMethod || submission.source || '')) ? 'paper' : 'digital';
  return { task, taskMeta: meta, ...sourceKind, client, psc, summary, submittedAt, sourceHash, suggestedOutcome, reportedConcerns, safetyFlag,
    identifiers: [client.initials, client.identifier_code, client.organization_name, client.full_name, client.first_name, client.last_name, client.email, client.phone_number, client.date_of_birth, client.address, meta.h0002Code, meta.schoolName, ...bags.flatMap(bag => Object.entries(bag).filter(([key]) => /name|address|phone|email|birth|medicaid|insurance.*id/i.test(key)).map(([,value]) => typeof value === 'string' ? value : ''))].filter(Boolean),
    submissionId: submission.id, clientType, schoolName: clientType === 'school' ? meta.schoolName || client.organization_name || 'School not recorded' : null,
    sourceLanguage: /^es/i.test(link.language_code || intakeData.locale || '') ? 'es' : 'en', packetMethod,
    pscItems: items.map(item => ({ ...item, label: byKey.get(item.key)?.label || buildPsc17Fields().find(f => f.key === item.key)?.label || item.key })),
    clinicalFields: fields.filter(field => supplementalKeys.test(field.key) && !/^psc_/.test(field.key)).map(field => ({ key: field.key, label: field.label || field.key, value: bags.find(bag => bag[field.key] != null)?.[field.key] ?? '', options: field.options || [] })),
    safetyConcerns: supplemental.filter(([key, value]) => /harm|suicid|abuse|neglect|trauma/i.test(key) && !isNegative(value) && value !== false && !/^(not_sure|unsure|unknown)$/i.test(String(value))).map(([key,value]) => `${byKey.get(key)?.label || key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
  };
}

export function proposedScreeningReview(source) {
  if (source.roiOnly) return { assessment: '', followUp: '', presentingProblem: '' };
  const result = source.psc.complete ? `The completed PSC-17 total is ${source.psc.total}/34 (overall cutoff 15).` : `The PSC-17 has ${source.psc.answered}/17 valid answers and needs completion before a determination.`;
  const assessment = source.suggestedOutcome === 'meets'
    ? `${result} The screening indicates a probability of behavioral health concerns and supports admission for further clinical assessment and treatment planning. The screening does not establish a disorder diagnosis.`
    : source.suggestedOutcome === 'does_not_meet'
      ? `${result} All screening responses are zero, and no concerns are reported in the available supplemental history. These screening findings do not identify a reason for admission at this time.`
      : `${result} The screening and available history require further evaluation before a final admission decision. A score below the overall cutoff does not rule out treatment needs.`;
  const followUp = (source.suggestedOutcome === 'does_not_meet'
    ? 'Provide information about returning for screening if concerns arise or circumstances change.'
    : 'Discuss available treatment options and arrange further clinical assessment to clarify needs and appropriate services.')
    + (source.safetyFlag ? ' Review the reported safety concern and document the safety assessment and actions taken before signing.' : '');
  const concerns = (source.clinicalFields || []).filter(field => /reason|concern|goal|helpful/i.test(field.key) && field.value).map(field => `${field.label}: ${typeof field.value === 'object' ? JSON.stringify(field.value) : field.value}`);
  return { assessment, followUp, presentingProblem: [...concerns, result].join('\n') };
}

function draftText(source) {
  const proposed = proposedScreeningReview(source);
  return ['H0002 — Behavioral health screening to determine eligibility for admission to a treatment program',
    'DRAFT — clinician review and determination pending',
    `Digital questionnaire submitted: ${source.submittedAt}. This is the source submission timestamp, not the date of professional review.`,
    'Modality: asynchronous digital questionnaire and supplemental intake information; no live attendance or therapy duration asserted.',
    '', source.summary, '', `Proposed admission determination: ${SCREENING_OUTCOMES[source.suggestedOutcome]}.`,
    'This proposal requires the reviewing clinician’s assessment and confirmation. It does not admit, reject, or authorize treatment.',
    `Proposed clinical assessment (review and edit): ${proposed.assessment}`, `Proposed treatment options and follow-up (review and edit): ${proposed.followUp}`,
    'Billing diagnosis: Deferred — R69 (illness, unspecified). No disorder diagnosis is established by the screening.',
    'Service date, review setting, professional signature and billing supervisor cosign: Pending.'].join('\n');
}

/** Idempotent, resumable preparation. The main DB named lock also covers a retry
 * after clinical records commit but the queue/task link fails. Never sign here. */
export async function prepareH0002ScreeningTask(taskId, { actorUserId = 501 } = {}) {
  const lock = await pool.getConnection();
  const lockName = `h0002:task:${Number(taskId)}`;
  let acquired = false;
  try {
    const [[got]] = await lock.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    acquired = Number(got.acquired) === 1;
    if (!acquired) throw fail(409, 'Screening preparation is already running');
    const source = await loadScreeningSource(taskId);
    if (source.roiOnly) return { prepared: false, reason: 'roi_only' };
    const agencyId = Number(source.task.assigned_to_agency_id), providerId = Number(source.task.assigned_to_user_id);
    const [[agency]] = await pool.execute('SELECT feature_flags FROM agencies WHERE id=?', [agencyId]);
    const config = json(agency?.feature_flags).h0002ScreeningWorkflow;
    if (!config?.enabled || providerId !== Number(config.providerUserId) || source.taskMeta.insuranceCategory !== 'medicaid') return { prepared: false, reason: 'outside_workflow' };
    if (screeningDate(new Date(source.submittedAt)) < config.submittedFrom || !['pending', 'in_progress'].includes(source.task.status)) return { prepared: false, reason: 'outside_cutoff_or_completed' };
    const [[member]] = await pool.execute('SELECT user_id FROM user_agencies WHERE agency_id=? AND user_id=? AND is_active=1', [agencyId, providerId]);
    if (!member) throw fail(409, 'The screening provider is not active in this agency');
    const supervisor = await resolveServiceSupervisor({ agencyId, providerUserId: providerId, serviceCode: 'H0002', dateOfService: screeningDate() });
    if (!supervisor) throw fail(409, 'Configure the H0002 billing supervisor before preparing screenings');
    const db = await clinicalPool.getConnection();
    let sessionId, noteId;
    try {
      await db.beginTransaction();
      const [[existing]] = await db.execute(`SELECT id FROM clinical_sessions WHERE agency_id=? AND client_id=? AND service_code='H0002'
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.screeningTaskId'))=? FOR UPDATE`, [agencyId, source.client.id, String(taskId)]);
      sessionId = existing?.id;
      if (!sessionId) {
        const [insert] = await db.execute(`INSERT INTO clinical_sessions (agency_id,client_id,provider_user_id,rendering_provider_user_id,service_code,encounter_status,source_timezone,metadata_json,created_by_user_id)
          VALUES (?,?,?,?,'H0002','scheduled','America/Denver',?,?)`, [agencyId,source.client.id,providerId,providerId,
          JSON.stringify({ source: H0002_SOURCE, screeningTaskId: Number(taskId), submissionId: source.taskMeta.submissionId, submittedAt: source.submittedAt, missingCalendarAttachment: true, plannedClaim: true, reviewPending: true }),actorUserId]);
        sessionId = insert.insertId;
      }
      const [[existingNote]] = await db.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND is_deleted=0 ORDER BY id LIMIT 1', [sessionId, agencyId]);
      noteId = existingNote?.id;
      if (!noteId) {
        const [insert] = await db.execute(`INSERT INTO clinical_notes (clinical_session_id,agency_id,client_id,title,note_type,note_payload,metadata_json,created_by_user_id,is_billable)
          VALUES (?,?,?,'H0002 digital screening — awaiting review','SCREENING',?,?,?,0)`, [sessionId,agencyId,source.client.id,maybeEncryptNotePayload(draftText(source)),JSON.stringify({ source: H0002_SOURCE, screeningTaskId: Number(taskId), serviceCode: 'H0002', preparedByUserId: actorUserId, sourceHash: source.sourceHash, billingPrimaryUnits: 1 }),providerId]);
        noteId = insert.insertId;
      }
      await db.commit();
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
    const clientKey = `h0002_task_${taskId}`;
    if (!(await NoteAidWorkQueueItem.findByClientKeyForUser({ clientKey, userId: providerId }))) {
      await NoteAidWorkQueueItem.appendForUser(providerId, [{ clientKey, agencyId, clientId: source.client.id, clientName: source.client.full_name || source.client.initials,
        clinicalSessionId: sessionId, clinicalNoteId: noteId, taskId: Number(taskId), serviceCode: 'H0002', noteKind: 'h0002_screening', status: 'not_started',
        action: 'Review digital screening, confirm admission determination and sign. R69 deferred; billing supervisor cosign required.' }]);
    }
    await pool.execute(`UPDATE tasks SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.clinicalSessionId',?,'$.clinicalNoteId',?,'$.screeningWorkflow',true) WHERE id=?`, [sessionId,noteId,taskId]);
    return { prepared: true, taskId: Number(taskId), clientId: source.client.id, clientCode: source.taskMeta.h0002Code, sessionId, noteId, answered: source.psc.answered, suggestedOutcome: source.suggestedOutcome };
  } finally {
    if (acquired) await lock.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    lock.release();
  }
}

export async function screeningReviewContext({ sessionId, user }) {
  const [[session]] = await clinicalPool.execute('SELECT * FROM clinical_sessions WHERE id=?', [sessionId]);
  const metadata = json(session?.metadata_json);
  if (!session || metadata.source !== H0002_SOURCE) throw fail(404, 'Digital screening session not found');
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: user, agencyId: session.agency_id });
  if (Number(user.id) !== Number(session.provider_user_id)) throw fail(403, 'Only the assigned screening clinician can review this screening');
  if (['cancelled', 'canceled', 'no_show', 'voided'].includes(session.encounter_status)) throw fail(409, 'This screening encounter is canceled');
  const [[note]] = await clinicalPool.execute('SELECT * FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND client_id=? AND is_deleted=0 ORDER BY id LIMIT 1', [session.id,session.agency_id,session.client_id]);
  if (!note || Number(note.created_by_user_id) !== Number(user.id)) throw fail(409, 'The screening note author does not match the reviewer');
  const source = await loadScreeningSource(metadata.screeningTaskId);
  if (Number(source.client.id) !== Number(session.client_id) || Number(source.task.assigned_to_agency_id) !== Number(session.agency_id) || Number(source.task.assigned_to_user_id) !== Number(user.id)) throw fail(409, 'Screening assignment has changed');
  return { session, note, source };
}

export async function writeScreeningDetermination({ sessionId, user, input }) {
  const context = await screeningReviewContext({ sessionId, user });
  const { session, note, source } = context;
  if (note.provider_signed_at) return note;
  if (input.sourceHash !== source.sourceHash) throw fail(409, 'The intake responses changed. Reopen and review the current screening.');
  validateScreeningDraft(input, source);
  if (input.paperTranscription) {
    const [[document]] = await pool.execute('SELECT id FROM client_phi_documents WHERE id=? AND client_id=? AND agency_id=? AND removed_at IS NULL AND (expires_at IS NULL OR expires_at>NOW())', [Number(input.paperDocumentId) || 0, session.client_id, session.agency_id]);
    if (!document || input.paperSourceConfirmed !== true) throw fail(400, 'Select the source paper document and confirm the transcribed answers match it.');
  }
  const reviewedSource = applyScreeningTranscription(source, input);
  const location = screeningLocation(source, input);
  const review = validateScreeningReview({ ...input, setting: location.label }, reviewedSource);
  if (!input.locationConfirmed) throw fail(400, 'Confirm the client service location before signing.');
  if (!String(input.presentingProblem || '').trim()) throw fail(400, 'Review the presenting problem before signing.');
  if (reviewedSource.safetyFlag && !String(input.safetyConcern || '').trim()) throw fail(400, 'Describe the reported safety concern in the presenting problem.');
  const presentingProblem = screeningPresentingProblem(input);
  const now = new Date(), dateOfService = screeningDate(now);
  const [[provider]] = await pool.execute('SELECT first_name,last_name,credential FROM users WHERE id=?', [user.id]);
  const npi = await providerBillingNpi({ agencyId: session.agency_id, userId: user.id });
  if (!provider?.credential || !validNpi(npi)) throw fail(409, 'The reviewing clinician’s credential and NPI are required before signing.');
  const name = [provider.first_name, provider.last_name, provider.credential].filter(Boolean).join(' ');
  const payload = ['H0002 — Behavioral health screening to determine eligibility for admission to a treatment program',
    `Date of service / professional determination: ${dateOfService} (America/Denver)`,
    `Digital questionnaire submitted: ${source.submittedAt} (source timestamp)`,
    `Packet: ${input.paperTranscription ? 'paper transcription' : source.packetMethod}; client type: ${source.clientType}${source.schoolName ? `; school: ${source.schoolName}` : ''}.`, `Client service location: ${review.setting} (POS ${location.code}).`, '',
    reviewedSource.summary, '', 'Presenting problem', presentingProblem, '', 'Clinical assessment and evaluation', review.assessment, '', 'Admission determination', SCREENING_OUTCOMES[review.outcome],
    '', 'Treatment needs, available options and follow-up', review.followUp,
    '', 'Billing diagnosis: Deferred — R69 (illness, unspecified). No disorder diagnosis is established by this screening.',
    `Reviewing clinician: ${name}; NPI ${npi}. Signature and billing supervisor cosign are recorded separately.`].join('\n');
  const meta = { ...json(note.metadata_json), dateOfService, serviceCode: 'H0002', billingPrimaryUnits: 1,
    screeningPresentingProblemEnc: maybeEncryptNotePayload(presentingProblem),
    screeningPaperSource: input.paperTranscription ? { documentId: Number(input.paperDocumentId), transcribedByUserId: Number(user.id), at: now.toISOString() } : null,
    screeningReview: { outcome: review.outcome, reviewedByUserId: Number(user.id), reviewedAt: now.toISOString(), sourceHash: source.sourceHash, diagnosisCode: 'R69', reviewConfirmed: true, safetyReviewed: review.safetyReviewed, noConcernsConfirmed: review.noConcernsConfirmed, contentHash: hash(payload) } };
  const [updated] = await clinicalPool.execute(`UPDATE clinical_notes SET note_payload=?, metadata_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND provider_signed_at IS NULL AND is_deleted=0`, [maybeEncryptNotePayload(payload),JSON.stringify(meta),note.id]);
  if (!updated.affectedRows) throw fail(409, 'This note changed while it was being reviewed');
  await clinicalPool.execute("UPDATE clinical_sessions SET place_of_service=?, is_telehealth=?, metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.locationLabel',?) WHERE id=? AND agency_id=?", [location.code, ['10','02'].includes(location.code) ? 1 : 0, location.label, session.id, session.agency_id]);
  return { ...note, metadata_json: meta, note_payload: maybeEncryptNotePayload(payload) };
}

export function validateScreeningSignature(note, now = new Date()) {
  const meta = json(note.metadata_json);
  if (meta.source !== H0002_SOURCE) return;
  const review = meta.screeningReview;
  if (!review?.reviewConfirmed || Number(review.reviewedByUserId) !== Number(note.created_by_user_id)
      || !SCREENING_OUTCOMES[review.outcome] || review.diagnosisCode !== 'R69'
      || meta.dateOfService !== screeningDate(now) || review.contentHash !== hash(maybeDecryptNotePayload(note.note_payload))) {
    throw fail(409, 'Open the digital screening review and confirm today’s determination before signing.');
  }
}

export async function completeH0002Screening(note, signedAt) {
  const meta = json(note.metadata_json);
  if (meta.source !== H0002_SOURCE) return;
  await clinicalPool.execute(`UPDATE clinical_sessions SET encounter_status='completed',
    metadata_json=JSON_SET(metadata_json,'$.reviewPending',false,'$.serviceDate',?,'$.reviewedAt',?)
    WHERE id=? AND agency_id=? AND client_id=? AND encounter_status IN ('scheduled','completed')`,
  [meta.dateOfService,signedAt,note.clinical_session_id,note.agency_id,note.client_id]);
  await pool.execute(`UPDATE tasks SET status='completed', completed_at=COALESCE(completed_at,NOW()) WHERE id=? AND assigned_to_user_id=? AND assigned_to_agency_id=?`, [meta.screeningTaskId,note.created_by_user_id,note.agency_id]);
  await pool.execute(`UPDATE note_aid_work_queue_items SET status='signed', signed_at=COALESCE(signed_at,NOW()), date_of_service=?, clinical_note_id=?
    WHERE user_id=? AND client_key=?`, [meta.dateOfService,note.id,note.created_by_user_id,`h0002_task_${meta.screeningTaskId}`]);
}
