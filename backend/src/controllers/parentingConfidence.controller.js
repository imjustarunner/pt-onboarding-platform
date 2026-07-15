import * as parentingConfidenceService from '../services/parentingConfidence.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[parenting-confidence]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Parenting confidence assessment error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await parentingConfidenceService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await parentingConfidenceService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general-caregiver',
      context: {
        guest: true,
        assessmentDate: new Date().toISOString().slice(0, 10),
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
    const assessment = await parentingConfidenceService.getAssessmentByToken(req.params.token);
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
    const assessment = await parentingConfidenceService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await parentingConfidenceService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentCapacityScore: req.body?.currentCapacityScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      supportNeedScore: req.body?.supportNeedScore,
      demandLevelScore: req.body?.demandLevelScore,
      reflectionChips: req.body?.reflectionChips,
      currentSupports: req.body?.currentSupports,
      barriers: req.body?.barriers,
      personalStrengths: req.body?.personalStrengths,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateReflection: req.body?.privateReflection ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility,
      seasonStatus: req.body?.seasonStatus,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const assessment = await parentingConfidenceService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await parentingConfidenceService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      supportPlans: req.body?.supportPlans ?? req.body?.developmentPlans,
      weeklyCommitments: req.body?.weeklyCommitments,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await parentingConfidenceService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await parentingConfidenceService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      supportPlans: req.body?.supportPlans || req.body?.developmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await parentingConfidenceService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await parentingConfidenceService.createAssessment({
      agencyId: req.user?.agencyId || req.user?.agency_id || null,
      participantUserId: req.body?.participantUserId || req.user?.id,
      clientId: req.body?.clientId,
      counselorUserId: req.body?.counselorUserId,
      coachUserId: req.body?.coachUserId,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general-caregiver',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await parentingConfidenceService.getAssessmentById(req.params.id);
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
    const updated = await parentingConfidenceService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentCapacityScore: req.body?.currentCapacityScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      supportNeedScore: req.body?.supportNeedScore,
      demandLevelScore: req.body?.demandLevelScore,
      reflectionChips: req.body?.reflectionChips,
      currentSupports: req.body?.currentSupports,
      barriers: req.body?.barriers,
      personalStrengths: req.body?.personalStrengths,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateReflection: req.body?.privateReflection ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility,
      seasonStatus: req.body?.seasonStatus,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlans(req, res) {
  try {
    const updated = await parentingConfidenceService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      supportPlans: req.body?.supportPlans ?? req.body?.developmentPlans,
      weeklyCommitments: req.body?.weeklyCommitments,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await parentingConfidenceService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      supportPlans: req.body?.supportPlans || req.body?.developmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await parentingConfidenceService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
