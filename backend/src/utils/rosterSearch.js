const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function parseTruthyQuery(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function parseDobParts(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return {
      y: raw.getUTCFullYear(),
      m: raw.getUTCMonth() + 1,
      d: raw.getUTCDate()
    };
  }
  const iso = String(raw).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
}

export function dobSearchTokens(raw) {
  const parts = parseDobParts(raw);
  if (!parts) return [];
  const { y, m, d } = parts;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const yy = String(y).slice(-2);
  return [
    `${y}-${mm}-${dd}`,
    `${mm}/${dd}/${y}`,
    `${m}/${d}/${y}`,
    `${mm}-${dd}-${y}`,
    `${mm}${dd}${y}`,
    `${m}/${d}/${yy}`,
    `${mm}/${dd}/${yy}`,
    `${MONTHS[m - 1]} ${d} ${y}`,
    `${MONTHS_SHORT[m - 1]} ${d} ${y}`,
    `${MONTHS[m - 1]} ${d}, ${y}`,
    String(y),
    `${m}/${d}`,
    `${mm}/${dd}`
  ];
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function clientMatchesRosterSearch(client, query) {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const compactNeedle = needle.replace(/[^a-z0-9]/g, '');
  const hay = [
    client?.initials,
    client?.identifier_code,
    client?.full_name,
    client?.guardian_names,
    client?.provider_name,
    client?.client_status_label
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes(needle)) return true;
  if (compactNeedle && String(client?.identifier_code || '').replace(/\s+/g, '').toLowerCase().includes(compactNeedle)) {
    return true;
  }
  const tokens = dobSearchTokens(client?.date_of_birth);
  if (tokens.some((t) => t.includes(needle) || needle.includes(t))) return true;
  if (compactNeedle && tokens.some((t) => t.replace(/[^a-z0-9]/g, '').includes(compactNeedle))) return true;
  return false;
}

export function filterClientsByRosterSearch(rawClients, restrictedClients, query) {
  const needle = String(query || '').trim();
  if (!needle) return restrictedClients || [];
  const ids = new Set(
    (rawClients || [])
      .filter((c) => clientMatchesRosterSearch(c, needle))
      .map((c) => Number(c.id))
  );
  return (restrictedClients || []).filter((c) => ids.has(Number(c.id)));
}
