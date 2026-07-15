import * as teenWellBeingService from '../services/teenWellBeing.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[teen-wellbeing]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Teen well-being error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await teenWellBeingService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await teenWellBeingService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      ageVersion: req.body?.ageVersion || 'ages-15-to-18',
      setting: req.body?.setting || 'self-guided',
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
    const assessment = await teenWellBeingService.getAssessmentByToken(req.params.token);
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
    const assessment = await teenWellBeingService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await teenWellBeingService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentExperienceScore: req.body?.currentExperienceScore ?? req.body?.score,
      importanceScore: req.body?.importanceScore,
      supportNeedScore: req.body?.supportNeedScore,
      reflectionChips: req.body?.reflectionChips,
      supportPreference: req.body?.supportPreference,
      writtenReflection: req.body?.writtenReflection ?? req.body?.note,
      reflectionVisibility: req.body?.reflectionVisibility,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const assessment = await teenWellBeingService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await teenWellBeingService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      wellbeingPlans: req.body?.wellbeingPlans,
      supportNetwork: req.body?.supportNetwork,
      weeklyCheckIns: req.body?.weeklyCheckIns,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await teenWellBeingService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await teenWellBeingService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      wellbeingPlans: req.body?.wellbeingPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await teenWellBeingService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await teenWellBeingService.createAssessment({
      agencyId: req.user?.agencyId || req.user?.agency_id || null,
      participantUserId: req.body?.participantUserId || req.user?.id,
      clientId: req.body?.clientId,
      counselorUserId: req.body?.counselorUserId,
      coachUserId: req.body?.coachUserId,
      mode: req.body?.mode || 'full',
      ageVersion: req.body?.ageVersion || 'ages-15-to-18',
      setting: req.body?.setting || 'counseling',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await teenWellBeingService.getAssessmentById(req.params.id);
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
    const updated = await teenWellBeingService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentExperienceScore: req.body?.currentExperienceScore ?? req.body?.score,
      importanceScore: req.body?.importanceScore,
      supportNeedScore: req.body?.supportNeedScore,
      reflectionChips: req.body?.reflectionChips,
      supportPreference: req.body?.supportPreference,
      writtenReflection: req.body?.writtenReflection ?? req.body?.note,
      reflectionVisibility: req.body?.reflectionVisibility,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlans(req, res) {
  try {
    const updated = await teenWellBeingService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      wellbeingPlans: req.body?.wellbeingPlans,
      supportNetwork: req.body?.supportNetwork,
      weeklyCheckIns: req.body?.weeklyCheckIns,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await teenWellBeingService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      wellbeingPlans: req.body?.wellbeingPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await teenWellBeingService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
