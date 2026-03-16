/**
 * Strava OAuth service for Summit Stats Challenge
 * Connect user Strava accounts for profile linking and future workout auto-import.
 * Strava API: https://developers.strava.com/docs/authentication/
 */
import crypto from 'crypto';
import axios from 'axios';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

function getClientId() {
  return process.env.STRAVA_CLIENT_ID || '';
}

function getClientSecret() {
  return process.env.STRAVA_CLIENT_SECRET || '';
}

function getRedirectUri() {
  return process.env.STRAVA_REDIRECT_URI || '';
}

function getStateSecret() {
  return process.env.STRAVA_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'strava-state-secret';
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
  const body = { ...payload, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() };
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
    if (base64UrlEncode(expectedSigBytes) !== b64Sig) return null;
    const payload = JSON.parse(json);
    if (!payload.ts || Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isConfigured() {
  return !!(getClientId() && getClientSecret() && getRedirectUri());
}

export function getAuthorizeUrl({ state, redirectUri: override = null }) {
  const clientId = getClientId();
  const redirectUri = String(override || getRedirectUri() || '').trim();
  if (!clientId || !redirectUri) throw new Error('Strava OAuth is not configured (STRAVA_CLIENT_ID, STRAVA_REDIRECT_URI)');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'force',
    scope: 'read,activity:read_all',
    state
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, redirectUri }) {
  const clientSecret = getClientSecret();
  if (!clientSecret) throw new Error('Strava OAuth is not configured (STRAVA_CLIENT_SECRET)');
  const res = await axios.post(
    STRAVA_TOKEN_URL,
    {
      client_id: getClientId(),
      client_secret: clientSecret,
      code: String(code).trim(),
      grant_type: 'authorization_code'
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const data = res.data || {};
  const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 19).replace('T', ' ') : null,
    athlete: data.athlete || {}
  };
}

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export async function refreshAccessToken(refreshToken) {
  const clientSecret = getClientSecret();
  if (!clientSecret) throw new Error('Strava OAuth is not configured');
  const res = await axios.post(
    STRAVA_TOKEN_URL,
    {
      client_id: getClientId(),
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const data = res.data || {};
  const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 19).replace('T', ' ') : null
  };
}

/**
 * Fetch athlete activities from Strava API.
 * @param {string} accessToken - Valid Strava access token
 * @param {Object} opts - { after (epoch sec), before (epoch sec), page, per_page }
 * @returns {Promise<Array>} SummaryActivity objects
 */
export async function fetchAthleteActivities(accessToken, opts = {}) {
  const params = new URLSearchParams();
  if (opts.after != null) params.set('after', String(opts.after));
  if (opts.before != null) params.set('before', String(opts.before));
  if (opts.page != null) params.set('page', String(opts.page));
  if (opts.per_page != null) params.set('per_page', String(Math.min(100, opts.per_page || 30)));
  const qs = params.toString();
  const url = `${STRAVA_API_BASE}/athlete/activities${qs ? `?${qs}` : ''}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Fetch a single activity by ID (must belong to the authenticated athlete).
 * @param {string} accessToken - Valid Strava access token
 * @param {number} activityId - Strava activity ID
 * @returns {Promise<Object|null>} DetailedActivity or null
 */
export async function fetchActivityById(accessToken, activityId) {
  const id = Number(activityId);
  if (!id) return null;
  try {
    const res = await axios.get(`${STRAVA_API_BASE}/activities/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data || null;
  } catch {
    return null;
  }
}
