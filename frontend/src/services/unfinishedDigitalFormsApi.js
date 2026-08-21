import api from './api';

const quiet = { skipGlobalLoading: true };

export async function fetchUnfinishedDigitalFormsSnapshot(agencyId, {
  scope = 'all',
  schoolOrganizationId = null
} = {}) {
  const params = {};
  if (agencyId) params.agencyId = agencyId;
  if (scope) params.scope = scope;
  if (schoolOrganizationId) params.schoolOrganizationId = schoolOrganizationId;
  const { data } = await api.get('/unfinished-digital-forms/snapshot', { params, ...quiet });
  return data;
}
