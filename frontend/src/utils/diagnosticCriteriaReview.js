function requirementMet(item) {
  return item.status === 'present'
    && (item.kind !== 'frequency' || item.frequency?.trim())
    && (item.kind !== 'duration' || item.duration?.trim());
}

export function diagnosticCriteriaGroups(criteria = []) {
  const groups = new Map();
  for (const item of criteria) {
    const key = item.kind === 'symptom' ? `symptom:${item.group || item.id}` : `requirement:${item.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, items]) => {
    const thresholds = [...new Set(items.filter(item => item.thresholdSourceValid && Number.isInteger(item.minimum) && item.minimum > 0).map(item => item.minimum))];
    const mandatory = key.startsWith('requirement:') && !!items[0].sourceHash;
    const minimum = mandatory ? 1 : thresholds.length === 1 && thresholds[0] <= items.length ? thresholds[0] : null;
    return { key, items, minimum, met: items.filter(requirementMet).length };
  });
}

export function diagnosticCriteriaStatus(criteria = []) {
  if (!criteria.length) return { status: 'unconfirmed', message: 'Criteria support unconfirmed' };
  const groups = diagnosticCriteriaGroups(criteria);
  const required = groups.reduce((sum, group) => sum + (group.minimum || 0), 0);
  const present = groups.reduce((sum, group) => sum + Math.min(group.met, group.minimum || 0), 0);
  const unknown = groups.some(group => group.minimum === null);
  const supported = !unknown && required > 0 && present === required;
  return {
    status: supported ? 'supported' : 'incomplete',
    present, required,
    message: supported ? 'Documented criteria support reviewed'
      : `Criteria support incomplete · ${present}/${required || '?'} verified requirements supported${unknown ? ' · criteria or threshold unconfirmed' : ''}`
  };
}
