const keyFor = userId => `pt.tenantLastVisited:${userId}`;

export function readTenantVisits(userId) {
  if (!userId) return {};
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(userId)) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function recordTenantVisit(userId, agencyId, timestamp = Date.now()) {
  const visits = readTenantVisits(userId);
  if (!userId || !agencyId) return visits;
  visits[String(agencyId)] = timestamp;
  try { localStorage.setItem(keyFor(userId), JSON.stringify(visits)); } catch { /* Storage may be disabled. */ }
  return visits;
}

export function sortTenantsByRecency(tenants, visits) {
  const timestamp = id => Number.isFinite(Number(visits[String(id)])) ? Number(visits[String(id)]) : 0;
  return [...tenants].sort((a, b) => timestamp(b.id) - timestamp(a.id));
}
