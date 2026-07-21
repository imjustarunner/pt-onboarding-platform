import api from './api';

/** Dashboard + hub reads must never flash the fullscreen page loader. */
const quiet = { skipGlobalLoading: true };

function withAgency(params = {}, agencyId) {
  const out = { ...params };
  if (agencyId) out.agencyId = agencyId;
  return out;
}

export async function fetchSchoolCoverageSummary(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/summary', {
    params: withAgency(params, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchProviderCoverageSummary(agencyId) {
  const { data } = await api.get('/school-coverage/providers', {
    params: withAgency({}, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchCoverageWarnings(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/warnings', {
    params: withAgency(params, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchOpenSchoolDays(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/open-days', {
    params: withAgency(params, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchSchoolDetail(agencyId, schoolId) {
  const { data } = await api.get(`/school-coverage/schools/${schoolId}/detail`, {
    params: withAgency({}, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchProviderDetail(agencyId, providerId) {
  const { data } = await api.get(`/school-coverage/providers/${providerId}/detail`, {
    params: withAgency({}, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchHubEvents(agencyId, params = {}) {
  const { data } = await api.get('/school-coverage/events', {
    params: withAgency(params, agencyId),
    ...quiet
  });
  return data;
}

export async function fetchCoverageSuggestions(agencyId) {
  const { data } = await api.get('/school-coverage/suggestions', {
    params: withAgency({}, agencyId),
    ...quiet
  });
  return data;
}

export async function expireStaleSchoolRequests(agencyId, days = 30) {
  const { data } = await api.post(
    '/school-coverage/expire-stale-requests',
    { days },
    { params: withAgency({}, agencyId), ...quiet }
  );
  return data;
}

export async function applyForOpenSchoolDay(agencyId, { schoolId, dayOfWeek, notes = '' }) {
  const { data } = await api.post(
    '/availability/school-requests',
    {
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
    },
    quiet
  );
  return data;
}

export async function enableSchoolEventStaffing(agencyId, eventId, { minProvidersPerSession = 2 } = {}) {
  const { data } = await api.post(
    `/school-coverage/events/${eventId}/enable-staffing`,
    { minProvidersPerSession },
    { params: withAgency({}, agencyId), ...quiet }
  );
  return data;
}

/** School-year coverage for BTS / Fall / Spring check-ins (Aug 1 – Jul 31). */
export async function fetchSchoolYearEventCoverage(agencyId, schoolYear) {
  const { data } = await api.get('/school-portal/school-events/school-year-coverage', {
    params: withAgency({ schoolYear: schoolYear || undefined }, agencyId),
    ...quiet
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
    { params: withAgency({}, agencyId), ...quiet }
  );
  return data;
}
