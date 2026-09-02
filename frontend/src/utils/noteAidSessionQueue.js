/**
 * Bridge Tasks hub Notes → Note Aid work queue.
 */

export const NOTE_AID_QUEUE_STORAGE_KEY = 'noteAidWorkQueueImport';

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

export function stashNoteAidWorkQueue(items) {
  try {
    sessionStorage.setItem(
      NOTE_AID_QUEUE_STORAGE_KEY,
      JSON.stringify({ items: items || [], at: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function consumeNoteAidWorkQueueStash() {
  try {
    const raw = sessionStorage.getItem(NOTE_AID_QUEUE_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(NOTE_AID_QUEUE_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

/** CPT psychotherapy duration → preferred code (billing bands). */
export function suggestPsychotherapyCodeForDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m >= 53) return '90837';
  if (m >= 38) return '90834';
  if (m >= 16) return '90832';
  return null;
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

export const MSE_DOMAINS = [
  'Orientation',
  'Insight',
  'General Appearance',
  'Judgment/Impulse Control',
  'Dress',
  'Memory',
  'Motor Activity',
  'Attention/Concentration',
  'Interview Behavior',
  'Thought Process',
  'Speech',
  'Thought Content',
  'Mood',
  'Perception',
  'Affect',
  'Functional Status'
];

export function defaultMentalStatusExam() {
  const domains = {};
  for (const d of MSE_DOMAINS) {
    domains[d] = { status: 'normal', detail: '' };
  }
  return { allNormal: true, allNotAssessed: false, domains };
}

export function defaultRiskAssessment() {
  return {
    patientDeniesAll: true,
    areas: []
  };
}

export function defaultMedicationsBlock() {
  return {
    noneCurrently: true,
    items: [],
    commentsHtml: ''
  };
}
