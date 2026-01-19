import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

let cached = null;

function resolveDefaultKeyPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // backend/src/services/unifiedEmail/ -> backend/secrets/service-account.json
  return path.resolve(__dirname, '../../../secrets/service-account.json');
}

function loadServiceAccountKey() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolveDefaultKeyPath();
  const raw = fs.readFileSync(keyPath, 'utf8');
  const json = JSON.parse(raw);
  if (!json?.client_email || !json?.private_key) {
    throw new Error('Service account key JSON missing client_email/private_key');
  }
  return { json, keyPath };
}

export function getImpersonatedUser() {
  return (
    process.env.GMAIL_IMPERSONATE_USER ||
    process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
    'ai@plottwistco.com'
  );
}

export function getGmailClient() {
  const impersonate = getImpersonatedUser();
  const { json, keyPath } = loadServiceAccountKey();

  const cacheKey = `${json.client_email}::${impersonate}::${keyPath}`;
  if (cached?.cacheKey === cacheKey) return cached.gmail;

  // Domain-wide delegation via JWT (impersonation)
  const auth = new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    subject: impersonate,
    scopes: [
      // Read + label modifications for the agent
      'https://www.googleapis.com/auth/gmail.modify',
      // Send mail for both modules
      'https://www.googleapis.com/auth/gmail.send'
    ]
  });

  const gmail = google.gmail({ version: 'v1', auth });
  cached = { cacheKey, gmail };
  return gmail;
}

