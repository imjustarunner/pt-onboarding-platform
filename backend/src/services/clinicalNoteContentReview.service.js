/**
 * Content Review — checks that a note body has required clinical content.
 * Never inspects demographics or other PHI fields outside the note text.
 * AI-generated Note Aid output is treated as complete (auto-pass).
 */

const TERMINATION_REQUIRED = [
  { id: 'reason', label: 'Reason for termination / discharge', pattern: /terminat|discharg|discontinu|end(ed|ing)?\s+(of\s+)?(care|services|treatment)|why\s+.+\s+(left|ended)/i },
  { id: 'progress', label: 'Progress / participation summary', pattern: /progress|participat|attendance|benefit|improv|regress|status/i },
  { id: 'plan_context', label: 'Treatment plan or goals context', pattern: /goal|objective|treatment\s+plan|plan\s+of\s+care|discharge\s+plan/i }
];

const GENERIC_REQUIRED = [
  { id: 'body', label: 'Clinical narrative content', pattern: /\S{40,}/ }
];

function parseMeta(note) {
  try {
    return typeof note?.metadata_json === 'string'
      ? JSON.parse(note.metadata_json || '{}')
      : (note?.metadata_json || {});
  } catch {
    return {};
  }
}

function noteBodyText(notePayload) {
  if (notePayload == null) return '';
  if (typeof notePayload === 'string') return notePayload;
  try {
    return JSON.stringify(notePayload);
  } catch {
    return String(notePayload || '');
  }
}

function requiredItemsForNote(noteType, toolId = '') {
  const nt = String(noteType || '').toUpperCase();
  const tid = String(toolId || '').toLowerCase();
  if (nt.includes('TERMINATION') || tid.includes('termination')) return TERMINATION_REQUIRED;
  return GENERIC_REQUIRED;
}

/**
 * Build a content-review result for chart persistence.
 * @param {Object} opts
 * @param {string} opts.notePayload
 * @param {string} [opts.noteType]
 * @param {string} [opts.toolId]
 * @param {boolean} [opts.aiGenerated] — Note Aid writer produced the body
 */
export function evaluateNoteContentReview({
  notePayload = '',
  noteType = '',
  toolId = '',
  aiGenerated = false
} = {}) {
  const body = noteBodyText(notePayload);
  const required = requiredItemsForNote(noteType, toolId);

  if (aiGenerated) {
    return {
      status: 'passed',
      source: 'ai_generated',
      checkedAt: new Date().toISOString(),
      items: required.map((r) => ({ id: r.id, label: r.label, passed: true, auto: true })),
      notes: 'AI Note Aid output — content checklist auto-passed (content only; demographics/PHI not reviewed).'
    };
  }

  const items = required.map((r) => ({
    id: r.id,
    label: r.label,
    passed: r.pattern.test(body),
    auto: false
  }));
  const allPassed = items.every((i) => i.passed);
  return {
    status: allPassed ? 'passed' : 'pending',
    source: 'ai_checked',
    checkedAt: new Date().toISOString(),
    items,
    notes: allPassed
      ? 'Content checklist passed (content only; demographics/PHI not reviewed).'
      : 'Content checklist incomplete — add missing clinical content before completing review.'
  };
}

export function isReviewOnlyNoteType(noteType) {
  const nt = String(noteType || '').toUpperCase().replace(/\s+/g, '_');
  return nt === 'TERMINATION' || nt === 'CONTACT_NOTE' || nt === 'CONTACT' || nt.includes('TERMINATION');
}

export function shouldSkipSupervisorCosign({ noteType, metadata = {} } = {}) {
  if (metadata?.skipSupervisorCosign === true || metadata?.requiresSupervisorCosign === false) {
    return true;
  }
  if (metadata?.documentationFlow === 'review') return true;
  if (isReviewOnlyNoteType(noteType || metadata?.noteType)) return true;
  if (metadata?.autosignAfterReview === true) return true;
  return false;
}

export function reviewMetaFromNote(note) {
  const meta = parseMeta(note);
  return {
    status: note?.content_review_status || meta?.contentReview?.status || null,
    source: note?.content_review_source || meta?.contentReview?.source || null,
    detail: meta?.contentReview || null
  };
}

export default {
  evaluateNoteContentReview,
  isReviewOnlyNoteType,
  shouldSkipSupervisorCosign,
  reviewMetaFromNote
};
