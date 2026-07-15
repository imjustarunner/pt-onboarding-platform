import * as digitalWellnessService from '../services/digitalWellness.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[digital-wellness]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Digital wellness error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await digitalWellnessService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await digitalWellnessService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general-adult',
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
    const assessment = await digitalWellnessService.getAssessmentByToken(req.params.token);
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
    const assessment = await digitalWellnessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await digitalWellnessService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentWellnessScore: req.body?.currentWellnessScore ?? req.body?.score,
      intentionalControlScore: req.body?.intentionalControlScore,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      reflectionChips: req.body?.reflectionChips,
      valueProvided: req.body?.valueProvided,
      barriers: req.body?.barriers,
      supportPreference: req.body?.supportPreference,
      privateNote: req.body?.privateNote ?? req.body?.note,
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
    const assessment = await digitalWellnessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await digitalWellnessService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      digitalWellnessPlans: req.body?.digitalWellnessPlans,
      experiments: req.body?.experiments,
      dayflow: req.body?.dayflow,
      usageSummary: req.body?.usageSummary,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await digitalWellnessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await digitalWellnessService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      digitalWellnessPlans: req.body?.digitalWellnessPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await digitalWellnessService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await digitalWellnessService.createAssessment({
      agencyId: req.user?.agencyId || req.user?.agency_id || null,
      participantUserId: req.body?.participantUserId || req.user?.id,
      clientId: req.body?.clientId,
      counselorUserId: req.body?.counselorUserId,
      coachUserId: req.body?.coachUserId,
      caregiverUserId: req.body?.caregiverUserId,
      educatorUserId: req.body?.educatorUserId,
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
    const assessment = await digitalWellnessService.getAssessmentById(req.params.id);
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
    const updated = await digitalWellnessService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentWellnessScore: req.body?.currentWellnessScore ?? req.body?.score,
      intentionalControlScore: req.body?.intentionalControlScore,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      reflectionChips: req.body?.reflectionChips,
      valueProvided: req.body?.valueProvided,
      barriers: req.body?.barriers,
      supportPreference: req.body?.supportPreference,
      privateNote: req.body?.privateNote ?? req.body?.note,
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
    const updated = await digitalWellnessService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      digitalWellnessPlans: req.body?.digitalWellnessPlans,
      experiments: req.body?.experiments,
      dayflow: req.body?.dayflow,
      usageSummary: req.body?.usageSummary,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await digitalWellnessService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      digitalWellnessPlans: req.body?.digitalWellnessPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await digitalWellnessService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
