import { createHash } from 'node:crypto';
import { fail } from './policy.js';
const fields = { apiToken: 'AURICWELL_NOTIFYRE_API_TOKEN', webhookSecret: 'AURICWELL_NOTIFYRE_WEBHOOK_SECRET' };
const fingerprint = value => createHash('sha256').update(value).digest('hex');
// Cloud Run injects Secret Manager values at runtime. Never copy those values
// into the encrypted settings document or expose them to the browser.
export function runtimeIntegrationSecrets(settings, env = process.env) {
  const result = structuredClone(settings);
  for (const [field, variable] of Object.entries(fields)) {
    const value = env[variable] || '';
    const previous = result.notifyre[`${field}Fingerprint`] || '';
    const changed = value ? previous !== fingerprint(value) : !!previous;
    result.notifyre[`${field}Managed`] = !!value;
    if (value) result.notifyre[field] = value;
    if (changed) {
      result.notifyre.webhookVerifiedAt = null;
      if (field === 'apiToken') {
        result.notifyre.verifiedAt = null;
        for (const route of result.clientMessaging?.routes || []) {
          route.faxVerifiedAt = null; route.faxEnabled = false;
          if (route.verifiedProvider === 'notifyre') { route.verifiedAt = null; route.enabled = false; }
        }
      }
    }
  }
  return result;
}
export function storedIntegrationSecrets(settings, env = process.env) {
  const result = structuredClone(settings);
  for (const [field, variable] of Object.entries(fields)) {
    const value = env[variable] || '';
    delete result.notifyre[`${field}Managed`];
    delete result.notifyre[`${field}Fingerprint`];
    if (value) {
      result.notifyre[field] = '';
      result.notifyre[`${field}Fingerprint`] = fingerprint(value);
    }
  }
  return result;
}
export function assertManagedSecretsUnchanged(input, env = process.env) {
  for (const [field, variable] of Object.entries(fields)) {
    const remove = field === 'apiToken' ? 'removeToken' : 'removeWebhookSecret';
    if (env[variable] && (input?.notifyre?.[field] || input?.notifyre?.[remove]))
      throw fail(409, 'This credential is managed in Google Secret Manager. Update it there, then deploy a new backend revision.');
  }
}
