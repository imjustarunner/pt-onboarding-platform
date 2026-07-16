/**
 * Sync local assessment state to guest APIs for assigned (token) sessions,
 * then call complete so deliverables generate when client_id is set.
 */
import api from '../services/api';

const quiet = { skipGlobalError: true };

export function readAccessTokenFromRoute(route) {
  return String(route?.params?.accessToken || route?.query?.token || '').trim();
}

/**
 * Standard domain-response families (most assessments).
 * payloadBuilder returns { responses, plansPayload, completePayload }
 */
export async function flushStandardGuestAssessment({
  apiPrefix,
  token,
  responses = [],
  mapResponse = (r) => r,
  plansPayload = null,
  completePayload = {}
}) {
  const t = encodeURIComponent(token);
  const base = String(apiPrefix || '').replace(/\/$/, '');
  for (const r of responses) {
    const body = mapResponse(r);
    if (!body) continue;
    await api.patch(`${base}/guest/assessments/${t}/responses`, body, quiet);
  }
  if (plansPayload) {
    await api.patch(`${base}/guest/assessments/${t}/plans`, plansPayload, quiet);
  }
  const res = await api.post(
    `${base}/guest/assessments/${t}/complete`,
    completePayload || {},
    quiet
  );
  return res.data?.assessment || null;
}

export async function flushRewardRegulation({
  token,
  responses = [],
  channelResponses = [],
  selectedPriorities = [],
  regulationPlans = [],
  frictionBoard = {}
}) {
  const t = encodeURIComponent(token);
  for (const r of responses) {
    await api.patch(
      `/reward-regulation/guest/assessments/${t}/responses`,
      {
        domainKey: r.domainKey,
        currentRegulationScore: r.currentRegulationScore,
        personalImportanceScore: r.personalImportanceScore,
        momentumScore: r.momentumScore,
        reflectionChips: r.reflectionChips,
        barriers: r.barriers,
        strengths: r.strengths,
        supportPreference: r.supportPreference,
        privateReflection: r.privateReflection,
        seasonStatus: r.seasonStatus,
        preferNotToAnswer: r.preferNotToAnswer
      },
      quiet
    );
  }
  for (const c of channelResponses) {
    await api.patch(
      `/reward-regulation/guest/assessments/${t}/channels`,
      {
        channelKey: c.channelKey,
        isRelevant: c.isRelevant,
        pullStrengthScore: c.pullStrengthScore,
        frequencyScore: c.frequencyScore,
        costScore: c.costScore,
        valueScore: c.valueScore,
        controlScore: c.controlScore,
        isPrivate: c.isPrivate,
        notes: c.notes,
        supportPreference: c.supportPreference,
        preferNotToAnswer: c.preferNotToAnswer
      },
      quiet
    );
  }
  await api.patch(
    `/reward-regulation/guest/assessments/${t}/plans`,
    {
      selectedPriorities,
      regulationPlans,
      frictionBoard
    },
    quiet
  );
  const res = await api.post(
    `/reward-regulation/guest/assessments/${t}/complete`,
    { selectedPriorities, regulationPlans, frictionBoard },
    quiet
  );
  return res.data?.assessment || null;
}

export async function loadAssignedAssessment(apiPrefix, token) {
  const t = encodeURIComponent(token);
  const base = String(apiPrefix || '').replace(/\/$/, '');
  const res = await api.get(`${base}/guest/assessments/${t}`, quiet);
  return res.data?.assessment || null;
}

/** Values Alignment uses /public/:token routes (not guest/assessments). */
export async function flushValuesAlignment({
  token,
  responses = [],
  priorityKeys = [],
  commitments = [],
  context = {}
}) {
  const t = encodeURIComponent(token);
  for (const r of responses) {
    const valueKey = r.valueKey || r.key;
    if (!valueKey) continue;
    await api.put(
      `/values-alignment/public/${t}/values/${encodeURIComponent(valueKey)}`,
      {
        currentAlignmentScore: r.currentAlignmentScore ?? r.score,
        desiredEmphasisScore: r.desiredEmphasisScore,
        confidenceToChangeScore: r.confidenceToChangeScore,
        personalDefinition: r.personalDefinition,
        reflectionChips: r.reflectionChips,
        note: r.note,
        preferNotToAnswer: r.preferNotToAnswer
      },
      quiet
    );
  }
  for (const c of commitments) {
    await api.post(
      `/values-alignment/public/${t}/commitments`,
      c,
      quiet
    );
  }
  const res = await api.post(
    `/values-alignment/public/${t}/complete`,
    { priorityValueKeys: priorityKeys, context },
    quiet
  );
  return res.data?.assessment || null;
}
