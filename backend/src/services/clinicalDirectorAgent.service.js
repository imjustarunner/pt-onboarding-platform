function clampText(v, maxLen) {
  const s = v === null || v === undefined ? '' : String(v);
  const trimmed = s.trim();
  if (!maxLen) return trimmed;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export async function runClinicalDirectorAgent({
  url,
  payload,
  timeoutMs = 60000
}) {
  const endpoint = String(url || '').trim();
  if (!endpoint) {
    const err = new Error('Clinical Director agent URL is not configured');
    err.status = 503;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      signal: controller.signal,
      body: JSON.stringify(payload || {})
    });

    if (!resp.ok) {
      const t = clampText(await resp.text().catch(() => ''), 2000);
      const err = new Error('Clinical Director agent request failed');
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      err.details = t;
      throw err;
    }

    // Accept either JSON response body or text body that is JSON.
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const data = await resp.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        const err = new Error('Clinical Director agent returned invalid JSON');
        err.status = 502;
        throw err;
      }
      return data;
    }

    const raw = clampText(await resp.text().catch(() => ''), 200000);
    if (!raw) {
      const err = new Error('Clinical Director agent returned empty response');
      err.status = 502;
      throw err;
    }

    try {
      return JSON.parse(raw);
    } catch {
      // Best-effort extraction if extra text is wrapped around JSON.
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(raw.slice(first, last + 1));
        } catch {
          // fall through
        }
      }
      const err = new Error('Clinical Director agent response was not valid JSON');
      err.status = 502;
      err.details = raw.slice(0, 2000);
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

