import { isProgressNoteToolId } from '../config/clinicalNotePlanOutput.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { resolveClinicalDraftSessionContext } from './clinicalDraftSessionContext.service.js';

const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const missingSession = () => Object.assign(new Error('Open the actual session from the client’s to-do list in My Work before starting this progress note.'), {
  status: 409, code: 'NOTE_SESSION_CONTEXT_REQUIRED'
});
const PROGRESS_SERVICE_CODES = new Set(['90832', '90834', '90837', '90839', '90846', '90847', 'H0004', 'H2011', 'H2014', 'H2015', 'H2016']);

export function fullProgressNoteRequiresSession({ toolId, serviceCode, noteKind } = {}) {
  const tool = String(toolId || '').trim();
  const kind = String(noteKind || '').trim().toLowerCase();
  if (isProgressNoteToolId(tool) || tool === 'clinical_pcp_note' || /progress|soap|cs.?note/.test(kind)) return true;
  if (tool) {
    // Intake, treatment-plan, diagnosis, contact and summary tools keep their
    // existing sessionless workflows even when their aid carries a service code.
    if (getNoteAidToolById(tool)) return false;
  }
  if (/treatment[_\s-]*plan|intake|diagnos|termination|summary|contact|misc|screening|assessment/.test(kind)) return false;
  return PROGRESS_SERVICE_CODES.has(String(serviceCode || '').trim().toUpperCase());
}

export function assertActualProgressSessionSnapshot(session, { providerUserId = null } = {}) {
  if (!session || !(positive(session.appointment_id) || positive(session.office_event_id) || positive(session.billing_encounter_id))
    || session.is_deleted === true || Number(session.is_deleted) === 1
    || ['cancelled', 'canceled', 'voided', 'no_show'].includes(String(session.encounter_status || '').toLowerCase())) throw missingSession();
  if (positive(providerUserId) && Number(session.provider_user_id) !== Number(providerUserId)) {
    throw Object.assign(new Error('Open a session assigned to you before authoring its progress note.'), { status: 403, code: 'NOTE_SESSION_CONTEXT_REQUIRED' });
  }
  return session;
}

// Unlike the legacy context resolver, this entry point never guesses a session
// from a client, date or code and never accepts a note-only synthetic encounter.
export async function requireActualProgressSession(input, { resolveSession = resolveClinicalDraftSessionContext } = {}) {
  if (!positive(input?.clinicalSessionId) && !positive(input?.officeEventId)) throw missingSession();
  const session = await resolveSession(input);
  return assertActualProgressSessionSnapshot(session, { providerUserId: input.providerUserId });
}
