export function followUpClient(client = {}, agencyId = null) {
  const id = Number(client.client_id || client.clientId || client.id);
  const tenantId = Number(client.agency_id || client.agencyId || agencyId);
  return {
    ...client,
    id: Number.isSafeInteger(id) && id > 0 ? id : null,
    agency_id: Number.isSafeInteger(tenantId) && tenantId > 0 ? tenantId : null,
    initials: client.initials || client.client_initials || client.clientInitials || '',
    full_name: client.full_name || client.fullName || client.client_full_name || '',
    identifier_code: client.identifier_code || client.identifierCode || ''
  };
}

export function clientFollowUpLocation(task, organizationSlug = '') {
  let metadata = task?.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return null; }
  }
  const clientId = Number(metadata?.clientId);
  if (metadata?.source !== 'client_follow_up' || !Number.isSafeInteger(clientId) || clientId <= 0) return null;
  const slug = metadata.organizationSlug ?? organizationSlug;
  const prefix = slug ? `/${encodeURIComponent(slug)}` : '';
  const agencyId = Number(metadata.agencyId || task.assigned_to_agency_id);
  return {
    path: `${prefix}/admin/clients/${clientId}`,
    query: agencyId > 0 ? { agencyId: String(agencyId) } : {}
  };
}
