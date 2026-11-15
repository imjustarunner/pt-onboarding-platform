/**
 * A Counseling service belongs to a client and agency. Program membership and
 * provider assignments describe that service; they do not create extra services.
 * Keep source IDs so existing appointments, portal scopes and history stay valid.
 */
export function clientServiceAssignments(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const active = Number(row.is_active) === 1;
    const key = row.service_kind === 'counseling' && active
      ? `${row.client_id}:${row.agency_id}:counseling:${active}`
      : `service:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(sources => {
    if (sources[0].service_kind !== 'counseling') return sources[0];
    const score = row => (Number(row.provider_user_id) > 0 ? 2 : 0) + (Number(row.organization_id) > 0 ? 1 : 0);
    const ordered = [...sources].sort((a, b) => score(b) - score(a) || Number(a.id) - Number(b.id));
    const primary = ordered[0];
    const providers = new Map();
    const organizations = new Map();
    for (const row of ordered) {
      const providerId = Number(row.provider_user_id);
      if (providerId > 0 && !providers.has(providerId)) providers.set(providerId, {
        service_id: Number(row.id), provider_user_id: providerId,
        provider_name: row.provider_name || null, organization_id: Number(row.organization_id) || 0,
        service_status: row.service_status, status_label: row.status_label, is_active: row.is_active
      });
      const organizationId = Number(row.organization_id);
      if (organizationId > 0 && !organizations.has(organizationId)) organizations.set(organizationId, {
        id: organizationId, name: row.organization_name || null, ...(row.organization_type ? {organization_type:row.organization_type} : {})
      });
    }
    const program = organizations.values().next().value;
    return {
      ...primary,
      label: primary.service_kind === 'counseling' ? 'Counseling' : primary.label,
      organization_id: Number(primary.organization_id) || program?.id || 0,
      organization_name: primary.organization_name || program?.name || null,
      source_service_ids: sources.map(row => Number(row.id)).sort((a, b) => a - b),
      providers: [...providers.values()], organizations: [...organizations.values()]
    };
  });
}
