import clinicalPool from '../config/clinicalDatabase.js';
import { screeningReviewContext, writeScreeningDetermination, screeningDate, proposedScreeningReview } from '../services/h0002ScreeningWorkflow.service.js';
import { maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { signClinicalNote } from './medicalBilling.controller.js';

export async function getH0002ScreeningReview(req, res, next) {
  try {
    const { session, note, source } = await screeningReviewContext({ sessionId: Number(req.params.sessionId), user: req.user });
    res.json({ sessionId: session.id, noteId: note.id, agencyId: session.agency_id, signedAt: note.provider_signed_at,
      clientCode: source.taskMeta.h0002Code, submittedAt: source.submittedAt, sourceHash: source.sourceHash,
      sourceText: source.summary, draftText: maybeDecryptNotePayload(note.note_payload), psc: source.psc,
      suggestedOutcome: source.suggestedOutcome, reportedConcerns: source.reportedConcerns, safetyFlag: source.safetyFlag,
      proposedReview: proposedScreeningReview(source),
      reviewServiceDate: screeningDate() });
  } catch (error) { next(error); }
}

export async function signH0002ScreeningReview(req, res, next) {
  const key = `h0002:sign:${Number(req.params.sessionId)}`;
  let acquired = false, db;
  try {
    if (req.body?.accurateAndComplete !== true || req.body?.medicalNecessityAttested !== true) {
      throw Object.assign(new Error('Confirm accuracy and medical necessity before signing.'), { status: 400 });
    }
    db = await clinicalPool.getConnection();
    const [[lock]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw Object.assign(new Error('This screening is already being signed. Please retry.'), { status: 409 });
    const note = await writeScreeningDetermination({ sessionId: Number(req.params.sessionId), user: req.user, input: req.body });
    await signClinicalNote({ ...req, params: { noteId: note.id }, body: { agencyId: note.agency_id, accurateAndComplete: true, medicalNecessityAttested: true } }, res, error => { throw error; });
  } catch (error) { next(error); } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [key]);
    db?.release();
  }
}
