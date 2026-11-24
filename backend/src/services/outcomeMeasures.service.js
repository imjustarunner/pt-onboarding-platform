import { createHash } from 'node:crypto';
import { nluLearningMeasures } from '../data/nluLearningMeasures.js';
import { isNluAgency, assertPilotCatalogAgency, normalizePilotContext } from './nluLearningAccess.service.js';
import pool from '../config/clinicalDatabase.js';
import { getOutcomeMeasure, outcomeMeasures, measureRights } from '../data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from './outcomeMeasureScoring.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';
import { supervisorCanAccessClientInOrg } from '../utils/supervisorSchoolAccess.js';
import { liveOutcomeContext, liveOutcomeRespondent } from './liveOutcomeContext.service.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const clinicalMeasureRoles = ['admin', 'super_admin', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor'];
export function assertMeasureRole(user) {
  if (!Number(user?.id)) fail(401, 'Authentication required.');
  if (!clinicalMeasureRoles.includes(String(user.role).toLowerCase())) fail(403, 'Clinical record access is required.');
}
export async function assertOutcomeClientAccess(user, clientId, { write = false } = {}) {
  assertMeasureRole(user);
  if (!Number.isSafeInteger(Number(clientId)) || Number(clientId) <= 0) fail(400, 'Invalid client.');
  const access = await resolveClientRecordAccess({ userId: user.id, role: user.role, clientId: Number(clientId) });
  if (!access.ok) fail(access.status || 403, 'Access denied to this client.');
  const role = String(user.role).toLowerCase();
  if (!['admin', 'super_admin'].includes(role) && !access.isAssignedClinician) {
    const supervised = role === 'supervisor' && await supervisorCanAccessClientInOrg({ supervisorUserId: user.id, clientId: Number(clientId), orgId: access.client.organization_id || access.client.agency_id });
    if (!supervised) fail(403, 'Assigned clinician or supervisor access is required.');
  }
  if (write) await requireStaffCareEligibility(user.id, access.client.agency_id);
  return access.client;
}
export function outcomeCatalog() {
  return { checkedAt: measureRights.map(entry => entry.checkedAt).sort().at(-1), availableCount: outcomeMeasures.length, reviewedCount: measureRights.length, measures: outcomeMeasures, rights: measureRights };
}
export async function outcomeCatalogFor(user, { clientId, agencyId } = {}) {
  let id;
  if (clientId != null) id = (await assertOutcomeClientAccess(user, clientId)).agency_id;
  else if (agencyId != null) { await assertPilotCatalogAgency(user, agencyId); id = agencyId; }
  const catalog = outcomeCatalog();
  if (id && await isNluAgency(id)) {
    catalog.measures = [...catalog.measures, ...nluLearningMeasures];
    catalog.availableCount = catalog.measures.length;
    catalog.pilotCount = nluLearningMeasures.length;
  }
  return catalog;
}
function decode(row) {
  const data = JSON.parse(maybeDecryptNotePayload(row.payload_encrypted));
  return { id: row.id, clientId: row.client_id, measureId: row.measure_id, version: row.measure_version,
    recordedAt: row.recorded_at, recordedBy: row.recorded_by_user_id, ...data,
    reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by_user_id,
    review: row.review_encrypted ? JSON.parse(maybeDecryptNotePayload(row.review_encrypted)) : null };
}
export async function listOutcomeResponses(user, clientId) {
  const client = await assertOutcomeClientAccess(user, clientId);
  const [rows] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE client_id = ? AND agency_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 500', [client.id, client.agency_id]);
  return rows.map(decode);
}
export async function liveOutcomeWorkspace(user, clientId, appointmentId) {
  const client = await assertOutcomeClientAccess(user, clientId);
  const context = await liveOutcomeContext(client, appointmentId, user);
  const [rows] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE client_id = ? AND agency_id = ? AND appointment_id = ? ORDER BY recorded_at DESC, id DESC', [client.id, client.agency_id, context.appointment.id]);
  const recent = await listOutcomeResponses(user, clientId);
  const responses = [...new Map([...recent, ...rows.map(decode)].map(row => [row.id, row])).values()]
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt) || b.id - a.id);
  return { ...context, responses, historyLimited: recent.length === 500 };
}
export async function saveOutcomeResponse(user, clientId, input, retry = false) {
  const client = await assertOutcomeClientAccess(user, clientId, { write: true });
  const measure = getOutcomeMeasure(input?.measureId);
  if (!measure) fail(400, 'This measure is not enabled in the catalog.');
  if (measure.kind === 'original_pilot' && !(await isNluAgency(client.agency_id))) fail(403, 'This pilot is available only for NLU clients.');
  const pilotContext = measure.kind === 'original_pilot' ? normalizePilotContext(measure, input.pilotContext, user) : null;
  if (input?.version !== measure.version) fail(409, 'The measure changed. Reopen the current form before recording responses.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input?.requestId || '')) fail(400, 'A valid submission identifier is required.');
  if (input?.clinicalFitConfirmed !== true) fail(400, 'Confirm the measure, respondent, age, consent and clinical fit before recording.');
  const allowedAdministration = measure.respondent === 'caregiver' ? ['caregiver', 'caregiver_assisted'] : measure.respondent === 'observer' ? ['observer'] : ['self', 'clinician_assisted'];
  if (!allowedAdministration.includes(input?.administration)) fail(400, 'Select the administration method.');
  const { answers, result } = scoreOutcomeMeasure(measure, input.answers);
  if (!Object.values(answers).some(value => Array.isArray(value) ? value.length > 0 : String(value).trim().length > 0)) fail(400, 'Record at least one response.');
  const context = input.appointmentId != null ? await liveOutcomeContext(client, input.appointmentId, user) : null;
  const respondent = context ? liveOutcomeRespondent(measure, input.respondent, context, client) : null;
  if (context && !result.complete) fail(400, 'Complete every required question before marking this live assessment complete.');
  if (respondent && measure.items.some(item => item.key === 'informant')) answers.informant = respondent.label;
  const payload = { questionnaire: measure, answers, result, administration: input.administration, clinicalFitConfirmed: true,
    ...(context ? { appointment: context.appointment, respondent, source: 'live_session' } : {}), ...(pilotContext ? { pilotContext } : {}) };
  const [prior] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE client_id = ? AND agency_id = ? AND recorded_by_user_id = ? AND request_id = ?', [client.id, client.agency_id, user.id, input.requestId]);
  if (prior.length) {
    const saved = decode(prior[0]);
    if (saved.measureId !== measure.id || saved.version !== measure.version || saved.administration !== input.administration || JSON.stringify(saved.answers) !== JSON.stringify(answers) || JSON.stringify(saved.pilotContext || null) !== JSON.stringify(pilotContext) || Number(saved.appointment?.id || 0) !== Number(context?.appointment.id || 0) || JSON.stringify(saved.respondent || null) !== JSON.stringify(respondent)) fail(409, 'This submission was already saved with different responses. Start a new administration.');
    return saved;
  }
  const encrypted = maybeEncryptNotePayload(JSON.stringify(payload)); // Fail closed if encryption is unavailable.
  let id;
  try {
    const columns = context ? ', appointment_id' : '';
    const placeholder = context ? ', ?' : '';
    const [saved] = await pool.execute(`INSERT INTO client_outcome_measure_responses
      (client_id, agency_id, measure_id, measure_version, request_id, recorded_by_user_id, payload_encrypted${columns})
      VALUES (?, ?, ?, ?, ?, ?, ?${placeholder})`, [client.id, client.agency_id, measure.id, measure.version, input.requestId, user.id, encrypted, ...(context ? [context.appointment.id] : [])]);
    id = saved.insertId;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY' || retry) throw error;
    return saveOutcomeResponse(user, clientId, input, true);
  }
  const [[row]] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE id = ? AND client_id = ? AND agency_id = ?', [id, client.id, client.agency_id]);
  return decode(row);
}
// Called only after the authenticated portal assignment has been authorized.
export async function saveAssignedOutcomeResponse({ clientId, agencyId, userId, itemId, measure, version, answers: submittedAnswers }) {
  if (version !== measure.version) fail(409, 'The questionnaire changed. Reopen it to see the current form.');
  const { answers, result } = scoreOutcomeMeasure(measure, submittedAnswers);
  if (!result.complete) fail(400, 'Answer all items before submitting the questionnaire.');
  const requestId = createHash('sha256').update('client-update-assessment:' + itemId).digest('hex').slice(0, 32)
    .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
  const payload = { questionnaire: measure, answers, result, administration: measure.respondent || 'self', source: 'family_portal', respondentUserId: userId,
    respondent: measure.respondent === 'caregiver' ? { type:'guardian', userId:Number(userId), label:answers.informant || 'Parent / guardian' } : { type:'client', clientId:Number(clientId), label:'Client' } };
  const encrypted = maybeEncryptNotePayload(JSON.stringify(payload));
  // The assignment and clinical record are in separate stores. A retry after
  // saving the clinical response can complete the checklist without another response.
  await pool.execute(`INSERT INTO client_outcome_measure_responses
    (client_id, agency_id, measure_id, measure_version, request_id, recorded_by_user_id, payload_encrypted)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
  [clientId, agencyId, measure.id, measure.version, requestId, userId, encrypted]);
}

// The signed form version and its scored outcome are committed together.
export async function saveSharedOutcomeResponse({db,clientId,agencyId,actorId,signerId,measure,answers:submitted,respondentName}) {
  const {answers,result}=scoreOutcomeMeasure(measure,submitted);
  if(!result.complete)fail(400,'Answer all required questions before submitting.');
  const requestId=createHash('sha256').update('clinical-document-signer:'+signerId).digest('hex').slice(0,32)
    .replace(/^(........)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
  const type=measure.respondent==='caregiver'?'guardian':'client';
  const payload={questionnaire:measure,answers,result,source:'clinical_document_request',administration:measure.respondent||'self',
    respondent:{type,label:respondentName,clientId:Number(clientId)},respondentUserId:actorId};
  await db.execute(`INSERT INTO client_outcome_measure_responses
    (client_id,agency_id,measure_id,measure_version,request_id,recorded_by_user_id,payload_encrypted) VALUES(?,?,?,?,?,?,?)`,
  [clientId,agencyId,measure.id,measure.version,requestId,actorId,maybeEncryptNotePayload(JSON.stringify(payload))]);
}

export async function reviewOutcomeResponse(user, clientId, responseId, input) {
  const client = await assertOutcomeClientAccess(user, clientId, { write: true });
  if (!Number.isSafeInteger(Number(responseId)) || Number(responseId) <= 0) fail(400, 'Invalid response.');
  const [[row]] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE id = ? AND client_id = ? AND agency_id = ?', [Number(responseId), client.id, client.agency_id]);
  if (!row) fail(404, 'Response not found.');
  if (row.reviewed_at) fail(409, 'This review is already recorded.');
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > 4000) fail(400, 'Record a review note of 1–4,000 characters.');
  const response = decode(row);
  if (response.result.flags.some(f => f.urgent) && input?.safetyFollowUpConfirmed !== true) fail(400, 'Document and confirm direct safety follow-up before marking this response reviewed.');
  const encrypted = maybeEncryptNotePayload(JSON.stringify({ note, safetyFollowUpConfirmed: input?.safetyFollowUpConfirmed === true }));
  const [updated] = await pool.execute(`UPDATE client_outcome_measure_responses SET reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_encrypted = ? WHERE id = ? AND client_id = ? AND agency_id = ? AND reviewed_at IS NULL`, [user.id, encrypted, row.id, client.id, client.agency_id]);
  if (!updated.affectedRows) fail(409, 'Another clinician has already recorded a review.');
  return { reviewed: true };
}
