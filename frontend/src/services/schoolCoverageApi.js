import api from './api';

function withAgency(params = {}, agencyId) {
  const out = { ...params };
  if (agencyId) out.agencyId = agencyId;
  return out;
}

export async function fetchSchoolCoverageSummary(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/summary', {
    params: withAgency(params, agencyId)
  });
  return data;
}

export async function fetchProviderCoverageSummary(agencyId) {
  const { data } = await api.get('/school-coverage/providers', {
    params: withAgency({}, agencyId)
  });
  return data;
}

export async function fetchCoverageWarnings(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/warnings', {
    params: withAgency(params, agencyId)
  });
  return data;
}

export async function fetchOpenSchoolDays(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/open-days', {
    params: withAgency(params, agencyId)
  });
  return data;
}

export async function fetchSchoolDetail(agencyId, schoolId) {
  const { data } = await api.get(`/school-coverage/schools/${schoolId}/detail`, {
    params: withAgency({}, agencyId)
  });
  return data;
}

export async function fetchProviderDetail(agencyId, providerId) {
  const { data } = await api.get(`/school-coverage/providers/${providerId}/detail`, {
    params: withAgency({}, agencyId)
  });
  return data;
}

export async function fetchHubEvents(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/events', {
    params: withAgency(params, agencyId)
  });
  return data;
}

export async function fetchCoverageSuggestions(agencyId) {
  const { data } = await api.get('/school-coverage/suggestions', {
    params: withAgency({}, agencyId)
  });
  return data;
}

export async function expireStaleSchoolRequests(agencyId, days = 30) {
  const { data } = await api.post(
    '/school-coverage/expire-stale-requests',
    { days },
    { params: withAgency({}, agencyId) }
  );
  return data;
}

export async function applyForOpenSchoolDay(agencyId, { schoolId, dayOfWeek, notes = '' }) {
  const { data } = await api.post('/availability/school-requests', {
    agencyId,
    preferredSchoolOrgIds: schoolId ? [schoolId] : [],
    notes: notes || `Applying for open school day: ${dayOfWeek}`,
    blocks: [
      {
        dayOfWeek,
        blockType: 'daytime',
        startTime: '08:00',
        endTime: '16:00'
      }
    ]
  });
  return data;
}

/** Upsert slots on canonical provider_school_assignments (same SoT as provider scheduling). */
export async function upsertProviderDaySlots(
  agencyId,
  { providerUserId, schoolOrganizationId, dayOfWeek, slotsTotal, startTime, endTime, isActive }
) {
  const { data } = await api.post(
    '/school-coverage/provider-day-slots',
    {
      providerUserId,
      schoolOrganizationId,
      dayOfWeek,
      slotsTotal,
      startTime,
      endTime,
      isActive
    },
    { params: withAgency({}, agencyId) }
  );
  return data;
}
