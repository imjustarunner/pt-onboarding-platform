import Agency from '../models/Agency.model.js';

function normalizeKey(input) {
  const s = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stop = new Set([
    'school',
    'elementary',
    'middle',
    'high',
    'academy',
    'charter',
    'primary',
    'intermediate',
    'junior',
    'jr',
    'senior',
    'sr',
    'the',
    'of',
    'at'
  ]);

  const tokens = s
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !stop.has(t));

  return {
    raw: s,
    tokens,
    joined: tokens.join(' ')
  };
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;

  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function scoreMatch(queryKey, school) {
  const name = String(school?.name || '');
  const slug = String(school?.slug || '');
  const nameKey = normalizeKey(name);
  const slugKey = normalizeKey(slug.replace(/-/g, ' '));

  const q = queryKey.joined;
  if (!q) return null;

  // Exact-ish matches
  if (q === nameKey.joined) return 100;
  if (q === slugKey.joined) return 98;

  // Token subset match (e.g. "ashley" matches "ashley elementary school")
  const schoolTokens = new Set([...nameKey.tokens, ...slugKey.tokens]);
  const queryTokens = new Set(queryKey.tokens);
  if (queryKey.tokens.length > 0) {
    const allIn = queryKey.tokens.every((t) => schoolTokens.has(t));
    if (allIn) return 90 - Math.min(10, Math.max(0, nameKey.tokens.length - queryKey.tokens.length));
  }

  // Substring match on normalized joined
  if (nameKey.joined.includes(q) || q.includes(nameKey.joined)) return 80;
  if (slugKey.joined.includes(q) || q.includes(slugKey.joined)) return 78;

  // Fuzzy typo match: compare to nameKey.joined
  const dist = levenshtein(q, nameKey.joined);
  if (q.length >= 4 && dist <= 2) return 70 - dist * 5;

  return null;
}

/**
 * GET /api/public/schools/search?q=...
 * Public school lookup for routing users to the correct school splash/portal.
 *
 * Returns only non-sensitive fields: { id, slug, name, logo_path, logo_url }.
 */
export const searchPublicSchools = async (req, res, next) => {
  try {
    const qRaw = String(req.query.q || '').trim();
    if (qRaw.length < 2) return res.json([]);

    const queryKey = normalizeKey(qRaw);
    const schools = await Agency.findAll(false, false, 'school');

    const scored = [];
    for (const s of schools || []) {
      const sc = scoreMatch(queryKey, s);
      if (sc === null) continue;
      scored.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo_path: s.logo_path || null,
        logo_url: s.logo_url || null,
        score: sc
      });
    }

    scored.sort((a, b) => (b.score - a.score) || String(a.name || '').localeCompare(String(b.name || '')));

    // De-dupe by slug
    const seen = new Set();
    const out = [];
    for (const r of scored) {
      const key = String(r.slug || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 10) break;
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
};

