/**
 * Signed tokens for public contact-reminder preference links (no login).
 */
import crypto from 'crypto';

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const ACTIONS = new Set(['email_only', 'sms_only', 'both', 'off', 'view']);

function secret() {
  return (
    process.env.CONTACT_REMINDER_TOKEN_SECRET ||
    process.env.QUICK_VIEW_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    'contact-reminder-dev-secret'
  );
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(s, 'base64').toString('utf8');
}

/**
 * @param {{ affiliationId: number, action: string, expMs?: number }} opts
 */
export function signContactReminderToken({ affiliationId, action, expMs } = {}) {
  const act = String(action || 'view').toLowerCase();
  if (!ACTIONS.has(act)) throw new Error('Invalid action');
  const id = Number(affiliationId);
  if (!id) throw new Error('affiliationId required');
  const exp = Number(expMs) || Date.now() + DEFAULT_TTL_MS;
  const payload = JSON.stringify({ a: id, c: act, e: exp });
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyContactReminderToken(token) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) {
    const err = new Error('Invalid token');
    err.status = 400;
    throw err;
  }
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('Invalid or tampered token');
    err.status = 400;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(fromB64url(body));
  } catch {
    const err = new Error('Invalid token payload');
    err.status = 400;
    throw err;
  }
  if (!parsed?.a || !ACTIONS.has(String(parsed.c || ''))) {
    const err = new Error('Invalid token payload');
    err.status = 400;
    throw err;
  }
  if (Number(parsed.e) < Date.now()) {
    const err = new Error('This link has expired');
    err.status = 410;
    throw err;
  }
  return {
    affiliationId: Number(parsed.a),
    action: String(parsed.c),
    expiresAt: Number(parsed.e)
  };
}

export function publicAppBaseUrl() {
  return String(
    process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'https://plottwisthq.com'
  ).replace(/\/$/, '');
}

export function buildContactReminderLinks(affiliationId, baseUrl = publicAppBaseUrl()) {
  const root = `${baseUrl}/api/public/contact-reminders`;
  const mk = (action) => `${root}/${encodeURIComponent(signContactReminderToken({ affiliationId, action }))}`;
  return {
    view: mk('view'),
    emailOnly: mk('email_only'),
    smsOnly: mk('sms_only'),
    both: mk('both'),
    off: mk('off')
  };
}
