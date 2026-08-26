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

export function participantsLikelyIncludeOthers(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  const patterns = [
    /\bmother\b/,
    /\bfather\b/,
    /\bparent\b/,
    /\bguardian\b/,
    /\bspouse\b/,
    /\bpartner\b/,
    /\bsibling\b/,
    /\bbrother\b/,
    /\bsister\b/,
    /\bfamily\s+member\b/,
    /\bpresent\s+with\b/,
    /\baccompanied\s+by\b/,
    /\bwith\s+(his|her|their)\s+(mom|dad|mother|father|wife|husband)\b/
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
