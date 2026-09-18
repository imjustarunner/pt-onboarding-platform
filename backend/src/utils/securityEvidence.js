import crypto from 'node:crypto';
import net from 'node:net';

export const sessionReference = (value) => value ? crypto.createHash('sha256').update(String(value)).digest('hex') : null;
export const cleanIp = (value) => {
  const s = String(value || '').trim().replace(/^::ffff:/i, '');
  const version = net.isIP(s);
  if (version === 6) return new URL(`http://[${s}]/`).hostname.slice(1, -1);
  return version === 4 ? s : null;
};

export function validateEvidenceProxyConfig(env = process.env) {
  const mode = env.AUDIT_PROXY_MODE || 'unverified';
  if (!['unverified', 'direct', 'google_lb'].includes(mode)) throw new Error('Unsupported AUDIT_PROXY_MODE');
  if (mode === 'google_lb') {
    const addresses = String(env.AUDIT_GOOGLE_LB_IPS || '').split(',');
    if (!addresses.length || addresses.some(address => !cleanIp(address))) throw new Error('AUDIT_GOOGLE_LB_IPS must contain exact valid load balancer IP addresses');
  }
}

// Never trust a caller's leftmost XFF value. The Google mode requires restricted
// backend ingress and a verified LB -> Cloud Run topology (see deployment guide).
export function networkEvidence(req, env = process.env) {
  const peer = cleanIp(req.socket?.remoteAddress);
  const raw = String(req.headers?.['x-forwarded-for'] || '').split(',');
  const forwarded = raw.slice(-16).map(cleanIp).filter(Boolean);
  const lbs = String(env.AUDIT_GOOGLE_LB_IPS || '').split(',').map(cleanIp).filter(Boolean);
  if (env.AUDIT_PROXY_MODE === 'google_lb' && raw.length <= 16 && raw.every(v => cleanIp(v))) {
    // Find the rightmost configured load balancer; values before the immediately
    // preceding IP may be attacker supplied and are retained only as observations.
    const index = forwarded.findLastIndex(ip => lbs.includes(ip));
    if (index > 0) return { clientIp: forwarded[index - 1], ipSource: 'verified_google_lb', peerIp: peer, forwardedIps: forwarded };
  }
  if (!req.headers?.['x-forwarded-for'] && env.AUDIT_PROXY_MODE === 'direct') {
    return { clientIp: peer, ipSource: 'direct_peer', peerIp: peer, forwardedIps: [] };
  }
  return { clientIp: cleanIp(req.ip) || peer, ipSource: 'unverified_proxy', peerIp: peer, forwardedIps: forwarded };
}

// Only code-defined route literals and numeric resource identifiers are retained.
// The incoming URL can contain passwords, bearer links, filenames or patient names.
const segments = new Set(('api auth login logout google callback passwordless reset-password verify-password identify session-activity session-lock-config verify-session-pin users clients documents phi-documents document-signing tasks payroll activity-log security-evidence download export view signed completion-package agencies me admin sessions revoke school-portals school-onboarding outreach-hub receipts invoices reports billing medical-billing appointments notifications presence heartbeat platform-session').split(' '));
export function safeRequestPath(path) {
  return String(path || '/').split('?')[0].split('/').map(s => !s || segments.has(s) ? s : /^\d{1,12}$/.test(s) ? ':id' : ':value').join('/').slice(0, 512);
}
export function routeEvidence(req) {
  const template = typeof req.route?.path === 'string' ? req.route.path : '';
  return template ? `${req.baseUrl ? safeRequestPath(req.baseUrl).replace(/\/$/, '') : ''}${template}`.slice(0, 512) : safeRequestPath(req.originalUrl || req.path);
}
export function resourceEvidence(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.params || {})) {
    if (/^(id|.*Id)$/.test(key) && /^\d{1,12}$/.test(String(value))) out[key] = Number(value);
  }
  // No bodies, query strings, cookies, Authorization, signed URLs or filenames.
  return out;
}
export function classifyResponse(req, res, interrupted = false) {
  const status = Number(res.statusCode) || 500;
  const ok = status >= 200 && status < 400;
  const disposition = String(res.getHeader?.('content-disposition') || '');
  const contentType = String(res.getHeader?.('content-type') || '');
  const file = /^(attachment|inline)\b/i.test(disposition) || /^(application\/(pdf|zip|octet-stream)|text\/csv)/i.test(contentType);
  const link = req.evidenceAction === 'download_link_issued' || containsSignedLink(res.getHeader?.('location'));
  const head = req.method === 'HEAD';
  const action = head ? (file ? 'file_metadata' : 'data_read') : link ? 'download_link_issued' : req.evidenceAction || (file ? 'file_response' : ['GET', 'HEAD'].includes(req.method) ? 'data_read' : 'data_change');
  return { action, outcome: interrupted ? 'interrupted' : status === 401 || status === 403 ? 'denied' : !ok ? 'failed' : status === 304 ? 'not_modified' : status === 204 ? 'no_content' : head ? 'metadata_only' : link ? 'issued' : status >= 300 ? 'redirected' : file ? 'response_sent' : 'succeeded' };
}

export function responseHasBody(req, res) {
  return req.method !== 'HEAD' && Number(res.statusCode) >= 200 && ![204, 304].includes(Number(res.statusCode));
}

// Numeric transfer metadata only. Never retain arbitrary headers, ETags,
// filenames, redirect URLs or response content in the evidence record.
export function responseEvidence(req, res) {
  const transfer = { bodyPermitted: responseHasBody(req, res) };
  const length = String(res.getHeader?.('content-length') ?? '');
  if (/^\d{1,15}$/.test(length)) transfer.declaredBytes = Number(length);
  if (Number(res.statusCode) === 206) transfer.partial = true;
  const range = String(res.getHeader?.('content-range') || '');
  const match = /^bytes (\d{1,15})-(\d{1,15})\/(\d{1,15}|\*)$/.exec(range);
  if (match) {
    const start = Number(match[1]), end = Number(match[2]), total = match[3] === '*' ? null : Number(match[3]);
    if (end >= start && (total === null || end < total)) {
      transfer.rangeStart = start;
      transfer.rangeEnd = end;
      if (total !== null) transfer.resourceBytes = total;
    }
  }
  return { transfer };
}

// Inspect only for the existence of a storage signature; never retain the URL or
// response content. Covers nested JSON bundles and storage redirects centrally.
export function containsSignedLink(value, budget = { remaining: 2000 }) {
  if (--budget.remaining < 0) return false;
  if (typeof value === 'string') return /^https?:\/\//i.test(value) && /[?&](X-Goog-Signature|Signature|X-Amz-Signature)=/i.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(v => containsSignedLink(v, budget));
}

export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
