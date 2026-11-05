// Every typed letter must appear at least that many times. Order does not matter.
export function lettersFit(query, text) {
  const letters = String(query || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!letters) return true;
  const hay = String(text || '').toLowerCase();
  const counts = {};
  for (const letter of letters) counts[letter] = (counts[letter] || 0) + 1;
  return Object.entries(counts).every(([letter, count]) => hay.split(letter).length - 1 >= count);
}

// When every check together matches nothing, name the checks that are hiding other matches.
export function narrowingLimits(items, checks) {
  const passes = item => checks.every(check => check.test(item));
  if (!checks.length || items.some(passes)) return [];
  const limits = checks.map(check => {
    const count = items.filter(item => checks.every(other => other === check || other.test(item))).length;
    return count ? { label: check.label, count } : null;
  }).filter(Boolean);
  if (limits.length) return limits;
  return [{ label: checks.map(check => check.label).join(' and '), count: items.length }];
}
