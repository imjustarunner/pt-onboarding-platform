export function providerProfileSlug(provider) {
 const name = String(provider.displayName || [provider.first_name,provider.last_name].filter(Boolean).join(' ') || 'provider')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 return `${name || 'provider'}-${Number(provider.id)}`;
}
export const providerProfilePath = provider => `/p/itsco/providers/${providerProfileSlug(provider)}`;
export function providerIdFromRoute(route) {
 const slug = String(route.params?.providerSlug || '');
 return slug ? slug.match(/-([1-9][0-9]*)$/)?.[1] || '' : String(route.query?.provider || '');
}
