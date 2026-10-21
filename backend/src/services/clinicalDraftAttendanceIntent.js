import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

// Intent alone is not evidence of a fresh save: browsers retry requests and
// hydrate old draft content. Compare against the server's pre-save value.
export function hasAuthoredDraftChange({ body, draft, previousDraft = null }) {
  if (body?.attendanceIntent !== 'authored_session_draft') return false;
  const incoming = typeof body.inputText === 'string' ? body.inputText.trim() : '';
  if (!/[\p{L}\p{N}]/u.test(incoming)) return false;
  if (!previousDraft) return draft?._createdForThisRequest === true;
  try {
    return incoming !== String(maybeDecryptNotePayload(previousDraft.input_text) || '').trim();
  } catch {
    // An unreadable prior value cannot establish a new authored change.
    return false;
  }
}
