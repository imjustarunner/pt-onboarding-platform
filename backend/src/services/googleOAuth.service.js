import crypto from 'crypto';
import { google } from 'googleapis';
 
function getClientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID || '';
}
 
function getClientSecret() {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
}
 
function getRedirectUri() {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
}
 
function getStateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'state-secret-change-me';
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
 
export function getGoogleOAuthClient({ redirectUri: redirectUriOverride = null } = {}) {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const redirectUri = String(redirectUriOverride || getRedirectUri() || '').trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
 
export function getGoogleAuthorizeUrl({ state, nonce, prompt = 'select_account', redirectUri = null }) {
  const client = getGoogleOAuthClient({ redirectUri });
  return client.generateAuthUrl({
    access_type: 'online',
    response_type: 'code',
    scope: ['openid', 'email', 'profile'],
    prompt,
    state,
    nonce
  });
}
 
export async function exchangeCodeForTokens({ code, redirectUri = null }) {
  const client = getGoogleOAuthClient({ redirectUri });
  const { tokens } = await client.getToken(String(code));
  return tokens;
}
 
