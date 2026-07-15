import * as athleteReadinessService from '../services/athleteReadiness.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[athlete-readiness]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Athlete readiness error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await athleteReadinessService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const mode = req.body?.mode || 'daily';
    const assessment = await athleteReadinessService.createAssessment({
      agencyId: null,
      mode,
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
    const assessment = await athleteReadinessService.getAssessmentByToken(req.params.token);
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
    const assessment = await athleteReadinessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await athleteReadinessService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      score: req.body?.score,
      reflectionChips: req.body?.reflectionChips,
      bodyAreas: req.body?.bodyAreas,
      supportPreference: req.body?.supportPreference,
      note: req.body?.note,
      noteVisibility: req.body?.noteVisibility
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await athleteReadinessService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const completed = await athleteReadinessService.completeAssessment({
      assessmentId: assessment.id
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await athleteReadinessService.createAssessment({
      agencyId: req.user?.agencyId || req.body?.agencyId || null,
      athleteUserId: req.body?.athleteUserId || req.user?.id || null,
      clientId: req.body?.clientId || null,
      coachUserId: req.body?.coachUserId || null,
      mode: req.body?.mode || 'daily',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, assessment });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAssessment(req, res) {
  try {
    const assessment = await athleteReadinessService.getAssessmentById(req.params.id);
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
    const updated = await athleteReadinessService.upsertDomainResponse({
      assessmentId: Number(req.params.id),
      domainKey: req.body?.domainKey,
      score: req.body?.score,
      reflectionChips: req.body?.reflectionChips,
      bodyAreas: req.body?.bodyAreas,
      supportPreference: req.body?.supportPreference,
      note: req.body?.note,
      noteVisibility: req.body?.noteVisibility
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const completed = await athleteReadinessService.completeAssessment({
      assessmentId: Number(req.params.id)
    });
    return res.json({ success: true, assessment: completed });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const list = await athleteReadinessService.listAssessmentsForAthlete({
      agencyId: req.user?.agencyId || null,
      athleteUserId: req.user?.id || null,
      clientId: req.query?.clientId ? Number(req.query.clientId) : null
    });
    return res.json({ success: true, assessments: list });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const template = await athleteReadinessService.getDefaultTemplate({
      agencyId: req.user?.agencyId || req.query?.agencyId || null
    });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}
