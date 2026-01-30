import { google } from 'googleapis';

// Required scopes (match Admin Console DWD configuration)
export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

export function parseGoogleWorkspaceServiceAccountFromEnv() {
  // Per requirement: read/decode GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64.
  const b64 = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) return null;
  try {
    const jsonText = Buffer.from(b64, 'base64').toString('utf8');
    const json = JSON.parse(jsonText);
    if (!json?.client_email || !json?.private_key) return null;
    return json;
  } catch {
    return null;
  }
}

export function isGoogleUnauthorizedError(err) {
  const status = err?.code || err?.response?.status || err?.status || null;
  const msg = String(err?.message || err?.response?.data?.error?.message || '').toLowerCase();
  return status === 401 || msg.includes('unauthorized');
}

export function logGoogleUnauthorizedHint(err, { context = '' } = {}) {
  if (!isGoogleUnauthorizedError(err)) return;
  const prefix = context ? `[${context}] ` : '';
  // Requirement: log a warning suggesting Gmail scopes may not be propagated yet.
  // (This is common after updating DWD scopes in Admin Console.)
  // eslint-disable-next-line no-console
  console.warn(
    `${prefix}Google API returned Unauthorized. If Calendar works but Gmail does not, your Gmail DWD scopes may not have propagated in Google Admin Console yet.`
  );
}

export async function buildImpersonatedJwtClient({
  subjectEmail,
  scopes = GOOGLE_WORKSPACE_SCOPES
} = {}) {
  const sa = parseGoogleWorkspaceServiceAccountFromEnv();
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 is not configured (missing client_email/private_key)');
  }

  const subject = String(subjectEmail || '').trim().toLowerCase();
  if (!subject) throw new Error('Missing subject (employee email) for Google Workspace impersonation');

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: Array.isArray(scopes) && scopes.length ? scopes : GOOGLE_WORKSPACE_SCOPES,
    subject
  });

  // Force token fetch now so failures surface early.
  await auth.authorize();
  return auth;
}

/**
 * Initialize BOTH Calendar and Gmail clients using the same authenticated JWT client.
 * This matches your requirement: one auth -> many services.
 */
export async function getWorkspaceClientsForEmployee({ subjectEmail } = {}) {
  const auth = await buildImpersonatedJwtClient({ subjectEmail });
  const calendar = google.calendar({ version: 'v3', auth });
  const gmail = google.gmail({ version: 'v1', auth });
  return { auth, calendar, gmail };
}

