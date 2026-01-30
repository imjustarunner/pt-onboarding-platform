import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  GOOGLE_WORKSPACE_SCOPES,
  parseGoogleWorkspaceServiceAccountFromEnv
} from '../googleWorkspaceAuth.service.js';

let cached = null;

export function getImpersonatedUser() {
  return (
    process.env.GMAIL_IMPERSONATE_USER ||
    process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
    'ai@plottwistco.com'
  );
}

export async function getGmailClient() {
  const impersonate = getImpersonatedUser();
  const sa = parseGoogleWorkspaceServiceAccountFromEnv();
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 is not configured');
  }

  const cacheKey = `${sa.client_email}::${impersonate}::GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64`;
  if (cached?.cacheKey === cacheKey) return cached.gmail;

  // Domain-wide delegation via JWT (impersonation)
  // NOTE: We include your required Gmail scopes (readonly/send/compose) and add gmail.modify
  // because this module applies labels and marks messages.
  const auth = await buildImpersonatedJwtClient({
    subjectEmail: impersonate,
    scopes: [...GOOGLE_WORKSPACE_SCOPES, 'https://www.googleapis.com/auth/gmail.modify']
  });

  const gmail = google.gmail({ version: 'v1', auth });
  cached = { cacheKey, gmail };
  return gmail;
}

