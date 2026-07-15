import * as studentSuccessService from '../services/studentSuccess.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[student-success]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Student success error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await studentSuccessService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await studentSuccessService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      educationLevel: req.body?.educationLevel || 'high-school',
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
    const assessment = await studentSuccessService.getAssessmentByToken(req.params.token);
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
    const assessment = await studentSuccessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await studentSuccessService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      score: req.body?.score,
      importanceScore: req.body?.importanceScore,
      confidenceScore: req.body?.confidenceScore,
      reflectionChips: req.body?.reflectionChips,
      supportPreference: req.body?.supportPreference,
      note: req.body?.note,
      noteVisibility: req.body?.noteVisibility
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const assessment = await studentSuccessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await studentSuccessService.updatePrioritiesAndPlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      successPlans: req.body?.successPlans
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await studentSuccessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const completed = await studentSuccessService.completeAssessment({
      assessmentId: assessment.id
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await studentSuccessService.createAssessment({
      agencyId: req.user?.agencyId || req.body?.agencyId || null,
      studentUserId: req.body?.studentUserId || req.user?.id || null,
      clientId: req.body?.clientId || null,
      coachUserId: req.body?.coachUserId || null,
      mode: req.body?.mode || 'full',
      educationLevel: req.body?.educationLevel || 'high-school',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await studentSuccessService.getAssessmentById(req.params.id);
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
    const updated = await studentSuccessService.upsertDomainResponse({
      assessmentId: Number(req.params.id),
      domainKey: req.body?.domainKey,
      score: req.body?.score,
      importanceScore: req.body?.importanceScore,
      confidenceScore: req.body?.confidenceScore,
      reflectionChips: req.body?.reflectionChips,
      supportPreference: req.body?.supportPreference,
      note: req.body?.note,
      noteVisibility: req.body?.noteVisibility
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlans(req, res) {
  try {
    const updated = await studentSuccessService.updatePrioritiesAndPlans({
      assessmentId: Number(req.params.id),
      selectedPriorities: req.body?.selectedPriorities,
      successPlans: req.body?.successPlans
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const completed = await studentSuccessService.completeAssessment({
      assessmentId: Number(req.params.id)
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const list = await studentSuccessService.listAssessmentsForStudent({
      agencyId: req.user?.agencyId || null,
      studentUserId: req.user?.id || null,
      clientId: req.query?.clientId ? Number(req.query.clientId) : null
    });
    return res.json({ success: true, assessments: list });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const template = await studentSuccessService.getDefaultTemplate({
      agencyId: req.user?.agencyId || req.query?.agencyId || null
    });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}
