import { legalProfileForContext, tenantLegalProfiles, tenantLegalLinks } from '../content/tenantLegalProfiles.js';

export function serviceLegalContext({ host = '', path = '', organizationSlug = '', role = '', schoolPortal = false } = {}) {
  const school = schoolPortal || role === 'school_staff' || /^\/schoolcarebridge(?:\/|$)/.test(path)
    || /^(?:www\.)?schoolcarebridge\.org$/i.test(host);
  const tenant = legalProfileForContext({ host, path, organizationSlug });
  const service = school ? tenantLegalProfiles.schoolcarebridge : tenantLegalProfiles.auricwell;
  const profiles = [service, ...(tenant && tenant.slug !== service.slug ? [tenant] : [])];
  return {
    name: service.name,
    notice: school
      ? 'SchoolCareBridge is a program of MH4Kidz, with technology managed by Plot Twist Co. Use only records your school or organization authorizes you to access. School records and provider clinical records have different access rules. Portal access is not permission to disclose records.'
      : 'AuricWell provides software operated by Plot Twist Co. Your practice remains responsible for its services and clinical records. Platform terms apply to using the software; your practice’s notices and agreements apply to its services.',
    links: profiles.flatMap(profile => tenantLegalLinks(profile).filter(link => link.type !== 'platformhipaa').map(link => ({
      label: `${profile.name} ${link.type === 'terms' ? 'Terms of Use' : 'Privacy Policy'}`,
      href: (profile.legalOrigin || profile.origin) + link.path
    })))
  };
}
