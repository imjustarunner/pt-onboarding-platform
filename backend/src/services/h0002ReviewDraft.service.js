import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { screeningReviewContext } from './h0002ScreeningWorkflow.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { validateScreeningDraft, screeningPresentingProblem } from './h0002ReviewDetails.js';
const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
export function readScreeningDraft(note) {
  const encoded = parse(note.metadata_json).screeningDraftEnc;
  return encoded ? JSON.parse(maybeDecryptNotePayload(encoded)) : null;
}
export async function saveScreeningDraft({ sessionId, user, input }) {
  const db = await clinicalPool.getConnection();
  const key = `h0002:sign:${Number(sessionId)}`;
  let acquired = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw Object.assign(new Error('The screening is being updated. Please retry.'), { status: 409 });
    return await saveLockedScreeningDraft({ sessionId, user, input });
  } finally {
    try { if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [key]); }
    finally { db.release(); }
  }
}
async function saveLockedScreeningDraft({ sessionId, user, input }) {
  const { session, note, source } = await screeningReviewContext({ sessionId, user });
  if (note.provider_signed_at) throw Object.assign(new Error('Signed screenings cannot be edited.'), { status: 409 });
  const review = validateScreeningDraft(input, source);
  const old = readScreeningDraft(note);
  if (Number(input.revision || 0) !== Number(old?.revision || 0)) throw Object.assign(new Error('This draft changed in another window. Reopen it before saving.'), { status: 409 });
  const saved = { ...review, revision: Number(old?.revision || 0) + 1, savedAt: new Date().toISOString(), savedByUserId: Number(user.id) };
  const metadata = { ...parse(note.metadata_json), screeningDraftEnc: maybeEncryptNotePayload(JSON.stringify(saved)) };
  const payload = ['H0002 screening — DRAFT, unsigned', `Client type: ${source.clientType}; school: ${source.schoolName || 'Not applicable'}`,
    'Presenting problem', screeningPresentingProblem(review), 'Clinical assessment', review.assessment, 'Follow-up', review.followUp].join('\n\n');
  // Queue writes precede the revision change so a failed write remains safely retryable.
  await pool.execute(`UPDATE note_aid_work_queue_items SET status='started', started_at=COALESCE(started_at,NOW()) WHERE user_id=? AND client_key=? AND status IN ('not_started','started')`, [user.id, `h0002_task_${source.task.id}`]);
  await pool.execute("UPDATE tasks SET status='in_progress' WHERE id=? AND assigned_to_user_id=? AND status='pending'", [source.task.id, user.id]);
  const [updated] = await clinicalPool.execute(`UPDATE clinical_notes SET note_payload=?, metadata_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND provider_signed_at IS NULL AND is_deleted=0 AND COALESCE(metadata_json,JSON_OBJECT())=CAST(? AS JSON)`,
    [maybeEncryptNotePayload(payload), JSON.stringify(metadata), note.id, JSON.stringify(parse(note.metadata_json))]);
  if (!updated.affectedRows) throw Object.assign(new Error('This draft changed. Reopen it before saving.'), { status: 409 });
  return { review: saved, noteId: note.id, clientId: session.client_id };
}
