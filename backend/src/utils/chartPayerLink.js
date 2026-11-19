import { createHash } from 'node:crypto';

export const payerLinkFingerprint = policy => createHash('sha256').update(JSON.stringify(Object.keys(policy).sort().map(key => [key, policy[key]]))).digest('hex');

export function exactCatalogPayer(policy, catalog) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = normalize(policy.insurerName);
  const id = String(policy.sourcePayerId || '').trim();
  if (!id || !name) return null;
  const matches = catalog.filter(row => row.payerId
    && [row.sourcePayerId, row.payerId].some(value => String(value || '') === id)
    && row.names.some(value => normalize(value) === name));
  return matches.length === 1 ? matches[0] : null;
}
