const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function parseProviderClientQuery(query) {
  const text = normalize(query).replace(/[’']/g, "'").replace(/'s\b/g, '').replace(/[^a-z0-9\s]/g, ' ');
  const tokens = text.split(/\s+/).filter(Boolean);
  const intentFor = token => ['client', 'clients', 'caseload', 'patient', 'patients', 'school', 'schools'].find(word => token === word || (token.length >= 5 && distance(token, word) <= 1));
  if (!tokens.some(intentFor)) return null;
  const school = tokens.some(token => intentFor(token)?.startsWith('school'));
  const names = tokens.filter(word => !intentFor(word) && !/^(show|me|see|view|open|find|go|to|take|the|for|of|please|can|you|want|i|s)$/.test(word));
  return names.length && names.every(word => word.length >= 2) ? { names, section: school ? 'school' : 'all' } : null;
}

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}

export function searchProviderClients(query, people, { agencyId, limit = 5 } = {}) {
  const intent = parseProviderClientQuery(query);
  if (!intent || !Number(agencyId)) return [];
  return (people || []).filter(person => Number(person.id) > 0 && ['provider', 'provider_plus', 'intern', 'supervisor', 'facilitator', 'admin', 'super_admin'].includes(person.role))
    .map(person => {
      const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
      const words = normalize(name).split(/[^a-z0-9]+/).filter(Boolean);
      const scores = intent.names.map(token => Math.max(0, ...words.map(word => word === token ? 100 : word.startsWith(token) ? 80 : token.length >= 3 && word.length >= 4 && distance(token, word) <= 1 ? 50 : 0)));
      if (scores.some(score => !score)) return null;
      return { id: `provider-clients-${person.id}`, kind: 'path', path: `/admin/users/${person.id}`,
        query: { tab: 'clients', clients: intent.section, agencyId: String(agencyId) },
        label: `${name} — ${intent.section === 'school' ? 'Schools & clients' : 'Clients'}`,
        description: 'Open provider caseload', groupLabel: 'People', score: scores.reduce((a, b) => a + b, 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}
