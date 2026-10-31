const enabled = value => value === true || value === 1 || value === '1';

/** Administrative chart display only; enrollment answers and signed records stay unchanged. */
export function linkedGuardianSummary(guardians, { canView = false } = {}) {
  if (!canView || !Array.isArray(guardians)) return null;
  const linked = guardians.filter(g => enabled(g?.access_enabled)
    && ![false, 0, '0'].includes(g?.is_active)
    && String(g?.relationship_type || 'guardian').toLowerCase() === 'guardian');
  const first = linked[0];
  if (!first) return null;
  const displayName = [first.first_name, first.last_name].filter(Boolean).join(' ').trim()
    || String(first.email || '').trim();
  if (!displayName) return null;
  return { displayName, contact: String(first.email || first.phone || '').trim(), additionalCount: linked.length - 1 };
}
