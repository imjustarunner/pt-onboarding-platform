import { createHash } from 'node:crypto';

export const payerLinkFingerprint = policy => createHash('sha256').update(JSON.stringify(Object.keys(policy).sort().map(key => [key, policy[key]]))).digest('hex');

export function exactCatalogPayer(policy, catalog) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = normalize(policy.insurerName);
  const id = String(policy.sourcePayerId || '').trim();
  if (!name) return null;
  const routes = catalog.filter(row => row.payerId);
  const named = routes.filter(row => (row.names || [row.name]).some(value => normalize(value) === name));
  // Explicit agency mappings take precedence over generic directory aliases.
  const agency = named.filter(row => !row.sharedDirectory);
  const candidates = agency.length ? agency : named;
  const idMatches = row => [row.sourcePayerId, row.payerId].some(value => String(value || '') === id);
  const exact = id ? candidates.filter(idMatches) : [];
  // An ID pointing at another known carrier is contradictory evidence.
  if (id && !exact.length && routes.some(idMatches)) return null;
  const matches = [...new Map((exact.length ? exact : candidates).map(row =>
    [`${row.payerId}:${row.eligibilityPayerId || row.payerId}`, row])).values()];
  return matches.length === 1 ? matches[0] : null;
}
