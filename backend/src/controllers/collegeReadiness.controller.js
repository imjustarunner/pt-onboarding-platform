import * as collegeReadinessService from '../services/collegeReadiness.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[college-readiness]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'College readiness error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await collegeReadinessService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await collegeReadinessService.createAssessment({
      agencyId: null,
      mode: req.body?.mode || 'full',
      studentVersion: req.body?.studentVersion || 'senior',
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
    const assessment = await collegeReadinessService.getAssessmentByToken(req.params.token);
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
    const assessment = await collegeReadinessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await collegeReadinessService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      readinessScore: req.body?.readinessScore,
      confidenceScore: req.body?.confidenceScore,
      supportAvailabilityScore: req.body?.supportAvailabilityScore,
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
    const assessment = await collegeReadinessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await collegeReadinessService.updatePlansAndChecklist({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      launchPlans: req.body?.launchPlans,
      checklist: req.body?.checklist,
      deadlines: req.body?.deadlines,
      firstSemesterPlan: req.body?.firstSemesterPlan
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await collegeReadinessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const completed = await collegeReadinessService.completeAssessment({
      assessmentId: assessment.id
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await collegeReadinessService.createAssessment({
      agencyId: req.user?.agencyId || req.body?.agencyId || null,
      studentUserId: req.body?.studentUserId || req.user?.id || null,
      clientId: req.body?.clientId || null,
      counselorUserId: req.body?.counselorUserId || null,
      mode: req.body?.mode || 'full',
      studentVersion: req.body?.studentVersion || 'senior',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await collegeReadinessService.getAssessmentById(req.params.id);
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
    const updated = await collegeReadinessService.upsertDomainResponse({
      assessmentId: Number(req.params.id),
      domainKey: req.body?.domainKey,
      readinessScore: req.body?.readinessScore,
      confidenceScore: req.body?.confidenceScore,
      supportAvailabilityScore: req.body?.supportAvailabilityScore,
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
    const updated = await collegeReadinessService.updatePlansAndChecklist({
      assessmentId: Number(req.params.id),
      selectedPriorities: req.body?.selectedPriorities,
      launchPlans: req.body?.launchPlans,
      checklist: req.body?.checklist,
      deadlines: req.body?.deadlines,
      firstSemesterPlan: req.body?.firstSemesterPlan
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const completed = await collegeReadinessService.completeAssessment({
      assessmentId: Number(req.params.id)
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const list = await collegeReadinessService.listAssessmentsForStudent({
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
    const template = await collegeReadinessService.getDefaultTemplate({
      agencyId: req.user?.agencyId || req.query?.agencyId || null
    });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}
