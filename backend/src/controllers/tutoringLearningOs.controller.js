import {guardianTutoringOfficeStatus,startGuardianOfficeVisit,guardianTutoringOfficeEntry} from '../services/guardianTutoringOffice.service.js';
import pool from '../config/database.js';
import {assertLearningSessionAccess} from '../utils/learningClassAccess.js';
import { requireResponsiblePayer } from '../services/familyBillingPolicy.service.js';
import { comfortTaxonomyPayload } from '../constants/tutoringLearningOs.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';
import * as los from '../services/tutoringLearningOs.service.js';
import { requireStaffPlanActor } from '../utils/planStaffAccess.js';

function actorId(req) {
  return req.user?.id || null;
}

function agencyIdFromReq(req) {
  return (
    Number(req.body?.agencyId || req.query?.agencyId || req.user?.agency_id || req.headers['x-agency-id']) ||
    null
  );
}

export async function getTaxonomy(_req, res) {
  res.json(comfortTaxonomyPayload());
}

export async function getOverview(req, res, next) {
  try {
    const { clientId,agencyId,service } = await assertLearningClientAccess(req, req.params.clientId);
    const data = await los.getLearningOverview(clientId,{agencyId,providerId:service?.provider_user_id});
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function listSubjects(req, res, next) {
  try {
    const { clientId,agencyId,service } = await assertLearningClientAccess(req, req.params.clientId);
    const subjects = await los.StudentSubject.listByClient(clientId,{agencyId});
    res.json({ subjects:service?.provider_user_id?subjects.filter(s=>Number(s.primary_tutor_user_id)===Number(service.provider_user_id)):subjects });
  } catch (e) {
    next(e);
  }
}

export async function enrollSubject(req, res, next) {
  try {
    const access = await assertLearningClientAccess(req, req.body.clientId);
    const clientId = access.clientId;
    const agencyId =
      Number(req.body.agencyId) ||
      Number(access.client?.agency_id) ||
      Number(access.client?.organization_id) ||
      agencyIdFromReq(req);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!req.body.subjectKey) {
      return res.status(400).json({ error: { message: 'subjectKey is required' } });
    }
    const subject = await los.enrollStudentSubject(
      {
        agencyId,
        clientId,
        subjectKey: req.body.subjectKey,
        subjectLabel: req.body.subjectLabel,
        schoolGrade: req.body.schoolGrade,
        instructionalLevel: req.body.instructionalLevel,
        reasonForTutoring: req.body.reasonForTutoring,
        primaryTutorUserId: req.body.primaryTutorUserId,
        standardsVersionKey: req.body.standardsVersionKey,
        status: req.body.status
      },
      actorId(req)
    );
    res.status(201).json({ subject });
  } catch (e) {
    next(e);
  }
}

export async function patchSubject(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const updated = await los.StudentSubject.update(subject.id, req.body, actorId(req));
    res.json({ subject: updated });
  } catch (e) {
    next(e);
  }
}

export async function saveBaseline(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const result = await los.saveManualBaseline(req.body, actorId(req));
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function listEvaluations(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const summaries = await los.EvaluationSummary.listBySubject(subject.id);
    res.json({ evaluations: summaries });
  } catch (e) {
    next(e);
  }
}

export async function createOrUpdatePlan(req, res, next) {
  try {
    requireStaffPlanActor(req.user);
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);

    const existingGoals = new Map();
    for (const goal of Array.isArray(req.body.goals) ? req.body.goals : []) {
      if (!goal.id) continue;
      const existingGoal = await los.StudentLearningPlan.findGoalById(goal.id);
      if (!req.body.id || !existingGoal || Number(existingGoal.learning_plan_id) !== Number(req.body.id) || Number(existingGoal.student_subject_id) !== Number(subject.id)) {
        return res.status(404).json({ error: { message: 'Goal not found in this plan.' } });
      }
      existingGoals.set(Number(goal.id), existingGoal);
    }

    let plan;
    if (req.body.id) {
      const existing = await los.StudentLearningPlan.findById(req.body.id);
      if (!existing || Number(existing.client_id) !== Number(subject.client_id) || Number(existing.agency_id) !== Number(subject.agency_id) || Number(existing.student_subject_id) !== Number(subject.id)) {
        return res.status(404).json({ error: { message: 'Plan not found for this subject.' } });
      }
      plan = await los.StudentLearningPlan.update(req.body.id, {
        ...req.body, ...(req.body.status === 'active' && !existing.approved_at ? { status: 'pending_review' } : {})
      }, actorId(req));
    } else {
      plan = await los.StudentLearningPlan.create(
        {
          agencyId: subject.agency_id,
          clientId: subject.client_id,
          studentSubjectId: subject.id,
          evaluationSummaryId: req.body.evaluationSummaryId,
          title: req.body.title || `${subject.subject_label} Learning Plan`,
          status: req.body.status === 'active' ? 'pending_review' : (req.body.status || 'draft'),
          strengths: req.body.strengths,
          priorityNeeds: req.body.priorityNeeds,
          instructionalStrategies: req.body.instructionalStrategies,
          progressMonitoringPlan: req.body.progressMonitoringPlan,
          standardsVersionKey: req.body.standardsVersionKey,
          parentSummary: req.body.parentSummary
        },
        actorId(req)
      );
    }

    if (Array.isArray(req.body.goals)) {
      for (let i = 0; i < req.body.goals.length; i += 1) {
        const g = req.body.goals[i];
        if (g.id) {
          const existingGoal = existingGoals.get(Number(g.id));
          const goalInput = { ...g };
          if (g.guardianRatingQuestion !== undefined) {
            const question = String(g.guardianRatingQuestion || '').trim().slice(0, 500);
            goalInput.metadata = { ...(existingGoal.metadata_json || {}), guardianRatingQuestion: question,
              guardianRatingQuestionVerifiedAt: question && g.guardianRatingQuestionVerified === true ? new Date().toISOString() : null,
              guardianRatingQuestionVerifiedBy: question && g.guardianRatingQuestionVerified === true ? actorId(req) : null };
          } else delete goalInput.metadata;
          await los.StudentLearningPlan.updateGoal(g.id, goalInput);
        } else {
          await los.StudentLearningPlan.addGoal({
            ...g,
            learningPlanId: plan.id,
            studentSubjectId: subject.id,
            metadata: null,
            sortOrder: g.sortOrder ?? i
          });
        }
      }
    }

    const bundle = await los.StudentLearningPlan.getPlanBundle(plan.id);
    const guardianSharing = await shareSavedLearningPlan(bundle, actorId(req));
    res.json({ plan: bundle, guardianSharing });
  } catch (e) {
    next(e);
  }
}

export async function getPlan(req, res, next) {
  try {
    requireStaffPlanActor(req.user);
    const bundle = await los.StudentLearningPlan.getPlanBundle(req.params.planId);
    if (!bundle) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, bundle.plan.client_id, bundle.plan.agency_id);
    const { learningPlanStaffFeedback } = await import('../services/guardianLearningPlan.service.js');
    res.json({ ...bundle, guardianFeedback: await learningPlanStaffFeedback(bundle.plan) });
  } catch (e) {
    next(e);
  }
}

export async function listPlansForSubject(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const plans = await los.StudentLearningPlan.listBySubject(subject.id);
    res.json({ plans });
  } catch (e) {
    next(e);
  }
}

export async function approvePlan(req, res, next) {
  try {
    requireStaffPlanActor(req.user);
    const existing = await los.StudentLearningPlan.findById(req.params.planId);
    if (!existing) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, existing.client_id, existing.agency_id);
    const bundle = await los.approveLearningPlan(existing.id, actorId(req));
    const guardianSharing = await shareSavedLearningPlan(bundle, actorId(req));
    res.json({ ...bundle, guardianSharing });
  } catch (e) {
    next(e);
  }
}

async function shareSavedLearningPlan(bundle, actorUserId) {
  try {
    const { shareGuardianLearningPlan } = await import('../services/guardianLearningPlan.service.js');
    return await shareGuardianLearningPlan({ bundle, actorUserId });
  } catch (error) {
    console.warn('[learning-plan] Family sharing needs a retry:', error?.code || error?.status || 'unavailable');
    return { shared: 0, needsRetry: true, message: 'The plan was saved. Family sharing needs a retry from the plan page.' };
  }
}

export async function generateBrief(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    if(req.body.sessionId)await requireTutorSession(req,req.body.sessionId,subject);
    const brief = await los.generateSessionBrief(
      { studentSubjectId: subject.id, sessionId: req.body.sessionId || null },
      actorId(req)
    );
    res.status(201).json({ brief });
  } catch (e) {
    next(e);
  }
}

export async function getBriefForSession(req, res, next) {
  try {
    await requireTutorSession(req,req.params.sessionId);
    const brief = await los.TutoringSessionBrief.findBySession(req.params.sessionId);
    res.json({ brief });
  } catch (e) {
    next(e);
  }
}

export async function updateBrief(req, res, next) {
  try {
    const existing=await los.TutoringSessionBrief.findById(req.params.briefId);
    if(!existing)return res.status(404).json({error:{message:'Brief not found'}});
    await assertLearningClientAccess(req,existing.client_id,existing.agency_id);
    if(existing.session_id)await requireTutorSession(req,existing.session_id);
    const brief = await los.TutoringSessionBrief.update(req.params.briefId, req.body, actorId(req));
    res.json({ brief });
  } catch (e) {
    next(e);
  }
}

export async function saveSessionNote(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    if(req.body.sessionId)await requireTutorSession(req,req.body.sessionId,subject);
    const result = await los.saveNoteAndUpdateProgress(req.body, actorId(req));
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function getNoteForSession(req, res, next) {
  try {
    await requireTutorSession(req,req.params.sessionId);
    const note = await los.TutoringSessionNote.findBySession(req.params.sessionId);
    res.json({ note });
  } catch (e) {
    next(e);
  }
}

export async function listEvidence(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const evidence = await los.AcademicSkillEvidence.listBySubject(subject.id);
    const chart = await los.AcademicSkillEvidence.progressChart(subject.id);
    res.json({ evidence, chart });
  } catch (e) {
    next(e);
  }
}

export async function getSubjectWorkspace(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const workspace = await los.getSubjectWorkspace(subject.id);
    res.json(workspace);
  } catch (e) {
    next(e);
  }
}

export async function getGoalMastery(req, res, next) {
  try {
    const goal = await los.StudentLearningPlan.findGoalById(req.params.goalId);
    if (!goal) return res.status(404).json({ error: { message: 'Goal not found' } });
    const subject = await los.StudentSubject.findById(goal.student_subject_id);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const mastery = await los.evaluateGoalMastery(goal.id);
    res.json({ mastery });
  } catch (e) {
    next(e);
  }
}

export async function recomputeGoalMastery(req, res, next) {
  try {
    const goal = await los.StudentLearningPlan.findGoalById(req.params.goalId);
    if (!goal) return res.status(404).json({ error: { message: 'Goal not found' } });
    const subject = await los.StudentSubject.findById(goal.student_subject_id);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const mastery = await los.applyMasteryToGoal(goal.id, { autoApply: req.body?.autoApply !== false });
    res.json({ mastery, goal: await los.StudentLearningPlan.findGoalById(goal.id) });
  } catch (e) {
    next(e);
  }
}

export async function getComfort(req, res, next) {
  try {
    const agencyId = Number(req.params.agencyId || agencyIdFromReq(req));
    const userId = Number(req.params.userId);
    const pref = await los.StaffClientComfortPreference.findByUser(userId, agencyId);
    res.json({ preferences: pref, taxonomy: comfortTaxonomyPayload() });
  } catch (e) {
    next(e);
  }
}

export async function saveComfort(req, res, next) {
  try {
    const agencyId = Number(req.body.agencyId || agencyIdFromReq(req));
    const userId = Number(req.body.userId || req.params.userId);
    if (!agencyId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId and userId required' } });
    }
    const pref = await los.StaffClientComfortPreference.upsert(
      {
        agencyId,
        userId,
        hiringProfileId: req.body.hiringProfileId,
        academicSubjects: req.body.academicSubjects,
        emotionalBehavioral: req.body.emotionalBehavioral,
        ageRanges: req.body.ageRanges,
        gradeLevels: req.body.gradeLevels,
        serviceTypes: req.body.serviceTypes,
        assessmentTools: req.body.assessmentTools,
        additionalNotes: req.body.additionalNotes
      },
      actorId(req)
    );
    res.json({ preferences: pref });
  } catch (e) {
    next(e);
  }
}

export async function saveComfortDraft(req, res, next) {
  try {
    const agencyId = Number(req.body.agencyId || agencyIdFromReq(req));
    const hiringProfileId = Number(req.body.hiringProfileId) || null;
    const candidateUserId = Number(req.body.candidateUserId) || null;
    if (!agencyId || (!hiringProfileId && !candidateUserId)) {
      return res.status(400).json({ error: { message: 'agencyId and hiringProfileId or candidateUserId required' } });
    }
    const draft = await los.StaffClientComfortPreference.saveHiringDraft(
      {
        agencyId,
        hiringProfileId: Number(req.body.hiringProfileId) || null,
        candidateUserId: Number(req.body.candidateUserId) || null,
        academicSubjects: req.body.academicSubjects,
        emotionalBehavioral: req.body.emotionalBehavioral,
        ageRanges: req.body.ageRanges,
        gradeLevels: req.body.gradeLevels,
        serviceTypes: req.body.serviceTypes,
        assessmentTools: req.body.assessmentTools,
        additionalNotes: req.body.additionalNotes
      },
      actorId(req)
    );
    res.json({ draft });
  } catch (e) {
    next(e);
  }
}

export async function getComfortDraft(req, res, next) {
  try {
    const draft = await los.StaffClientComfortPreference.findHiringDraft(req.params.hiringProfileId);
    res.json({ draft, taxonomy: comfortTaxonomyPayload() });
  } catch (e) {
    next(e);
  }
}

export async function promoteComfortDraft(req, res, next) {
  try {
    const pref = await los.StaffClientComfortPreference.promoteDraftToUser(
      {
        hiringProfileId: Number(req.body.hiringProfileId),
        userId: Number(req.body.userId),
        agencyId: Number(req.body.agencyId)
      },
      actorId(req)
    );
    res.json({ preferences: pref });
  } catch (e) {
    next(e);
  }
}

export async function matchTutors(req, res, next) {
  try {
    const agencyId = Number(req.body.agencyId || agencyIdFromReq(req));
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const result = await los.matchTutorsForRequest({
      agencyId,
      subjectArea: req.body.subjectArea,
      gradeLevel: req.body.gradeLevel,
      ageRange: req.body.ageRange,
      serviceType: req.body.serviceType || 'tutoring',
      emotionalNeeds: req.body.emotionalNeeds || []
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function draftPlanAi(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const result = await los.draftLearningPlanWithAi(req.body, actorId(req));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function approveAiArtifact(req, res, next) {
  try {
    const artifact = await los.TutoringAiArtifact.approve(req.params.artifactId, actorId(req));
    res.json({ artifact });
  } catch (e) {
    next(e);
  }
}

export async function applyAiPlanDraft(req, res, next) {
  try {
    const bundle = await los.applyApprovedPlanDraft(req.params.artifactId, actorId(req));
    res.json(bundle);
  } catch (e) {
    next(e);
  }
}

export async function searchCas(req, res, next) {
  try {
    const standards = await los.TutoringCasStandard.search({
      subjectKey: req.query.subjectKey,
      gradeBand: req.query.gradeBand,
      q: req.query.q,
      versionKey: req.query.versionKey
    });
    res.json({ standards });
  } catch (e) {
    next(e);
  }
}

export async function listEvalItems(req, res, next) {
  try {
    const items = await los.TutoringEvaluationItem.list({
      subjectKey: req.query.subjectKey,
      gradeBand: req.query.gradeBand,
      agencyId: req.query.agencyId ? Number(req.query.agencyId) : null
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
}

export async function runQuickEval(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const result = await los.runQuickEvaluation(req.body, actorId(req));
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function listAlerts(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const alerts = await los.TutoringProgressAlert.listOpenBySubject(subject.id);
    res.json({ alerts });
  } catch (e) {
    next(e);
  }
}

export async function ackAlert(req, res, next) {
  try {
    await los.TutoringProgressAlert.acknowledge(req.params.alertId, actorId(req));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function createReport(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    let report;
    if (req.body.reportType === 'multi_session') {
      report = await los.buildMultiSessionReport(subject.id, actorId(req));
    } else {
      report = await los.TutoringProgressReport.create(
        {
          agencyId: subject.agency_id,
          clientId: subject.client_id,
          studentSubjectId: subject.id,
          learningPlanId: req.body.learningPlanId,
          reportType: req.body.reportType || 'parent_summary',
          title: req.body.title || 'Progress report',
          content: req.body.content || {},
          contentHtml: req.body.contentHtml,
          status: 'draft'
        },
        actorId(req)
      );
    }
    res.status(201).json({ report });
  } catch (e) {
    next(e);
  }
}

export async function listReports(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const reports = await los.TutoringProgressReport.listBySubject(subject.id);
    res.json({ reports });
  } catch (e) {
    next(e);
  }
}

export async function publishReport(req, res, next) {
  try {
    const report = await los.TutoringProgressReport.publish(req.params.reportId, actorId(req));
    res.json({ report });
  } catch (e) {
    next(e);
  }
}

export async function previewReport(req, res, next) {
  try {
    const existing = await los.TutoringProgressReport.findById(req.params.reportId);
    if (!existing) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, existing.client_id, existing.agency_id);
    const result = await los.buildParentReportPreview(existing.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function tutorCaseloadToday(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId || agencyIdFromReq(req));
    const tutorUserId = Number(req.query.tutorUserId || req.user.id);
    const sessions = await los.getTutorCaseloadToday(agencyId, tutorUserId);
    res.json({ sessions });
  } catch (e) {
    next(e);
  }
}

export async function linkInPersonPlan(req, res, next) {
  try {
    const result = await los.linkInPersonPlanToLearningGoals(req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function createOralProbe(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const probe = await los.TutoringOralReadingProbe.create(
      {
        agencyId: subject.agency_id,
        clientId: subject.client_id,
        studentSubjectId: subject.id,
        evaluationSummaryId: req.body.evaluationSummaryId,
        sessionId: req.body.sessionId,
        passageTitle: req.body.passageTitle,
        passageText: req.body.passageText,
        wordsCorrect: req.body.wordsCorrect,
        wordsTotal: req.body.wordsTotal,
        errors: req.body.errors,
        wpm: req.body.wpm,
        accuracyPct: req.body.accuracyPct,
        sttTranscript: req.body.sttTranscript,
        sttDraftScores: req.body.sttDraftScores,
        notes: req.body.notes
      },
      actorId(req)
    );
    res.status(201).json({ probe });
  } catch (e) {
    next(e);
  }
}

export async function verifyOralProbe(req, res, next) {
  try {
    const probe = await los.TutoringOralReadingProbe.verify(req.params.probeId, actorId(req), req.body || {});
    res.json({ probe });
  } catch (e) {
    next(e);
  }
}

export async function createDocExtraction(req, res, next) {
  try {
    const { clientId } = await assertLearningClientAccess(req, req.body.clientId);
    const agencyId = Number(req.body.agencyId || agencyIdFromReq(req));
    const extraction = await los.TutoringDocumentExtraction.create(
      {
        agencyId,
        clientId,
        studentSubjectId: req.body.studentSubjectId,
        sourceLabel: req.body.sourceLabel,
        sourceDocumentId: req.body.sourceDocumentId,
        rawTextExcerpt: req.body.rawTextExcerpt,
        extracted: req.body.extracted || {},
        aiArtifactId: req.body.aiArtifactId
      },
      actorId(req)
    );
    res.status(201).json({ extraction });
  } catch (e) {
    next(e);
  }
}

export async function confirmDocExtraction(req, res, next) {
  try {
    const extraction = await los.TutoringDocumentExtraction.confirm(
      req.params.extractionId,
      actorId(req),
      req.body.extracted
    );
    res.json({ extraction });
  } catch (e) {
    next(e);
  }
}

export async function listMilestones(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const milestones = await los.TutoringPackageMilestone.listBySubject(subject.id);
    res.json({ milestones });
  } catch (e) {
    next(e);
  }
}

export async function createPractice(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const result = await los.createPracticeAssignment(
      {
        studentSubjectId: subject.id,
        planGoalId: req.body.planGoalId,
        sessionId: req.body.sessionId,
        sessionNoteId: req.body.sessionNoteId,
        itemCount: req.body.itemCount
      },
      actorId(req)
    );
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function listPracticeForSubject(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.params.subjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const assignments = await los.TutoringPracticeAssignment.listBySubject(subject.id);
    res.json({ assignments });
  } catch (e) {
    next(e);
  }
}

export async function listPracticeForClient(req, res, next) {
  try {
    const { clientId } = await assertLearningClientAccess(req, req.params.clientId);
    const assignments = await los.TutoringPracticeAssignment.listByClient(clientId, {
      status: req.query.status || null,
      limit: req.query.limit
    });
    res.json({ assignments });
  } catch (e) {
    next(e);
  }
}

export async function completePractice(req, res, next) {
  try {
    const assignment = await los.TutoringPracticeAssignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: { message: 'Not found' } });
    await assertLearningClientAccess(req, assignment.client_id, assignment.agency_id);
    const updated = await los.TutoringPracticeAssignment.complete(assignment.id);
    res.json({ assignment: updated });
  } catch (e) {
    next(e);
  }
}

export async function createAssessmentBlueprint(req, res, next) {
  try {
    let agencyId = agencyIdFromReq(req);
    let studentSubjectId = req.body.studentSubjectId || null;
    if (studentSubjectId) {
      const subject = await los.StudentSubject.findById(studentSubjectId);
      if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
      await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
      agencyId = agencyId || subject.agency_id;
      studentSubjectId = subject.id;
    }
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!req.body.subjectKey) {
      return res.status(400).json({ error: { message: 'subjectKey is required' } });
    }
    const result = await los.buildAssessmentBlueprint(
      {
        agencyId,
        studentSubjectId,
        title: req.body.title,
        subjectKey: req.body.subjectKey,
        gradeBand: req.body.gradeBand,
        evaluationPath: req.body.evaluationPath || 'quick',
        skillKeys: req.body.skillKeys || [],
        itemTypes: req.body.itemTypes || [],
        itemCount: req.body.itemCount,
        difficultyMax: req.body.difficultyMax
      },
      actorId(req)
    );
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function getAssessmentBlueprint(req, res, next) {
  try {
    const blueprint = await los.TutoringAssessmentBlueprint.findById(req.params.blueprintId);
    if (!blueprint) return res.status(404).json({ error: { message: 'Not found' } });
    if (blueprint.student_subject_id) {
      const subject = await los.StudentSubject.findById(blueprint.student_subject_id);
      if (subject) await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    }
    const ids = blueprint.selected_item_ids_json || [];
    const items = [];
    for (const id of ids) {
      const item = await los.TutoringEvaluationItem.findById(id);
      if (item) items.push(item);
    }
    res.json({ blueprint, items });
  } catch (e) {
    next(e);
  }
}

export async function updateAssessmentBlueprint(req, res, next) {
  try {
    const existing = await los.TutoringAssessmentBlueprint.findById(req.params.blueprintId);
    if (!existing) return res.status(404).json({ error: { message: 'Not found' } });
    if (existing.student_subject_id) {
      const subject = await los.StudentSubject.findById(existing.student_subject_id);
      if (subject) await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    }
    const blueprint = await los.TutoringAssessmentBlueprint.update(existing.id, req.body || {});
    res.json({ blueprint });
  } catch (e) {
    next(e);
  }
}

export async function getGuardianFeed(req, res, next) {
  try {
    const { clientId,agencyId,service } = await assertLearningClientAccess(req, req.params.clientId);
    const data = await los.getGuardianLearningSnapshot(clientId,{agencyId,providerId:service?.provider_user_id});
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getGuardianDashboard(req, res, next) {
  try {
    const { clientId,agencyId,service } = await assertLearningClientAccess(req, req.params.clientId);
    const data = await los.getGuardianTutoringDashboard(clientId,{agencyId,providerId:service?.provider_user_id});
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function tutorAssist(req, res, next) {
  try {
    const subject = await los.StudentSubject.findById(req.body.studentSubjectId);
    if (!subject) return res.status(404).json({ error: { message: 'Subject not found' } });
    await assertLearningClientAccess(req, subject.client_id, subject.agency_id);
    const result = await los.runTutorAssist(
      {
        action: req.body.action || 'explain',
        studentSubjectId: subject.id,
        planGoalId: req.body.planGoalId,
        observation: req.body.observation
      },
      actorId(req)
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function resolveClientAgencyId(clientId) {
  const Client = (await import('../models/Client.model.js')).default;
  const client = await Client.findById(clientId, { includeSensitive: false });
  if (!client) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }
  return {
    client,
    agencyId: Number(client.agency_id || client.organization_id || 0) || null
  };
}

async function listEnrolledProgramIds(clientId) {
  const pool = (await import('../config/database.js')).default;
  const [rows] = await pool.execute(
    `SELECT DISTINCT learning_class_id AS id
     FROM learning_class_client_memberships
     WHERE client_id = ?
       AND (membership_status IS NULL OR membership_status NOT IN ('removed', 'withdrawn'))`,
    [Number(clientId)]
  ).catch(() => [[]]);
  return (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
}

export async function listClientPackages(req, res, next) {
  try {
    const { clientId,agencyId } = await assertLearningClientAccess(req, req.params.clientId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });
    const enrolledProgramIds = await listEnrolledProgramIds(clientId);
    const unifiedPackages = await import('../services/unifiedPackageCatalog.service.js');
    const packages = await unifiedPackages.resolveGuardianCatalog({
      agencyId,
      businessType: req.query.businessType || 'tutoring',
      enrolledProgramIds
    });
    res.json({ ok: true, packages, enrolledProgramIds });
  } catch (e) {
    next(e);
  }
}

export async function listClientPackageEntitlements(req, res, next) {
  try {
    const { clientId,agencyId } = await assertLearningClientAccess(req, req.params.clientId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });
    const unifiedPackages = await import('../services/unifiedPackageCatalog.service.js');
    const summary = await unifiedPackages.summarizeClientPackageBalance(agencyId, clientId, {
      businessType: req.query.businessType || 'tutoring'
    });
    let legacyTokenBalance = 0;
    try {
      const LearningTokenLedger = (await import('../models/LearningTokenLedger.model.js')).default;
      const bal = await LearningTokenLedger.getBalanceByClient({ agencyId, clientId });
      legacyTokenBalance =
        Number(bal?.individualTokens || 0) + Number(bal?.groupTokens || 0);
    } catch {
      legacyTokenBalance = 0;
    }
    res.json({ ok: true, ...summary, legacyTokenBalance });
  } catch (e) {
    next(e);
  }
}

export async function checkoutClientPackage(req, res, next) {
  try {
    const { clientId,agencyId } = await assertLearningClientAccess(req, req.params.clientId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });
    if (!['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(String(req.user?.role || '').toLowerCase())) await requireResponsiblePayer(req.user.id, clientId, agencyId);
    const packageId = parseInt(req.params.packageId, 10);
    const unifiedPackages = await import('../services/unifiedPackageCatalog.service.js');
    const result = await unifiedPackages.startPackageCheckout({
      providerId:req.body?.providerId,tenantServiceId:req.body?.tenantServiceId,
      agencyId,
      packageId,
      clientId,
      purchaserUserId: req.user?.id || null,
      actorUserId: req.user?.id || null,
      paymentMode: req.body?.paymentMode || 'PAY_IN_FULL'
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function confirmClientPackageCheckout(req, res, next) {
  try {
    const { clientId,agencyId } = await assertLearningClientAccess(req, req.params.clientId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Client has no agency' } });
    if (!['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(String(req.user?.role || '').toLowerCase())) await requireResponsiblePayer(req.user.id, clientId, agencyId);
    const packageId = parseInt(req.params.packageId, 10);
    const unifiedPackages = await import('../services/unifiedPackageCatalog.service.js');
    const result = await unifiedPackages.confirmPackageCheckout({
      agencyId,
      packageId,
      clientId,
      paymentIntentId: req.body?.paymentIntentId || req.body?.payment_intent_id || null,
      purchaserUserId: req.user?.id || null,
      actorUserId: req.user?.id || null
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

async function requireTutorSession(req,sessionId,subject=null){
 const {session,klass,canModerate}=await assertLearningSessionAccess(req,sessionId);
 if(!canModerate||(['provider','provider_plus','intern','intern_plus'].includes(req.user.role)&&Number(session.provider_user_id)!==Number(req.user.id)))throw Object.assign(new Error('Assigned tutor access is required.'),{status:403});
 if(subject){
  const [[student]]=await pool.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=? AND client_id=?',[sessionId,subject.client_id]);
  if(!student||Number(subject.agency_id)!==Number(klass.organization_id))throw Object.assign(new Error('This learning guide belongs to a different student or agency.'),{status:403});
 }
 return session;
}

async function familyOfficeAccess(req,writing=false){
 const access=await assertLearningClientAccess(req,req.params.clientId);
 if(access.permissions?.canViewAppointments===false||(writing&&access.permissions?.canMessage===false))throw Object.assign(new Error('Your account does not have access to this appointment conversation.'),{status:403});
 return access;
}
export async function getGuardianOfficeStatus(req,res,next){try{const {clientId,agencyId,service}=await familyOfficeAccess(req);res.set('Cache-Control','no-store');res.json(await guardianTutoringOfficeStatus({clientId,agencyId,providerId:service?.provider_user_id||null}));}catch(e){next(e);}}
export async function postGuardianOfficeVisit(req,res,next){try{const {clientId,agencyId,service}=await familyOfficeAccess(req,req.body?.intent!=='join');res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.json(await startGuardianOfficeVisit({clientId,agencyId,providerId:service?.provider_user_id||null},req.body,req.user.id));}catch(e){next(e);}}

export async function getGuardianOfficeEntry(req,res,next){try{const {clientId,agencyId,service}=await familyOfficeAccess(req);res.set('Cache-Control','no-store');res.json(await guardianTutoringOfficeEntry({clientId,agencyId,providerId:service?.provider_user_id||null},req.query));}catch(e){next(e);}}
