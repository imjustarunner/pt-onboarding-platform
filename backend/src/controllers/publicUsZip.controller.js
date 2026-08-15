const zipCache = new Map();
const CACHE_LIMIT = 400;

function cacheGet(zip) {
  return zipCache.get(zip) || null;
}

function cacheSet(zip, value) {
  if (zipCache.size >= CACHE_LIMIT) {
    const first = zipCache.keys().next().value;
    if (first) zipCache.delete(first);
  }
  zipCache.set(zip, value);
}

/**
 * GET /api/public/us-zip/:zip
 * Proxies Zippopotam so the browser never sees a 404 for unknown ZIPs.
 */
export async function lookupPublicUsZip(req, res) {
  const zip = String(req.params.zip || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) {
    return res.json({ found: false });
  }
  const cached = cacheGet(zip);
  if (cached) return res.json(cached);

  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!resp.ok) {
      const miss = { found: false };
      cacheSet(zip, miss);
      return res.json(miss);
    }
    const data = await resp.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const city = String(place?.['place name'] || '').trim();
    const state = String(place?.['state abbreviation'] || place?.state || '').trim();
    const payload = city || state
      ? { found: true, city, state }
      : { found: false };
    cacheSet(zip, payload);
    return res.json(payload);
  } catch {
    return res.json({ found: false });
  }
}
