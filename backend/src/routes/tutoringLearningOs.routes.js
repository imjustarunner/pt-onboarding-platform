import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/tutoringLearningOs.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/taxonomy', ctrl.getTaxonomy);
router.get('/cas-standards', ctrl.searchCas);
router.get('/evaluation-items', ctrl.listEvalItems);

router.get('/clients/:clientId/overview', ctrl.getOverview);
router.get('/clients/:clientId/subjects', ctrl.listSubjects);
router.post('/subjects', ctrl.enrollSubject);
router.patch('/subjects/:subjectId', ctrl.patchSubject);

router.post('/baselines', ctrl.saveBaseline);
router.get('/subjects/:subjectId/evaluations', ctrl.listEvaluations);
router.post('/evaluations/quick', ctrl.runQuickEval);

router.post('/plans', ctrl.createOrUpdatePlan);
router.get('/plans/:planId', ctrl.getPlan);
router.get('/subjects/:subjectId/plans', ctrl.listPlansForSubject);
router.post('/plans/:planId/approve', ctrl.approvePlan);

router.post('/session-briefs', ctrl.generateBrief);
router.get('/sessions/:sessionId/brief', ctrl.getBriefForSession);
router.patch('/session-briefs/:briefId', ctrl.updateBrief);
router.post('/session-notes', ctrl.saveSessionNote);
router.get('/sessions/:sessionId/note', ctrl.getNoteForSession);
router.post('/sessions/link-in-person-plan', ctrl.linkInPersonPlan);

router.get('/subjects/:subjectId/evidence', ctrl.listEvidence);
router.get('/subjects/:subjectId/workspace', ctrl.getSubjectWorkspace);
router.get('/goals/:goalId/mastery', ctrl.getGoalMastery);
router.post('/goals/:goalId/mastery/recompute', ctrl.recomputeGoalMastery);
router.get('/subjects/:subjectId/alerts', ctrl.listAlerts);
router.post('/alerts/:alertId/acknowledge', ctrl.ackAlert);

router.get('/subjects/:subjectId/reports', ctrl.listReports);
router.post('/reports', ctrl.createReport);
router.post('/reports/:reportId/publish', ctrl.publishReport);
router.get('/reports/:reportId/preview', ctrl.previewReport);

router.get('/subjects/:subjectId/milestones', ctrl.listMilestones);

router.get('/agencies/:agencyId/users/:userId/comfort', ctrl.getComfort);
router.put('/agencies/:agencyId/users/:userId/comfort', ctrl.saveComfort);
router.post('/comfort', ctrl.saveComfort);
router.post('/comfort/drafts', ctrl.saveComfortDraft);
router.get('/comfort/drafts/:hiringProfileId', ctrl.getComfortDraft);
router.post('/comfort/promote-draft', ctrl.promoteComfortDraft);
router.post('/match-tutors', ctrl.matchTutors);

router.post('/ai/draft-plan', ctrl.draftPlanAi);
router.post('/ai/artifacts/:artifactId/approve', ctrl.approveAiArtifact);
router.post('/ai/artifacts/:artifactId/apply-plan', ctrl.applyAiPlanDraft);

router.get('/tutor/caseload-today', ctrl.tutorCaseloadToday);

router.post('/oral-reading-probes', ctrl.createOralProbe);
router.post('/oral-reading-probes/:probeId/verify', ctrl.verifyOralProbe);

router.post('/document-extractions', ctrl.createDocExtraction);
router.post('/document-extractions/:extractionId/confirm', ctrl.confirmDocExtraction);

router.post('/practice', ctrl.createPractice);
router.get('/subjects/:subjectId/practice', ctrl.listPracticeForSubject);
router.get('/clients/:clientId/practice', ctrl.listPracticeForClient);
router.post('/practice/:assignmentId/complete', ctrl.completePractice);

router.post('/assessment-blueprints', ctrl.createAssessmentBlueprint);
router.get('/assessment-blueprints/:blueprintId', ctrl.getAssessmentBlueprint);
router.patch('/assessment-blueprints/:blueprintId', ctrl.updateAssessmentBlueprint);

router.get('/clients/:clientId/guardian-feed', ctrl.getGuardianFeed);
router.get('/clients/:clientId/guardian-dashboard', ctrl.getGuardianDashboard);
router.get('/clients/:clientId/packages', ctrl.listClientPackages);
router.get('/clients/:clientId/package-entitlements', ctrl.listClientPackageEntitlements);
router.post('/clients/:clientId/packages/:packageId/checkout', ctrl.checkoutClientPackage);
router.post('/clients/:clientId/packages/:packageId/confirm', ctrl.confirmClientPackageCheckout);
router.post('/ai/tutor-assist', ctrl.tutorAssist);

export default router;
