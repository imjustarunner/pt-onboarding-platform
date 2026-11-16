// Keep return navigation fast without persisting client records to browser storage.
const snapshots = new Map();
const MAX_AGE_MS = 30 * 60 * 1000;

export function clientManagementWorkspaceKey({ userId, role, sessionId, agencyId, path } = {}) {
  return JSON.stringify([userId, role, sessionId || '', agencyId || 'platform', path]);
}

export function rememberClientManagementWorkspace(key, snapshot, now = Date.now()) {
  snapshots.delete(key);
  snapshots.set(key, { snapshot: JSON.parse(JSON.stringify(snapshot)), at: now });
  while (snapshots.size > 6) snapshots.delete(snapshots.keys().next().value);
}

export function readClientManagementWorkspace(key, now = Date.now()) {
  const saved = snapshots.get(key);
  if (!saved || now - saved.at >= MAX_AGE_MS) {
    snapshots.delete(key);
    return null;
  }
  return structuredClone(saved.snapshot);
}

export function clearClientManagementWorkspaces() { snapshots.clear(); }

const providerRoles = new Set(['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant', 'counselor', 'therapist', 'coach', 'facilitator']);
const inactiveStatuses = new Set(['ARCHIVED', 'PROSPECTIVE', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'TERMINATED_PENDING', 'SUSPENDED', 'DISABLED', 'DELETED']);
export function isActiveClientManagementProvider(person) {
  return !!person && ![false, 0, '0'].includes(person.is_active)
    && ![false, 0, '0'].includes(person.membership_active)
    && ![true, 1, '1'].includes(person.is_archived)
    && ![true, 1, '1'].includes(person.is_demo)
    && ![false, 0, '0'].includes(person.sees_clients)
    && !inactiveStatuses.has(String(person.status || '').toUpperCase())
    && (providerRoles.has(String(person.role || '').toLowerCase()) || [true, 1, '1'].includes(person.has_provider_access));
}
