// Account deep links may omit tab, but must never override an explicit destination.
export function dashboardAccountSection(query = {}) {
  return !query.tab || query.tab === 'my' ? query.my : undefined;
}

export function dashboardTabQuery(query = {}, tab) {
  const next = { ...query, tab };
  if (tab !== 'my') {
    for (const key of ['my', 'section', 'profileField', 'profileCategory']) delete next[key];
  }
  return next;
}

// Preserve the overview's existing authorized shortcuts in the shared search index.
export function mergeDashboardSearchTargets(targets, quickNavEntries) {
  const merged = targets.map(target => ({ ...target }));
  for (const entry of quickNavEntries) {
    if (entry.kind === 'dashboard') {
      const target = merged.find(t => t.tabId === entry.tab && (t.mySection || '') === (entry.my || '') && !t.sectionId && !t.fieldId);
      // Dashboard pages still follow the rail and My Account visibility rules.
      if (target) target.aliases = [...(target.aliases || []), entry.label, ...(entry.keywords || [])];
    } else {
      merged.push({ id: `quick-${entry.id}`, tabId: `quick-${entry.id}`, label: entry.label,
        kind: 'Page', breadcrumb: entry.groupLabel || 'My Dashboard', content: entry.description || '',
        aliases: entry.keywords || [], quickNavEntry: entry });
    }
  }
  return merged;
}
