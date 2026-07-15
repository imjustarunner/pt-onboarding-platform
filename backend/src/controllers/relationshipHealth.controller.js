import * as relationshipHealthService from '../services/relationshipHealth.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[relationship-health]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Relationship health error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await relationshipHealthService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestCycle(req, res) {
  try {
    const cycle = await relationshipHealthService.createGuestCycle({
      mode: req.body?.mode || 'full',
      displayName: req.body?.displayName || 'Relationship Health Assessment',
      partnerALabel: req.body?.partnerALabel || 'Partner A',
      partnerBLabel: req.body?.partnerBLabel || 'Partner B',
      context: req.body?.context || {}
    });
    return res.status(201).json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getByToken(req, res) {
  try {
    const cycle = await relationshipHealthService.getCycleByPartnerToken(req.params.token);
    if (!cycle) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function upsertResponseByToken(req, res) {
  try {
    const cycle = await relationshipHealthService.upsertDomainResponse({
      token: req.params.token,
      domainKey: req.body?.domainKey,
      currentExperienceScore: req.body?.currentExperienceScore,
      importanceScore: req.body?.importanceScore,
      desiredExperienceScore: req.body?.desiredExperienceScore,
      reflectionChips: req.body?.reflectionChips,
      privateNote: req.body?.privateNote,
      sharedNote: req.body?.sharedNote,
      noteVisibility: req.body?.noteVisibility,
      supportPreference: req.body?.supportPreference,
      isNotApplicable: req.body?.isNotApplicable
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function submitByToken(req, res) {
  try {
    const cycle = await relationshipHealthService.submitPartnerAssessment({
      token: req.params.token
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePrioritiesByToken(req, res) {
  try {
    const cycle = await relationshipHealthService.updatePartnerPriorities({
      token: req.params.token,
      selectedPriorities: req.body?.selectedPriorities
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const cycle = await relationshipHealthService.updateSharedPlans({
      token: req.params.token,
      selectedPriorities: req.body?.selectedPriorities,
      growthPlans: req.body?.growthPlans
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}
