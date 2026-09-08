/**
 * Bridge Tasks hub Notes → Note Aid work queue.
 */

import {
  MSE_DOMAINS,
  emptyRiskAssessment
} from './noteAidMseCatalog.js';

export { MSE_DOMAINS } from './noteAidMseCatalog.js';

export const NOTE_AID_QUEUE_STORAGE_KEY = 'noteAidWorkQueueImport';

/** In-memory handoff only — never put PHI in sessionStorage. */
let memoryWorkQueueStash = null;

export function isSessionNoteTask(task) {
  const type = String(task?.task_type || task?.taskType || '').toLowerCase();
  if (type === 'session_note') return true;
  const meta = parseTaskMetadata(task);
  return !!(meta?.officeEventId || meta?.noteKind === 'progress');
}

export function parseTaskMetadata(task) {
  let meta = task?.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  return meta && typeof meta === 'object' ? meta : {};
}

export function taskToWorkQueueItem(task) {
  const meta = parseTaskMetadata(task);
  const clientName =
    meta.clientName
    || String(task?.title || '').replace(/^Notes:\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
    || 'Client';
  return {
    id: `task_${task.id}`,
    taskId: Number(task.id),
    date: meta.scheduledStart
      ? String(meta.scheduledStart).slice(0, 10)
      : (task.due_date ? String(task.due_date).slice(0, 10) : null),
    clientName,
    clientId: meta.clientId || null,
    agencyId: meta.agencyId || task.assigned_to_agency_id || null,
    organizationId: null,
    noteKind: meta.noteKind || 'progress',
    serviceCode: meta.serviceCode || null,
    timeLabel: null,
    status: 'not_started',
    docStatus: 'not_started',
    officeEventId: meta.officeEventId || task.linked_schedule_event_id || task.reference_id || null,
    clinicalSessionId: meta.clinicalSessionId || null,
    durationMinutes: meta.durationMinutes || null,
    scheduledStart: meta.scheduledStart || null,
    scheduledEnd: meta.scheduledEnd || null,
    locationLabel: meta.locationLabel || null,
    participantsSummary: meta.participantsSummary || 'Client Only',
    clientDob: meta.clientDob || null,
    action: task.title || 'Session note'
  };
}

export function scrubLegacyWorkQueueSessionStash() {
  try {
    sessionStorage.removeItem(NOTE_AID_QUEUE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function stashNoteAidWorkQueue(items) {
  scrubLegacyWorkQueueSessionStash();
  memoryWorkQueueStash = {
    items: Array.isArray(items) ? items.map((row) => ({ ...row })) : [],
    at: Date.now()
  };
}

export function consumeNoteAidWorkQueueStash() {
  scrubLegacyWorkQueueSessionStash();
  const stash = memoryWorkQueueStash;
  memoryWorkQueueStash = null;
  if (!stash || !Array.isArray(stash.items)) return null;
  return stash.items;
}

/** Sentinel for 90834 × 2 extended encounter (75+ min). */
export const EXTENDED_ENCOUNTER_CODE = '90834_EXT';

export function isExtendedEncounterCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return c === EXTENDED_ENCOUNTER_CODE || c === '90834X2' || c === '90834×2';
}

/** Normalize UI/select values to a billable CPT (90834_EXT → 90834). */
export function normalizePsychotherapyServiceCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (isExtendedEncounterCode(c)) return '90834';
  return c;
}

/** CPT psychotherapy duration → preferred code (billing bands). */
export function suggestPsychotherapyCodeForDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m >= 75) return EXTENDED_ENCOUNTER_CODE;
  if (m >= 53) return '90837';
  if (m >= 38) return '90834';
  if (m >= 16) return '90832';
  return null;
}

/**
 * Default billed/documentation duration for a service code when no calendar times exist.
 * 90832 → 30, 90834 → 45, extended encounter → 75, 90837 and most others → 60.
 */
export function defaultDurationMinutesForServiceCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (c === '90832') return 30;
  if (isExtendedEncounterCode(c)) return 75;
  if (c === '90834') return 45;
  if (c === '90837') return 60;
  if (c === '90839') return 60;
  if (/^908\d{2}$/.test(c)) return 60;
  return 60;
}

export function psychotherapyCodeOptionLabel(code) {
  const c = String(code || '').trim().toUpperCase();
  if (isExtendedEncounterCode(c)) return '90834 EXTENDED ENCOUNTER (×2)';
  if (c === '90832') return '90832 (16–37 min)';
  if (c === '90834') return '90834 (38–52 min)';
  if (c === '90837') return '90837 (53–74 min)';
  if (c === '90839') return '90839 Crisis';
  return c;
}

/**
 * True when note language suggests someone other than the client attended the session.
 * Discussing family (mother, brother, etc.) does NOT count — only presence phrasing.
 */
export function participantsLikelyIncludeOthers(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  const patterns = [
    /\bpresent\s+with\b/,
    /\baccompanied\s+by\b/,
    /\bin\s+(the\s+)?(session|room|office)\b[^.]{0,80}\b(mother|father|parent|guardian|spouse|partner|sibling|brother|sister|family|collateral)\b/,
    /\b(mother|father|parent|guardian|spouse|partner|sibling|brother|sister|collateral)\s+(was|were)\s+(also\s+)?(present|in\s+(the\s+)?(session|room|office)|in\s+attendance)\b/,
    /\b(session|meeting)\s+included\s+(the\s+)?(mother|father|parent|guardian|spouse|partner|client'?s?\s+\w+|family|collateral|guardian)\b/,
    /\bincluded\s+(in\s+the\s+session|as\s+(a\s+)?participant)\b/,
    /\bothers?\s+were\s+present\b/,
    /\bfamily\s+member\s+(was|were)\s+present\b/,
    /\bcollateral\s+(was|were)\s+present\b/,
    /\bwith\s+(his|her|their)\s+(mom|dad|mother|father|wife|husband)\s+(present|in\s+(the\s+)?session|in\s+attendance)\b/,
    /\bjoined\s+(the\s+)?(session|meeting|appointment)\b/,
    /\b(mother|father|parent|guardian|spouse|partner)\s+joined\b/,
    /\battended\s+(the\s+)?session\b[^.]{0,40}\b(mother|father|parent|guardian|spouse|partner)\b/,
    /\bthird\s+party\s+(was|were)\s+present\b/,
    /\bmultiple\s+participants\b/,
    /\bfamily\s+(therapy|session|counseling)\b/
  ];
  return patterns.some((re) => re.test(t));
}

export function defaultMentalStatusExam() {
  // Empty until the clinician selects options (or All Normal / All Not Assessed).
  const domains = {};
  for (const d of MSE_DOMAINS) {
    domains[d] = { status: '', option: '', detail: '' };
  }
  return { allNormal: false, allNotAssessed: false, domains };
}

export function defaultRiskAssessment() {
  return emptyRiskAssessment();
}

export function defaultMedicationsBlock() {
  return {
    noneCurrently: true,
    items: [],
    commentsHtml: ''
  };
}
