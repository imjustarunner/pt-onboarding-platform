import * as personalFulfillmentService from '../services/personalFulfillment.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[personal-fulfillment]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Personal fulfillment error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await personalFulfillmentService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await personalFulfillmentService.createAssessment({
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
    const assessment = await personalFulfillmentService.getAssessmentByToken(req.params.token);
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
    const assessment = await personalFulfillmentService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await personalFulfillmentService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentFulfillmentScore: req.body?.currentFulfillmentScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      growthMomentumScore: req.body?.growthMomentumScore,
      reflectionChips: req.body?.reflectionChips,
      fulfillmentSources: req.body?.fulfillmentSources,
      barriers: req.body?.barriers,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateNote: req.body?.privateNote ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility ?? req.body?.reflectionVisibility,
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
    const assessment = await personalFulfillmentService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await personalFulfillmentService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      fulfillmentPlans: req.body?.fulfillmentPlans,
      fulfillmentSourcesMap: req.body?.fulfillmentSourcesMap,
      experiments: req.body?.experiments,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await personalFulfillmentService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await personalFulfillmentService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      fulfillmentPlans: req.body?.fulfillmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await personalFulfillmentService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await personalFulfillmentService.createAssessment({
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
    const assessment = await personalFulfillmentService.getAssessmentById(req.params.id);
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
    const updated = await personalFulfillmentService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentFulfillmentScore: req.body?.currentFulfillmentScore ?? req.body?.score,
      personalImportanceScore: req.body?.personalImportanceScore ?? req.body?.importanceScore,
      growthMomentumScore: req.body?.growthMomentumScore,
      reflectionChips: req.body?.reflectionChips,
      fulfillmentSources: req.body?.fulfillmentSources,
      barriers: req.body?.barriers,
      personalDefinition: req.body?.personalDefinition,
      supportPreference: req.body?.supportPreference,
      privateNote: req.body?.privateNote ?? req.body?.note,
      noteVisibility: req.body?.noteVisibility ?? req.body?.reflectionVisibility,
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
    const updated = await personalFulfillmentService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      fulfillmentPlans: req.body?.fulfillmentPlans,
      fulfillmentSourcesMap: req.body?.fulfillmentSourcesMap,
      experiments: req.body?.experiments,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await personalFulfillmentService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      fulfillmentPlans: req.body?.fulfillmentPlans || []
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await personalFulfillmentService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
