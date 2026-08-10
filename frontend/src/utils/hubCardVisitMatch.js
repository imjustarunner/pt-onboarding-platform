/**
 * Match hub orbit cards to logged page-visit paths (activity-based ranking).
 */

const QUERY_KEYS_IGNORE = new Set([
  'agencyid',
  'tab',
  'clientid',
  'ticketid',
  'organizationid',
]);

/** Strip org slug and normalize path casing. */
export function normalizeActivityPath(path) {
  let p = String(path || '').trim();
  if (!p) return '';
  const qIndex = p.indexOf('?');
  const pathOnly = qIndex >= 0 ? p.slice(0, qIndex) : p;
  const query = qIndex >= 0 ? p.slice(qIndex + 1) : '';

  let normalized = pathOnly
    .replace(/^\/[a-z0-9_-]+\/(admin\/|client-exchange|schedule\/|buildings)/i, '/$1')
    .replace(/^\/[a-z0-9_-]+\/admin\//i, '/admin/')
    .toLowerCase();

  if (!normalized.startsWith('/')) normalized = `/${normalized}`;

  const normQuery = normalizeQueryString(query);
  return normQuery ? `${normalized}?${normQuery}` : normalized;
}

export function normalizeQueryString(queryString) {
  if (!queryString) return '';
  const params = new URLSearchParams(queryString);
  const parts = [];
  for (const [key, value] of params.entries()) {
    if (QUERY_KEYS_IGNORE.has(String(key).toLowerCase())) continue;
    parts.push([key.toLowerCase(), String(value).toLowerCase()]);
  }
  parts.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return parts.map(([k, v]) => `${k}=${v}`).join('&');
}

/** @param {string|{ path?: string, query?: Record<string, unknown> }} to */
export function resolveRouterTo(to) {
  if (!to) return { path: '', query: {} };
  if (typeof to === 'string') {
    const [path, queryString] = to.split('?');
    const query = {};
    if (queryString) {
      for (const [k, v] of new URLSearchParams(queryString).entries()) {
        query[k] = v;
      }
    }
    return { path, query };
  }
  return {
    path: String(to.path || ''),
    query: to.query && typeof to.query === 'object' ? { ...to.query } : {},
  };
}

/** Canonical destination key for a hub card or logged visit path. */
export function cardDestinationKey(to) {
  const { path, query } = resolveRouterTo(to);
  const normPath = normalizeActivityPath(path);
  const normQuery = normalizeQueryString(
    Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  );
  if (!normPath) return '';
  return normQuery ? `${normPath}?${normQuery}` : normPath;
}

/** Build visit-count map keyed by normalized destination. */
export function buildVisitCountMap(visitRows = []) {
  const map = new Map();
  for (const row of visitRows) {
    const key = normalizeActivityPath(row.path);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + Number(row.visit_count || 0));
  }
  return map;
}

function cardHasSignificantQuery(to) {
  const { query } = resolveRouterTo(to);
  return normalizeQueryString(
    Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  ).length > 0;
}

/** Visit count for a hub card, with path-only fallback when query is not meaningful. */
export function visitCountForCard(card, visitMap) {
  const exactKey = cardDestinationKey(card?.to);
  if (exactKey && visitMap.has(exactKey)) return visitMap.get(exactKey);

  if (cardHasSignificantQuery(card?.to)) return 0;

  const { path } = resolveRouterTo(card?.to);
  const normPath = normalizeActivityPath(path);
  if (!normPath) return 0;

  let sum = 0;
  for (const [key, count] of visitMap.entries()) {
    if (key === normPath || key.startsWith(`${normPath}?`)) sum += count;
  }
  return sum;
}

/** Rank hub cards by visit activity (highest first). */
export function rankHubCards(cards = [], visitRows = []) {
  const visitMap = buildVisitCountMap(visitRows);
  return [...cards]
    .map((card) => ({
      ...card,
      visitCount: visitCountForCard(card, visitMap),
    }))
    .sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}
