import { normalizePersonNameKey } from './noteAidWorkQueue.js';

export function transitionClientRows(payload, agencyId) {
  const rows = Array.isArray(payload) ? payload : payload?.clients || payload?.items;
  if (!Array.isArray(rows) || (payload?.total != null && Number(payload.total) > rows.length)
    || rows.some(row => !Number(row?.id) || Number(row.agency_id) !== Number(agencyId))) {
    throw new Error('Client lookup was incomplete or outside the selected practice. Retry before creating or linking a chart.');
  }
  return rows;
}

export async function assignTransitionClient(api, client, providerId, { assertContext = () => {} } = {}) {
  assertContext();
  if (String(client.status || '').toUpperCase() === 'ARCHIVED') throw new Error('Restore this archived chart in Client Management before importing.');
  if (Number(client.provider_id) === Number(providerId)) return;
  if (!Number(client.provider_id)) {
    await api.put(`/clients/${client.id}/provider`, { provider_id: Number(providerId) }, { skipGlobalLoading: true });
  } else {
    const organizationId = Number(client.organization_id || client.school_organization_id);
    if (!organizationId) throw new Error('Choose the existing chart’s organization in Client Management before adding another provider.');
    await api.post(`/clients/${client.id}/provider-assignments`, { organization_id: organizationId, provider_user_id: Number(providerId), service_day: 'Unknown', is_primary: false }, { skipGlobalLoading: true });
  }
  assertContext();
}

export function sameTransitionClientName(client, name) {
  return normalizePersonNameKey(client.full_name || client.fullName || '') === normalizePersonNameKey(name);
}
