import * as rewardRegulationService from '../services/rewardRegulation.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('[reward-regulation]', error);
  }
  return res.status(status).json({
    success: false,
    error: error?.message || 'Reward Regulation assessment error'
  });
}

export async function getGuestTemplate(req, res) {
  try {
    const template = await rewardRegulationService.getDefaultTemplate({});
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createGuestAssessment(req, res) {
  try {
    const assessment = await rewardRegulationService.createAssessment({
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
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
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
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await rewardRegulationService.upsertDomainResponse({
      assessmentId: assessment.id,
      domainKey: req.body?.domainKey,
      currentRegulationScore:
        req.body?.currentRegulationScore ?? req.body?.score ?? req.body?.currentPerformanceScore,
      personalImportanceScore:
        req.body?.personalImportanceScore ?? req.body?.priorityScore ?? req.body?.personalPriorityScore,
      momentumScore: req.body?.momentumScore ?? req.body?.momentum,
      reflectionChips: req.body?.reflectionChips,
      barriers: req.body?.barriers,
      strengths: req.body?.strengths ?? req.body?.personalStrengths,
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

export async function upsertChannelByToken(req, res) {
  try {
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await rewardRegulationService.upsertChannelResponse({
      assessmentId: assessment.id,
      channelKey: req.body?.channelKey,
      isRelevant: req.body?.isRelevant,
      pullStrengthScore: req.body?.pullStrengthScore ?? req.body?.pull,
      frequencyScore: req.body?.frequencyScore ?? req.body?.frequency,
      costScore: req.body?.costScore ?? req.body?.cost,
      valueScore: req.body?.valueScore ?? req.body?.value,
      controlScore: req.body?.controlScore ?? req.body?.control,
      isPrivate: req.body?.isPrivate,
      notes: req.body?.notes,
      supportPreference: req.body?.supportPreference,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlansByToken(req, res) {
  try {
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await rewardRegulationService.updatePlans({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities,
      regulationPlans: req.body?.regulationPlans ?? req.body?.commitmentPlans,
      weeklyCheckins: req.body?.weeklyCheckins,
      frictionBoard: req.body?.frictionBoard,
      selectedChannels: req.body?.selectedChannels,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeByToken(req, res) {
  try {
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await rewardRegulationService.completeAssessment({
      assessmentId: assessment.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      regulationPlans: req.body?.regulationPlans || req.body?.commitmentPlans || [],
      frictionBoard: req.body?.frictionBoard || {}
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function weeklyCheckinByToken(req, res) {
  try {
    const assessment = await rewardRegulationService.getAssessmentByToken(req.params.token);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    const updated = await rewardRegulationService.addWeeklyCheckin({
      assessmentId: assessment.id,
      note: req.body?.note,
      ratings: req.body?.ratings,
      domainKeys: req.body?.domainKeys
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getTemplate(req, res) {
  try {
    const agencyId = req.user?.agencyId || req.user?.agency_id || null;
    const template = await rewardRegulationService.getDefaultTemplate({ agencyId });
    return res.json({ success: true, template });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAssessment(req, res) {
  try {
    const assessment = await rewardRegulationService.createAssessment({
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
    const assessment = await rewardRegulationService.getAssessmentById(req.params.id);
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
    const updated = await rewardRegulationService.upsertDomainResponse({
      assessmentId: req.params.id,
      domainKey: req.body?.domainKey,
      currentRegulationScore:
        req.body?.currentRegulationScore ?? req.body?.score ?? req.body?.currentPerformanceScore,
      personalImportanceScore:
        req.body?.personalImportanceScore ?? req.body?.priorityScore ?? req.body?.personalPriorityScore,
      momentumScore: req.body?.momentumScore ?? req.body?.momentum,
      reflectionChips: req.body?.reflectionChips,
      barriers: req.body?.barriers,
      strengths: req.body?.strengths ?? req.body?.personalStrengths,
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

export async function upsertChannel(req, res) {
  try {
    const updated = await rewardRegulationService.upsertChannelResponse({
      assessmentId: req.params.id,
      channelKey: req.body?.channelKey,
      isRelevant: req.body?.isRelevant,
      pullStrengthScore: req.body?.pullStrengthScore ?? req.body?.pull,
      frequencyScore: req.body?.frequencyScore ?? req.body?.frequency,
      costScore: req.body?.costScore ?? req.body?.cost,
      valueScore: req.body?.valueScore ?? req.body?.value,
      controlScore: req.body?.controlScore ?? req.body?.control,
      isPrivate: req.body?.isPrivate,
      notes: req.body?.notes,
      supportPreference: req.body?.supportPreference,
      preferNotToAnswer: req.body?.preferNotToAnswer
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updatePlans(req, res) {
  try {
    const updated = await rewardRegulationService.updatePlans({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities,
      regulationPlans: req.body?.regulationPlans ?? req.body?.commitmentPlans,
      weeklyCheckins: req.body?.weeklyCheckins,
      frictionBoard: req.body?.frictionBoard,
      selectedChannels: req.body?.selectedChannels,
      context: req.body?.context
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function completeAssessment(req, res) {
  try {
    const updated = await rewardRegulationService.completeAssessment({
      assessmentId: req.params.id,
      selectedPriorities: req.body?.selectedPriorities || [],
      regulationPlans: req.body?.regulationPlans || req.body?.commitmentPlans || [],
      frictionBoard: req.body?.frictionBoard || {}
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function weeklyCheckin(req, res) {
  try {
    const updated = await rewardRegulationService.addWeeklyCheckin({
      assessmentId: req.params.id,
      note: req.body?.note,
      ratings: req.body?.ratings,
      domainKeys: req.body?.domainKeys
    });
    return res.json({ success: true, assessment: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listMine(req, res) {
  try {
    const rows = await rewardRegulationService.listSubjectAssessments({
      participantUserId: req.user?.id
    });
    return res.json({ success: true, assessments: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
