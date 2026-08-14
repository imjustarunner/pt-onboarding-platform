const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

export function normalizeNamePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFullName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return null;
  if (raw.includes(',')) {
    const [lastRaw, restRaw = ''] = raw.split(',');
    const last = normalizeNamePart(lastRaw);
    const restTokens = normalizeNamePart(restRaw).split(' ').filter(Boolean);
    const first = restTokens[0] || '';
    if (!first || !last) return null;
    return { first, last };
  }
  const tokens = normalizeNamePart(raw)
    .split(' ')
    .filter((token) => token && !NAME_SUFFIXES.has(token.replace(/\./g, '')));
  if (tokens.length < 2) return null;
  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

export function nameMatchKey(fullName) {
  const parsed = parseFullName(fullName);
  if (!parsed) return '';
  return `${parsed.first}|${parsed.last}`;
}

export function looksLikeInitialsOnly(fullName, initials) {
  const compact = String(fullName || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const init = String(initials || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!compact) return true;
  if (init && compact === init) return true;
  return compact.length <= 3;
}

export function normalizeDob(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function confidenceForMembers(members) {
  const dobs = members.map((m) => normalizeDob(m.date_of_birth)).filter(Boolean);
  const uniqueDobs = new Set(dobs);
  if (dobs.length >= 2 && uniqueDobs.size === 1) return 'high';
  const orgs = new Set(members.map((m) => Number(m.organization_id)).filter((n) => n > 0));
  if (orgs.size === 1) return 'medium';
  return 'low';
}

export function groupClientsByFirstLastName(clients, { minGroupSize = 2 } = {}) {
  const byKey = new Map();
  for (const client of clients || []) {
    if (looksLikeInitialsOnly(client?.full_name, client?.initials)) continue;
    const key = nameMatchKey(client?.full_name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(client);
  }

  const groups = [];
  for (const [key, members] of byKey) {
    if (members.length < minGroupSize) continue;
    const [firstName, lastName] = key.split('|');
    groups.push({
      key,
      firstName,
      lastName,
      confidence: confidenceForMembers(members),
      memberCount: members.length,
      members
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  groups.sort((a, b) => (
    (rank[a.confidence] - rank[b.confidence])
    || a.lastName.localeCompare(b.lastName)
    || a.firstName.localeCompare(b.firstName)
  ));
  return groups;
}

export function flaggedClientIdsFromGroups(groups) {
  const ids = new Set();
  for (const group of groups || []) {
    for (const member of group.members || []) {
      const id = Number(member?.id);
      if (id > 0) ids.add(id);
    }
  }
  return ids;
}
