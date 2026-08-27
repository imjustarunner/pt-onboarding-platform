import api from './api';

const BASE = '/tutoring-learning-os';

export async function fetchTutoringTaxonomy() {
  const { data } = await api.get(`${BASE}/taxonomy`);
  return data;
}

export async function fetchLearningOverview(clientId) {
  const { data } = await api.get(`${BASE}/clients/${clientId}/overview`);
  return data;
}

export async function enrollSubject(payload) {
  const { data } = await api.post(`${BASE}/subjects`, payload);
  return data;
}

export async function saveBaseline(payload) {
  const { data } = await api.post(`${BASE}/baselines`, payload);
  return data;
}

export async function saveLearningPlan(payload) {
  const { data } = await api.post(`${BASE}/plans`, payload);
  return data;
}

export async function approveLearningPlan(planId) {
  const { data } = await api.post(`${BASE}/plans/${planId}/approve`);
  return data;
}

export async function getLearningPlan(planId) {
  const { data } = await api.get(`${BASE}/plans/${planId}`);
  return data;
}

export async function listSubjectPlans(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/plans`);
  return data;
}

export async function generateSessionBrief(payload) {
  const { data } = await api.post(`${BASE}/session-briefs`, payload);
  return data;
}

export async function getSessionBrief(sessionId) {
  const { data } = await api.get(`${BASE}/sessions/${sessionId}/brief`);
  return data;
}

export async function updateSessionBrief(briefId, payload) {
  const { data } = await api.patch(`${BASE}/session-briefs/${briefId}`, payload);
  return data;
}

export async function saveSessionNote(payload) {
  const { data } = await api.post(`${BASE}/session-notes`, payload);
  return data;
}

export async function getSessionNote(sessionId) {
  const { data } = await api.get(`${BASE}/sessions/${sessionId}/note`);
  return data;
}

export async function fetchEvidence(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/evidence`);
  return data;
}

export async function fetchSubjectWorkspace(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/workspace`);
  return data;
}

export async function fetchGoalMastery(goalId) {
  const { data } = await api.get(`${BASE}/goals/${goalId}/mastery`);
  return data;
}

export async function recomputeGoalMastery(goalId, payload = {}) {
  const { data } = await api.post(`${BASE}/goals/${goalId}/mastery/recompute`, payload);
  return data;
}

export async function previewProgressReport(reportId) {
  const { data } = await api.get(`${BASE}/reports/${reportId}/preview`);
  return data;
}

export async function fetchComfort(agencyId, userId) {
  const { data } = await api.get(`${BASE}/agencies/${agencyId}/users/${userId}/comfort`);
  return data;
}

export async function saveComfort(agencyId, userId, payload) {
  const { data } = await api.put(`${BASE}/agencies/${agencyId}/users/${userId}/comfort`, {
    agencyId,
    userId,
    ...payload
  });
  return data;
}

export async function saveComfortDraft(payload) {
  const { data } = await api.post(`${BASE}/comfort/drafts`, payload);
  return data;
}

export async function getComfortDraft(hiringProfileId) {
  const { data } = await api.get(`${BASE}/comfort/drafts/${hiringProfileId}`);
  return data;
}

export async function promoteComfortDraft(payload) {
  const { data } = await api.post(`${BASE}/comfort/promote-draft`, payload);
  return data;
}

export async function matchTutors(payload) {
  const { data } = await api.post(`${BASE}/match-tutors`, payload);
  return data;
}

export async function draftPlanAi(payload) {
  const { data } = await api.post(`${BASE}/ai/draft-plan`, payload);
  return data;
}

export async function approveAiArtifact(artifactId) {
  const { data } = await api.post(`${BASE}/ai/artifacts/${artifactId}/approve`);
  return data;
}

export async function applyAiPlanDraft(artifactId) {
  const { data } = await api.post(`${BASE}/ai/artifacts/${artifactId}/apply-plan`);
  return data;
}

export async function searchCasStandards(params) {
  const { data } = await api.get(`${BASE}/cas-standards`, { params });
  return data;
}

export async function listEvaluationItems(params) {
  const { data } = await api.get(`${BASE}/evaluation-items`, { params });
  return data;
}

export async function runQuickEvaluation(payload) {
  const { data } = await api.post(`${BASE}/evaluations/quick`, payload);
  return data;
}

export async function createProgressReport(payload) {
  const { data } = await api.post(`${BASE}/reports`, payload);
  return data;
}

export async function listReports(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/reports`);
  return data;
}

export async function publishReport(reportId) {
  const { data } = await api.post(`${BASE}/reports/${reportId}/publish`);
  return data;
}

export async function fetchTutorCaseloadToday(params) {
  const { data } = await api.get(`${BASE}/tutor/caseload-today`, { params });
  return data;
}

export async function linkInPersonPlan(payload) {
  const { data } = await api.post(`${BASE}/sessions/link-in-person-plan`, payload);
  return data;
}

export async function createOralReadingProbe(payload) {
  const { data } = await api.post(`${BASE}/oral-reading-probes`, payload);
  return data;
}

export async function verifyOralReadingProbe(probeId, payload = {}) {
  const { data } = await api.post(`${BASE}/oral-reading-probes/${probeId}/verify`, payload);
  return data;
}

export async function createDocumentExtraction(payload) {
  const { data } = await api.post(`${BASE}/document-extractions`, payload);
  return data;
}

export async function confirmDocumentExtraction(extractionId, payload = {}) {
  const { data } = await api.post(`${BASE}/document-extractions/${extractionId}/confirm`, payload);
  return data;
}

export async function listMilestones(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/milestones`);
  return data;
}

export async function listAlerts(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/alerts`);
  return data;
}

export async function acknowledgeAlert(alertId) {
  const { data } = await api.post(`${BASE}/alerts/${alertId}/acknowledge`);
  return data;
}

export async function createPracticeAssignment(payload) {
  const { data } = await api.post(`${BASE}/practice`, payload);
  return data;
}

export async function listSubjectPractice(subjectId) {
  const { data } = await api.get(`${BASE}/subjects/${subjectId}/practice`);
  return data;
}

export async function listClientPractice(clientId, params = {}) {
  const { data } = await api.get(`${BASE}/clients/${clientId}/practice`, { params });
  return data;
}

export async function completePracticeAssignment(assignmentId) {
  const { data } = await api.post(`${BASE}/practice/${assignmentId}/complete`);
  return data;
}

export async function createAssessmentBlueprint(payload) {
  const { data } = await api.post(`${BASE}/assessment-blueprints`, payload);
  return data;
}

export async function getAssessmentBlueprint(blueprintId) {
  const { data } = await api.get(`${BASE}/assessment-blueprints/${blueprintId}`);
  return data;
}

export async function updateAssessmentBlueprint(blueprintId, payload) {
  const { data } = await api.patch(`${BASE}/assessment-blueprints/${blueprintId}`, payload);
  return data;
}

export async function fetchGuardianLearningFeed(clientId) {
  const { data } = await api.get(`${BASE}/clients/${clientId}/guardian-feed`, {
    skipGlobalLoading: true
  });
  return data;
}

export async function fetchGuardianTutoringDashboard(clientId) {
  const { data } = await api.get(`${BASE}/clients/${clientId}/guardian-dashboard`, {
    skipGlobalLoading: true
  });
  return data;
}

export async function tutorAssist(payload) {
  const { data } = await api.post(`${BASE}/ai/tutor-assist`, payload);
  return data;
}
