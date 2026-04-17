import ActivityLogService from './activityLog.service.js';

const MAX_TEXT = 16000;
const MAX_HTML = 32000;

function trimField(v, max) {
  const s = v == null ? '' : String(v);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

export function buildHiringReferenceActivityMetadata(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const meta = { ...payload };
  if (meta.textBody != null) meta.textBody = trimField(meta.textBody, MAX_TEXT);
  if (meta.htmlBody != null) meta.htmlBody = trimField(meta.htmlBody, MAX_HTML);
  return meta;
}

/**
 * Logs a hiring-reference lifecycle event on the applicant's user activity stream.
 * Always pass agencyId from the hiring reference row / hiring context (not inferred).
 */
export function logHiringReferenceEvent({ candidateUserId, agencyId, ...rest }) {
  const uid = Number(candidateUserId);
  const aid = agencyId != null ? Number(agencyId) : null;
  if (!uid) return;
  ActivityLogService.logActivity({
    actionType: 'hiring_reference_event',
    userId: uid,
    agencyId: Number.isFinite(aid) && aid > 0 ? aid : null,
    metadata: buildHiringReferenceActivityMetadata(rest)
  });
}

export function resolveBackendPublicBaseUrl() {
  return String(
    process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || process.env.FRONTEND_URL || ''
  ).replace(/\/$/, '');
}

export function buildReferenceOpenPixelUrl(openTrackToken) {
  const t = String(openTrackToken || '').trim();
  if (!t) return '';
  const base = resolveBackendPublicBaseUrl();
  if (!base) return '';
  return `${base}/api/public/hiring/reference/open/${encodeURIComponent(t)}`;
}

export function appendEmailOpenPixel(html, openPixelUrl) {
  const u = String(openPixelUrl || '').trim();
  const h = String(html || '').trim();
  if (!u || !h) return h || html || '';
  const tag = `<img src="${u.replace(/"/g, '&quot;')}" width="1" height="1" alt="" style="display:none;border:0;" />`;
  if (/<\/body>/i.test(h)) return h.replace(/<\/body>/i, `${tag}</body>`);
  return `${h}\n${tag}`;
}
