import * as marriageAlignmentService from '../services/marriageAlignment.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[marriage-alignment]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Marriage alignment error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await marriageAlignmentService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestCycle(req, res) {
  try {
    const cycle = await marriageAlignmentService.createGuestCycle({
      mode: req.body?.mode || 'full',
      participantVersion: req.body?.participantVersion || 'general',
      displayName: req.body?.displayName || 'Marriage Alignment Assessment',
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
    const cycle = await marriageAlignmentService.getCycleByPartnerToken(req.params.token);
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
    const cycle = await marriageAlignmentService.upsertDomainResponse({
      token: req.params.token,
      domainKey: req.body?.domainKey,
      currentAlignmentScore: req.body?.currentAlignmentScore ?? req.body?.score,
      desiredEmphasisScore: req.body?.desiredEmphasisScore,
      collaborationConfidenceScore: req.body?.collaborationConfidenceScore,
      reflectionChips: req.body?.reflectionChips,
      personalMeaning: req.body?.personalMeaning,
      partnerExpectationGuess: req.body?.partnerExpectationGuess,
      privateNote: req.body?.privateNote,
      sharedNote: req.body?.sharedNote,
      noteVisibility: req.body?.noteVisibility,
      supportPreference: req.body?.supportPreference,
      isNotRelevant: req.body?.isNotRelevant ?? req.body?.isNotApplicable,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function submitByToken(req, res) {
  try {
    const cycle = await marriageAlignmentService.submitPartnerAssessment({
      token: req.params.token
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePrioritiesByToken(req, res) {
  try {
    const cycle = await marriageAlignmentService.updatePartnerPriorities({
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
    const cycle = await marriageAlignmentService.updateSharedPlans({
      token: req.params.token,
      selectedPriorities: req.body?.selectedPriorities,
      alignmentPlans: req.body?.alignmentPlans ?? req.body?.growthPlans
    });
    return res.json({ success: true, cycle });
  } catch (error) {
    return handleError(res, error);
  }
}
