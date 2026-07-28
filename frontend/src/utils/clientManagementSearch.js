const PREFIXES = ['provider', 'prov', 'status', 'org', 'school', 'tenant', 'code', 'type'];

/**
 * Parse intelligent search tokens like `provider:williams status:packet hogwarts`.
 * Returns structured filters plus remaining free-text for the API search param.
 */
export function parseClientManagementSearch(raw, context = {}) {
  const text = String(raw || '').trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  const freeText = [];
  const filters = {
    providerQuery: null,
    statusQuery: null,
    orgQuery: null,
    tenantQuery: null,
    codeQuery: null,
    typeQuery: null
  };

  for (const token of tokens) {
    const m = token.match(/^([a-z]+):(.+)$/i);
    if (!m) {
      freeText.push(token);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (!value) continue;
    if (key === 'provider' || key === 'prov') filters.providerQuery = value;
    else if (key === 'status') filters.statusQuery = value;
    else if (key === 'org' || key === 'school') filters.orgQuery = value;
    else if (key === 'tenant') filters.tenantQuery = value;
    else if (key === 'code') filters.codeQuery = value;
    else if (key === 'type') filters.typeQuery = value;
    else freeText.push(token);
  }

  const resolved = { ...filters, freeText: freeText.join(' ').trim() };

  if (filters.providerQuery && Array.isArray(context.providers)) {
    const q = filters.providerQuery.toLowerCase();
    const hit = context.providers.find((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      return name.includes(q) || String(p.email || '').toLowerCase().includes(q);
    });
    resolved.providerId = hit?.id || null;
  }

  if (filters.orgQuery && Array.isArray(context.organizations)) {
    const q = filters.orgQuery.toLowerCase();
    const hit = context.organizations.find((o) => String(o.name || '').toLowerCase().includes(q));
    resolved.organizationId = hit?.id || null;
  }

  if (filters.tenantQuery && Array.isArray(context.tenants)) {
    const q = filters.tenantQuery.toLowerCase();
    const hit = context.tenants.find((t) => String(t.name || '').toLowerCase().includes(q));
    resolved.tenantId = hit?.id || null;
  }

  if (filters.statusQuery) {
    const q = filters.statusQuery.toLowerCase();
    if (Array.isArray(context.clientStatuses)) {
      const hit = context.clientStatuses.find(
        (s) =>
          String(s.status_key || '').toLowerCase().includes(q) ||
          String(s.label || '').toLowerCase().includes(q)
      );
      resolved.clientStatusId = hit?.id || null;
    }
    const workflowMap = {
      packet: 'PACKET',
      screener: 'SCREENER',
      pending: 'PENDING_REVIEW',
      active: 'ACTIVE',
      current: 'ACTIVE',
      returning: 'RETURNING',
      hold: 'ON_HOLD',
      declined: 'DECLINED'
    };
    for (const [k, v] of Object.entries(workflowMap)) {
      if (q.includes(k)) {
        resolved.workflowStatus = v;
        break;
      }
    }
  }

  return resolved;
}

/** Client-side filter for non-paginated lists (and extra narrowing on current page). */
export function matchesParsedSearch(client, parsed) {
  if (!parsed) return true;
  if (parsed.codeQuery) {
    const code = String(client?.identifier_code || '').toLowerCase();
    if (!code.includes(parsed.codeQuery.toLowerCase())) return false;
  }
  if (parsed.typeQuery) {
    const t = String(client?.client_type || '').toLowerCase();
    if (!t.includes(parsed.typeQuery.toLowerCase())) return false;
  }
  if (parsed.providerQuery && !parsed.providerId) {
    const name = String(client?.provider_name || '').toLowerCase();
    if (!name.includes(parsed.providerQuery.toLowerCase())) return false;
  }
  if (parsed.orgQuery && !parsed.organizationId) {
    const org = String(client?.organization_name || '').toLowerCase();
    if (!org.includes(parsed.orgQuery.toLowerCase())) return false;
  }
  if (parsed.tenantQuery && !parsed.tenantId) {
    const tenant = String(client?.agency_name || '').toLowerCase();
    if (!tenant.includes(parsed.tenantQuery.toLowerCase())) return false;
  }
  return true;
}

export const SEARCH_HINTS = [
  'provider:williams',
  'status:packet',
  'org:hogwarts',
  'tenant:itsco',
  'code:MW-OFC'
];
