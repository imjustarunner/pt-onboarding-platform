import crypto from 'crypto';
import axios from 'axios';

function getClientId() {
  return process.env.QUICKBOOKS_CLIENT_ID || process.env.QBO_CLIENT_ID || '';
}

function getClientSecret() {
  return process.env.QUICKBOOKS_CLIENT_SECRET || process.env.QBO_CLIENT_SECRET || '';
}

function getRedirectUri() {
  return process.env.QUICKBOOKS_REDIRECT_URI || process.env.QBO_REDIRECT_URI || '';
}

function getStateSecret() {
  return process.env.QUICKBOOKS_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'state-secret-change-me';
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

export function createSignedState(payload) {
  const body = {
    ...payload,
    nonce: crypto.randomBytes(12).toString('hex'),
    ts: Date.now()
  };
  const json = JSON.stringify(body);
  const sigBytes = crypto.createHmac('sha256', getStateSecret()).update(json).digest();
  return `${base64UrlEncode(json)}.${base64UrlEncode(sigBytes)}`;
}

export function verifySignedState(state, { maxAgeMs = 10 * 60 * 1000 } = {}) {
  const [b64Payload, b64Sig] = String(state || '').split('.');
  if (!b64Payload || !b64Sig) return null;
  try {
    const json = base64UrlDecode(b64Payload);
    const expectedSigBytes = crypto.createHmac('sha256', getStateSecret()).update(json).digest();
    const expectedB64Url = base64UrlEncode(expectedSigBytes);
    if (expectedB64Url !== b64Sig) return null;

    const payload = JSON.parse(json);
    if (!payload.ts || (Date.now() - payload.ts) > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getQuickBooksAuthorizeUrl({ state, scope = 'com.intuit.quickbooks.accounting' }) {
  const clientId = getClientId();
  const redirectUri = getRedirectUri();
  if (!clientId || !redirectUri) {
    throw new Error('QuickBooks OAuth is not configured (clientId/redirectUri)');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    response_type: 'code',
    state
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code }) {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = getRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QuickBooks OAuth is not configured (clientId/clientSecret/redirectUri)');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const res = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', body.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    timeout: 20000
  });
  return res.data;
}

export async function refreshAccessToken({ refreshToken }) {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('QuickBooks OAuth is not configured (clientId/clientSecret)');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const res = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', body.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    timeout: 20000
  });
  return res.data;
}

