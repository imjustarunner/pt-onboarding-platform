import { readScreeningDraft, saveScreeningDraft } from '../services/h0002ReviewDraft.service.js';
import { screeningEnglish, redactedScreeningText } from '../services/h0002Translation.service.js';
import { screeningLocation } from '../services/h0002ReviewDetails.js';
import { screeningTransferOptions, transferScreening } from '../services/h0002Transfer.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { screeningReviewContext, writeScreeningDetermination, screeningDate, proposedScreeningReview } from '../services/h0002ScreeningWorkflow.service.js';
import { maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { signClinicalNote } from './medicalBilling.controller.js';

export async function getH0002ScreeningReview(req, res, next) {
  try {
    const { session, note, source } = await screeningReviewContext({ sessionId: Number(req.params.sessionId), user: req.user });
    const handoff = source.sourceLanguage === 'es' && !note.provider_signed_at ? await screeningTransferOptions({session,note,source}) : {providers:[],supervisor:null};
    res.set('Cache-Control','no-store');
    res.json({ clientId: source.client.id, submissionId: source.submissionId, clientType: source.clientType, schoolName: source.schoolName,
      sourceLanguage: source.sourceLanguage, packetMethod: source.packetMethod,
      translationPreview: source.sourceLanguage === 'es' ? redactedScreeningText(source) : '',
      sourceEnglish: source.sourceLanguage === 'es' ? '' : source.summary,
      savedReview: readScreeningDraft(note), location: screeningLocation(source), pscItems: source.pscItems, clinicalFields: source.clinicalFields,
      safetyConcerns: source.safetyConcerns, transferProviders: handoff.providers, billingSupervisor: handoff.supervisor,
      sessionId: session.id, noteId: note.id, agencyId: session.agency_id, signedAt: note.provider_signed_at,
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
    // Express headers/socket/get are inherited, so spreading the request loses
    // the audit context required by the note signature handler.
    const signingRequest = Object.create(req);
    signingRequest.params = { noteId: note.id };
    signingRequest.body = { agencyId: note.agency_id, accurateAndComplete: true, medicalNecessityAttested: true };
    await signClinicalNote(signingRequest, res, error => { throw error; });
  } catch (error) { next(error); } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [key]);
    db?.release();
  }
}

export async function saveH0002ScreeningDraft(req,res,next) {
  try { res.set('Cache-Control','no-store'); res.json(await saveScreeningDraft({sessionId:Number(req.params.sessionId),user:req.user,input:req.body})); }
  catch(error) { next(error); }
}
export async function forwardH0002Screening(req,res,next) {
  try { res.json(await transferScreening({sessionId:Number(req.params.sessionId),user:req.user,providerUserId:Number(req.body?.providerUserId)})); }
  catch(error) { next(error); }
}
export async function translateH0002Screening(req,res,next) {
  try {
    const {source} = await screeningReviewContext({sessionId:Number(req.params.sessionId),user:req.user});
    res.set('Cache-Control','no-store'); res.json(await screeningEnglish(source,req.body));
  } catch(error) { next(error); }
}
