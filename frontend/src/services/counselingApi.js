import api from './api.js';

export async function listActivities(params = {}) {
  const { data } = await api.get('/counseling/activities', { params, skipGlobalLoading: true });
  return data?.activities || [];
}

/** Start an embedded activity for solo practice (no video / no client). */
export async function startPracticeActivity(activityId, { agencyId, setup } = {}) {
  const { data } = await api.post(`/counseling/activities/${encodeURIComponent(activityId)}/practice`, {
    agencyId,
    setup
  });
  return data;
}

export async function createCounselingSession(payload) {
  const { data } = await api.post('/counseling/sessions', payload);
  return data;
}

export async function openCounselingFromAppointment(payload) {
  const { data } = await api.post('/counseling/sessions/from-appointment', payload);
  return data;
}

export async function getCounselingShareLink(sessionId) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}/share-link`, {
    skipGlobalLoading: true
  });
  return data;
}

export async function acceptCounselingInvite(token) {
  const { data } = await api.post(`/counseling/invite/${token}/accept`);
  return data;
}

export async function listCounselingSessions(params = {}) {
  const { data } = await api.get('/counseling/sessions', { params, skipGlobalLoading: true });
  return data?.sessions || [];
}

export async function getCounselingSession(sessionId) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}`, { skipGlobalLoading: true });
  return data;
}

export async function joinCounselingSession(sessionId) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/join`);
  return data;
}

export async function getCounselingVideoToken(sessionId, { recreateRoom = false } = {}) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}/video-token`, {
    params: recreateRoom ? { recreateRoom: '1' } : undefined,
    skipGlobalLoading: true
  });
  return data;
}

export async function endCounselingSession(sessionId) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/end`);
  return data;
}

export async function listCounselingNotes(sessionId) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}/notes`, {
    skipGlobalLoading: true
  });
  return data?.notes || [];
}

export async function createCounselingNote(sessionId, payload) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/notes`, payload);
  return data?.note;
}

export async function listCounselingChat(sessionId, afterId = 0) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}/chat`, {
    params: { afterId },
    skipGlobalLoading: true
  });
  return data?.messages || [];
}

export async function postCounselingChat(sessionId, body) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/chat`, { body });
  return data?.message;
}

export async function getActivityRuntime(sessionId) {
  const { data } = await api.get(`/counseling/sessions/${sessionId}/activity`, {
    skipGlobalLoading: true
  });
  return data?.runtime || null;
}

export async function inviteActivity(sessionId, activityId) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/invite`, {
    activityId
  });
  return data?.runtime;
}

export async function respondActivity(sessionId, action) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/respond`, {
    action
  });
  return data?.runtime;
}

export async function patchActivityRuntime(sessionId, payload) {
  const { data } = await api.patch(`/counseling/sessions/${sessionId}/activity`, payload, {
    skipGlobalLoading: true
  });
  return data?.runtime;
}

export async function pauseActivity(sessionId, reason, checkpoint = undefined) {
  const body = { reason };
  if (checkpoint !== undefined) body.checkpoint = checkpoint;
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/pause`, body);
  return data?.runtime;
}

export async function resumeActivity(sessionId) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/resume`);
  return data?.runtime;
}

export async function exitActivity(sessionId, payload = {}) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/exit`, payload);
  return data?.runtime;
}

/** Server-authoritative Emotion Dice roll / Phase 3 draw|deal */
export async function rollActivity(sessionId, payload = {}) {
  const { data } = await api.post(`/counseling/sessions/${sessionId}/activity/roll`, payload);
  return data;
}
