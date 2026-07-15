import * as mensLifeService from '../services/mensLife.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[mens-life]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || "Men's life assessment error"
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await mensLifeService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await mensLifeService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'married-men',
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
    const assessment = await mensLifeService.getAssessmentByToken(req.params.token);
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
    const assessment = await mensLifeService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await mensLifeService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentStrengthScore: req.body?.currentStrengthScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      currentMomentumScore: req.body?.currentMomentumScore ?? req.body?.momentumScore,
      roleDemandScore: req.body?.roleDemandScore,
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
    const assessment = await mensLifeService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await mensLifeService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      developmentPlans: req.body?.developmentPlans,
      weeklyCommitments: req.body?.weeklyCommitments,
      accountabilityPlans: req.body?.accountabilityPlans,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await mensLifeService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await mensLifeService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      developmentPlans: req.body?.developmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await mensLifeService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await mensLifeService.createAssessment({
      agencyId: req.user?.agencyId || req.user?.agency_id || null,
      participantUserId: req.body?.participantUserId || req.user?.id,
      clientId: req.body?.clientId,
      counselorUserId: req.body?.counselorUserId,
      coachUserId: req.body?.coachUserId,
      mentorUserId: req.body?.mentorUserId,
      spiritualLeaderUserId: req.body?.spiritualLeaderUserId,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'married-men',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await mensLifeService.getAssessmentById(req.params.id);
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
    const updated = await mensLifeService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentStrengthScore: req.body?.currentStrengthScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      currentMomentumScore: req.body?.currentMomentumScore ?? req.body?.momentumScore,
      roleDemandScore: req.body?.roleDemandScore,
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
    const updated = await mensLifeService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      developmentPlans: req.body?.developmentPlans,
      weeklyCommitments: req.body?.weeklyCommitments,
      accountabilityPlans: req.body?.accountabilityPlans,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await mensLifeService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      developmentPlans: req.body?.developmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await mensLifeService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
