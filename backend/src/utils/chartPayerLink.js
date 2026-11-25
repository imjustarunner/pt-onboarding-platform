import { createHash } from 'node:crypto';

export const payerLinkFingerprint = policy => createHash('sha256').update(JSON.stringify(Object.keys(policy).sort().map(key => [key, policy[key]]))).digest('hex');

export function exactCatalogPayer(policy, catalog) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = normalize(policy.insurerName);
  const payerIdKey = value => String(value || '').trim().toUpperCase();
  const id = payerIdKey(policy.sourcePayerId);
  if (!name) return null;
  const routes = catalog.filter(row => row.payerId);
  const idMatches = row => !!id && [row.sourcePayerId, row.payerId].some(value => payerIdKey(value) === id);
  const compact = value => value.replace(/ /g, '');
  const compactName = compact(name);
  const named = routes.filter(row => [row.name, row.directoryName, ...(row.names || [])].some(value => {
    const candidate = normalize(value);
    // Pasted payer names can omit spaces. Require the verified ID to corroborate that match.
    return candidate === name || (idMatches(row) && compact(candidate) === compactName);
  }));
  const exact = named.filter(idMatches);
  // An ID pointing at another known carrier is contradictory evidence.
  if (id && !exact.length && routes.some(idMatches)) return null;
  const preferred = exact.length ? exact : named;
  // Explicit agency mappings take precedence over generic directory aliases.
  const agency = preferred.filter(row => !row.sharedDirectory);
  const candidates = agency.length ? agency : preferred;
  const matches = [...new Map(candidates.map(row =>
    [`${row.payerId}:${row.eligibilityPayerId || row.payerId}`, row])).values()];
  return matches.length === 1 ? matches[0] : null;
}
