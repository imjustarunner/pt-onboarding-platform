/** Explicit route tenant wins over the host; never infer ownership from a cached theme. */
export function isItscoLegalContext({ host = '', organizationSlug = '' } = {}) {
  if (organizationSlug) return String(organizationSlug).toLowerCase() === 'itsco';
  return ['itsco.health', 'www.itsco.health', 'app.itsco.health', 'qv.itsco.health', 'qv.app.itsco.health']
    .includes(String(host).toLowerCase().split(':')[0]);
}
