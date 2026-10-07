export const ITSCO_PUBLIC_ORIGIN = 'https://www.itsco.health';

export function providerProfileSlug(provider) {
 const name = String(provider.displayName || provider.name || [provider.first_name || provider.firstName,provider.last_name || provider.lastName].filter(Boolean).join(' ') || 'provider')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 return `${name || 'provider'}-${Number(provider.id)}`;
}
export const providerProfilePath = provider => `/p/itsco/providers/${providerProfileSlug(provider)}`;
/** Public sharing must not inherit an app, preview, or administrator hostname. */
export function providerProfileUrl(provider, query = {}) {
 const url = new URL(`/providers/${providerProfileSlug(provider)}`, ITSCO_PUBLIC_ORIGIN);
 for (const [key, value] of Object.entries(query)) {
  if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
 }
 return url.href;
}
export function providerIdFromRoute(route) {
 const slug = String(route.params?.providerSlug || '');
 return slug ? slug.match(/-([1-9][0-9]*)$/)?.[1] || '' : String(route.query?.provider || '');
}
