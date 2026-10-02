export const APP_EMAIL_TRANSPORT = 'ai@plottwistco.com';

/** The app sends tenant aliases through one mailbox, never a directory admin or employee account. */
export function resolveAppEmailTransport(env = process.env, explicitMailbox = null) {
  const configured = String(explicitMailbox || env.GMAIL_IMPERSONATE_USER || env.GOOGLE_WORKSPACE_IMPERSONATE_USER || APP_EMAIL_TRANSPORT).trim().toLowerCase();
  if (configured !== APP_EMAIL_TRANSPORT) {
    throw Object.assign(new Error('App email must use ai@plottwistco.com as its sending account. Correct the mailbox configuration before sending.'), {
      code: 'EMAIL_TRANSPORT_MISCONFIGURED'
    });
  }
  return APP_EMAIL_TRANSPORT;
}
