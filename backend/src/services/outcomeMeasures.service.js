import { nluLearningMeasures } from '../data/nluLearningMeasures.js';
import { isNluAgency, assertPilotCatalogAgency, normalizePilotContext } from './nluLearningAccess.service.js';
import pool from '../config/clinicalDatabase.js';
import { getOutcomeMeasure, outcomeMeasures, measureRights } from '../data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from './outcomeMeasureScoring.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';
import { supervisorCanAccessClientInOrg } from '../utils/supervisorSchoolAccess.js';

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
  return { checkedAt: '2026-10-10', availableCount: outcomeMeasures.length, reviewedCount: measureRights.length, measures: outcomeMeasures, rights: measureRights };
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
  const payload = { questionnaire: measure, answers, result, administration: input.administration, clinicalFitConfirmed: true, ...(pilotContext ? { pilotContext } : {}) };
  const [prior] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE client_id = ? AND agency_id = ? AND recorded_by_user_id = ? AND request_id = ?', [client.id, client.agency_id, user.id, input.requestId]);
  if (prior.length) {
    const saved = decode(prior[0]);
    if (saved.measureId !== measure.id || saved.version !== measure.version || saved.administration !== input.administration || JSON.stringify(saved.answers) !== JSON.stringify(answers) || JSON.stringify(saved.pilotContext || null) !== JSON.stringify(pilotContext)) fail(409, 'This submission was already saved with different responses. Start a new administration.');
    return saved;
  }
  const encrypted = maybeEncryptNotePayload(JSON.stringify(payload)); // Fail closed if encryption is unavailable.
  let id;
  try {
    const [saved] = await pool.execute(`INSERT INTO client_outcome_measure_responses
      (client_id, agency_id, measure_id, measure_version, request_id, recorded_by_user_id, payload_encrypted)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [client.id, client.agency_id, measure.id, measure.version, input.requestId, user.id, encrypted]);
    id = saved.insertId;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY' || retry) throw error;
    return saveOutcomeResponse(user, clientId, input, true);
  }
  const [[row]] = await pool.execute('SELECT * FROM client_outcome_measure_responses WHERE id = ? AND client_id = ? AND agency_id = ?', [id, client.id, client.agency_id]);
  return decode(row);
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
