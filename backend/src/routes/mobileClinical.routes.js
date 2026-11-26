import {postSupervisorReview} from '../controllers/clinicalSupervisorReview.controller.js';
import {getDiagnosisReview,postDiagnosisReview} from '../controllers/clinicalDiagnosisPolicy.controller.js';
import { maskMobileClientName } from '../services/narrivaAccess.service.js';
import { enrollmentSections, listEntries, readEntry, createEntry } from '../controllers/confidentialClinicalEntries.controller.js';
import sessionSupportingMaterials from './sessionSupportingMaterials.routes.js';
import express from 'express';
import {getClinicalMseHistory} from '../controllers/clinicalMseHistory.controller.js';
import {excludeSupportClinicalContent} from '../middleware/supportContentAccess.middleware.js';
import {clinicalWorkspaceLimiter,noteAidLimiter} from '../middleware/rateLimiter.middleware.js';
import {requireClinicalChart,requireClinicalNoteSigning} from '../middleware/medicalBilling.middleware.js';
import {requireMobileClinicalSession,scopedMobileClinicalHandler as scoped,getMobileClinicalContext,getMobileClientSummary,resolveMobileClientContact,sendMobileClientContact,getMobileNotesToSign,bootstrapMobileClinicalSession} from '../controllers/mobileClinical.controller.js';
import {createClinicalNoteDraft,patchClinicalNoteDraft,generateClinicalNote} from '../controllers/clinicalNoteGenerator.controller.js';
import {createSessionNote} from '../controllers/clinicalData.controller.js';
import {getClinicalNoteById,signClinicalNote,cosignClinicalNote,createObjectiveRating,upsertDiagnosis} from '../controllers/medicalBilling.controller.js';
import * as narriva from '../controllers/narriva.controller.js';
import * as recording from '../controllers/clinicalSessionRecording.controller.js';
import * as assessments from '../controllers/narrivaAssessmentEvidence.controller.js';
import {getServiceReference} from '../controllers/clinicalServiceReference.controller.js';
import {getClinicalSessionServiceCode,changeClinicalSessionServiceCode} from '../controllers/clinicalSessionServiceChange.controller.js';
import {getNoteReviewInsights} from '../controllers/clinicalNoteReviewInsights.controller.js';
import {searchDiagnosisCatalog} from '../controllers/clinicalDiagnosisSearch.controller.js';
const router=express.Router();
// Parent mounts requireQuickViewSession. Full bearer authentication is deliberately
// absent: this router accepts only the verified primary-device scoped session.
router.use(requireMobileClinicalSession,clinicalWorkspaceLimiter);
router.get('/context',requireClinicalChart,getMobileClinicalContext);
router.post('/diagnosis-search',requireClinicalChart,scoped(searchDiagnosisCatalog));
const clinicalClientAccess = [excludeSupportClinicalContent,requireClinicalChart];
const clientScope = {clientParam:'clientId',requireClient:true};
router.get('/clients/:clientId/diagnosis-evidence',...clinicalClientAccess,scoped(getDiagnosisReview,clientScope));
router.post('/clients/:clientId/diagnosis-evidence/:diagnosisId',...clinicalClientAccess,scoped(postDiagnosisReview,clientScope));
router.post('/diagnosis-criteria',requireClinicalChart,scoped(narriva.postDiagnosticCriteria,{requireClient:true}));
router.get('/clients/:clientId/diagnosis-criteria',...clinicalClientAccess,scoped(narriva.getDiagnosticCriteria,clientScope));
router.get('/clients/:clientId/assessment-context',...clinicalClientAccess,scoped(narriva.getClinicalAssessmentContext,clientScope));
router.get('/clients/:clientId/enrollment-sections',...clinicalClientAccess,scoped(enrollmentSections,clientScope));
router.get('/clients/:clientId/confidential-entries',...clinicalClientAccess,scoped(listEntries,clientScope));
router.get('/clients/:clientId/confidential-entries/:entryId',...clinicalClientAccess,scoped(readEntry,clientScope));
router.post('/clients/:clientId/confidential-entries',...clinicalClientAccess,scoped(createEntry,clientScope));
router.get('/clients/:clientId/mse-history',excludeSupportClinicalContent,requireClinicalChart,scoped(getClinicalMseHistory,{clientParam:'clientId',requireClient:true}));
router.get('/clients/:clientId/summary',requireClinicalChart,getMobileClientSummary);
router.post('/clients/:clientId/contact',requireClinicalChart,resolveMobileClientContact);
router.post('/clients/:clientId/contact/send',requireClinicalChart,sendMobileClientContact);
// Evidence handlers perform exact draft/author/assigned-reviewer scope checks.
// Recheck both the primary workspace and query/body identity after multipart.
router.get('/assessments',requireClinicalChart,assessments.preflightNarrivaAssessmentEvidence,assessments.listNarrivaAssessmentEvidence);
router.post('/assessments',requireClinicalChart,assessments.preflightNarrivaAssessmentEvidence,assessments.receiveNarrivaAssessmentFile,requireMobileClinicalSession,assessments.preflightNarrivaAssessmentEvidence,assessments.uploadNarrivaAssessmentEvidence);
router.post('/assessments/:materialId/scan',requireClinicalChart,assessments.preflightNarrivaAssessmentEvidence,assessments.rescanNarrivaAssessmentEvidence);
router.get('/assessments/:kind/:evidenceId/view',requireClinicalChart,assessments.preflightNarrivaAssessmentEvidence,assessments.viewNarrivaAssessmentEvidence);
router.get('/service-reference/:serviceCode',requireClinicalChart,scoped(getServiceReference));
router.get('/narriva/preferences',scoped(narriva.getNarrivaPreferences));
router.patch('/narriva/preferences',scoped(narriva.patchNarrivaPreferences));
router.post('/narriva/reviews',requireClinicalChart,noteAidLimiter,scoped(narriva.postNarrivaReview));
router.get('/narriva/reviews/:reviewId',requireClinicalChart,scoped(narriva.getNarrivaReview));
router.patch('/narriva/reviews/:reviewId/findings',requireClinicalChart,scoped(narriva.patchNarrivaFinding));
router.get('/narriva/notes/:noteId/status',requireClinicalChart,scoped(narriva.getNarrivaNoteStatus,{noteParam:'noteId'}));
router.post('/drafts',scoped(createClinicalNoteDraft,{requireClient:true}));
router.patch('/drafts/:draftId',scoped(patchClinicalNoteDraft,{draftParam:'draftId',requireClient:true}));
router.post('/generate',noteAidLimiter,scoped(generateClinicalNote,{requireClient:true}));
router.post('/sessions/bootstrap',requireClinicalChart,scoped(bootstrapMobileClinicalSession,{requireClient:true}));
router.post('/sessions/:sessionId/diagnoses',excludeSupportClinicalContent,requireClinicalChart,scoped((req,res,next)=>{
  req.body.clinicalSessionId=req.mobileClinical.session.id;
  return upsertDiagnosis(req,res,next);
},{sessionParam:'sessionId',requireClient:true}));
function maskMaterialRecipients(req,res,next) {
  const send = res.json.bind(res);
  const maskedPerson = person => ({...person,name:maskMobileClientName({full_name:person.name})});
  const maskedMaterial = material => {
    const result = {...material};
    for (const field of ['sharedWith','sharingRecipients']) {
      if (Array.isArray(result[field])) result[field] = result[field].map(maskedPerson);
    }
    return result;
  };
  res.json = data => send(Array.isArray(data)
    ? data.map(req.path === '/recipients' ? maskedPerson : maskedMaterial)
    : maskedMaterial(data));
  next();
}
router.use('/sessions/:sessionId/materials',...clinicalClientAccess,scoped((req,res,next)=>next(),{sessionParam:'sessionId',requireClient:true}),maskMaterialRecipients,sessionSupportingMaterials);
router.get('/sessions/:sessionId/service',requireClinicalChart,scoped(getClinicalSessionServiceCode,{sessionParam:'sessionId',requireClient:true}));
router.post('/sessions/:sessionId/service',requireClinicalChart,scoped(changeClinicalSessionServiceCode,{sessionParam:'sessionId',requireClient:true}));
router.post('/sessions/:sessionId/notes',requireClinicalChart,scoped(createSessionNote,{sessionParam:'sessionId',requireClient:true,requireGeneratedNote:true}));
router.get('/notes-to-sign',requireClinicalChart,getMobileNotesToSign);
router.get('/notes/:noteId',requireClinicalChart,scoped(getClinicalNoteById,{noteParam:'noteId',requireClient:true}));
router.get('/notes/:noteId/review-insights',requireClinicalChart,scoped(getNoteReviewInsights,{noteParam:'noteId',requireClient:true}));
router.post('/notes/:noteId/sign',requireClinicalNoteSigning,scoped(signClinicalNote,{noteParam:'noteId',requireClient:true,authorOnly:true,requireGeneratedNote:true}));
router.post('/notes/:noteId/cosign',requireClinicalNoteSigning,scoped(cosignClinicalNote,{noteParam:'noteId',requireClient:true}));
router.post('/notes/:noteId/supervisor-review',requireClinicalNoteSigning,scoped(postSupervisorReview,{noteParam:'noteId',requireClient:true}));
router.post('/objectives/:objectiveId/ratings',requireClinicalChart,scoped(createObjectiveRating,{objectiveParam:'objectiveId',requireClient:true}));
router.get('/recording/session/context',scoped(recording.sessionRecordingContext,{requireClient:true,maskRecordingNames:true}));
router.post('/recording/session/start-setup',scoped(recording.setupClinicalSessionRecording,{requireClient:true,maskRecordingNames:true}));
router.post('/recording/session/:recordingId/participants',scoped(recording.updateSessionRecordingParticipants,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/consent',scoped(recording.prepareSessionRecordingConsent,{recordingParam:'recordingId',requireClient:true}));
router.get('/recording/session/:recordingId/consent/:participantId/pdf',scoped(recording.getSessionRecordingConsentPdf,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/consent/:participantId/sign',scoped(recording.signSessionRecordingConsent,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/consent/:participantId/assign',scoped(recording.assignSessionRecordingConsent,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/consent/:participantId/withdraw',scoped(recording.withdrawSessionRecordingConsent,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/confirm',scoped(recording.confirmClinicalSessionRecording,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/control',scoped(recording.controlClinicalSessionRecording,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/audio',recording.clinicalSessionAudioUpload.single('audio'),scoped(recording.appendClinicalSessionRecordingAudio,{recordingParam:'recordingId',requireClient:true}));
router.get('/recording/session/:recordingId/narrative',scoped(recording.getClinicalSessionRecordingNarrative,{recordingParam:'recordingId',requireClient:true}));
router.post('/recording/session/:recordingId/finish',scoped(recording.finishClinicalSessionRecording,{recordingParam:'recordingId',requireClient:true}));
export default router;
