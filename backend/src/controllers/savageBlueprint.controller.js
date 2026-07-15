import * as savageBlueprintService from '../services/savageBlueprint.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[savage-blueprint]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Savage Blueprint assessment error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await savageBlueprintService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await savageBlueprintService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general-adult',
      context: {
        guest: true,
        assessmentDate: new Date().toISOString().slice(0, 10),
        fatherhoodApplicable: req.body?.context?.fatherhoodApplicable !== false,
        ...(req.body?.context || {})
      }
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getByToken(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    return res.json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function upsertResponseByToken(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await savageBlueprintService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentPerformanceScore:
        req.body?.currentPerformanceScore ?? req.body?.score ?? req.body?.currentPracticeScore,
      personalPriorityScore:
        req.body?.personalPriorityScore ?? req.body?.priorityScore ?? req.body?.personalImportanceScore,
      momentumScore: req.body?.momentumScore ?? req.body?.momentum,
      effortCostScore: req.body?.effortCostScore ?? req.body?.effortCost,
      reflectionChips: req.body?.reflectionChips,
      barriers: req.body?.barriers,
      personalStrengths: req.body?.personalStrengths,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateReflection: req.body?.privateReflection ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility,
      seasonStatus: req.body?.seasonStatus,
      preferNotToAnswer: req.body?.preferNotToAnswer,
      isNotApplicable: req.body?.isNotApplicable
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await savageBlueprintService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      commitmentPlans: req.body?.commitmentPlans ?? req.body?.developmentPlans,
      weeklyCheckins: req.body?.weeklyCheckins,
      focusBoard: req.body?.focusBoard,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await savageBlueprintService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      commitmentPlans: req.body?.commitmentPlans || req.body?.developmentPlans || [],
      focusBoard: req.body?.focusBoard || {}
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function weeklyCheckinByToken(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await savageBlueprintService.addWeeklyCheckin({
      assessmentId: assessment.id,
      note: req.body?.note,
      ratings: req.body?.ratings,
      domainKeys: req.body?.domainKeys
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await savageBlueprintService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await savageBlueprintService.createAssessment({
      agencyId: req.user?.agencyId || req.user?.agency_id || null,
      participantUserId: req.body?.participantUserId || req.user?.id,
      clientId: req.body?.clientId,
      counselorUserId: req.body?.counselorUserId,
      coachUserId: req.body?.coachUserId,
      mentorUserId: req.body?.mentorUserId,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general-adult',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await savageBlueprintService.getAssessmentById(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    return res.json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function upsertResponse(req, res) {
  try {
    const updated = await savageBlueprintService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentPerformanceScore:
        req.body?.currentPerformanceScore ?? req.body?.score ?? req.body?.currentPracticeScore,
      personalPriorityScore:
        req.body?.personalPriorityScore ?? req.body?.priorityScore ?? req.body?.personalImportanceScore,
      momentumScore: req.body?.momentumScore ?? req.body?.momentum,
      effortCostScore: req.body?.effortCostScore ?? req.body?.effortCost,
      reflectionChips: req.body?.reflectionChips,
      barriers: req.body?.barriers,
      personalStrengths: req.body?.personalStrengths,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateReflection: req.body?.privateReflection ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility,
      seasonStatus: req.body?.seasonStatus,
      preferNotToAnswer: req.body?.preferNotToAnswer,
      isNotApplicable: req.body?.isNotApplicable
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlans(req, res) {
  try {
    const updated = await savageBlueprintService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      commitmentPlans: req.body?.commitmentPlans ?? req.body?.developmentPlans,
      weeklyCheckins: req.body?.weeklyCheckins,
      focusBoard: req.body?.focusBoard,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await savageBlueprintService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      commitmentPlans: req.body?.commitmentPlans || req.body?.developmentPlans || [],
      focusBoard: req.body?.focusBoard || {}
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function weeklyCheckin(req, res) {
  try {
    const updated = await savageBlueprintService.addWeeklyCheckin({
      assessmentId: req.params.id,
      note: req.body?.note,
      ratings: req.body?.ratings,
      domainKeys: req.body?.domainKeys
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await savageBlueprintService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
