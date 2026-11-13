import { legalProfileForContext, tenantLegalProfiles, tenantLegalLinks } from '../content/tenantLegalProfiles.js';

export function serviceLegalContext({ host = '', path = '', organizationSlug = '', role = '', schoolPortal = false, serviceType = '' } = {}) {
  const school = schoolPortal || role === 'school_staff' || /^\/schoolcarebridge(?:\/|$)/.test(path)
    || /^(?:(?:www|app)\.)?schoolcarebridge\.org$/i.test(host);
  const tenant = legalProfileForContext({ host, path, organizationSlug });
  const learning = !school && tenant?.slug === 'nlu' && ( /\/(?:login|find-tutor|join\/tutoring)(?:\/|$)/.test(path) ||['tutoring','learning','childcare'].includes(serviceType)
    || /\/(?:tutoring|tutoring-profile|students|childcare)(?:\/|$)/.test(path));
  if (learning) return {
    name: tenant.name,
    nonclinical: true,
    notice: 'Next Level Up provides tutoring, learning and childcare services. Use only information your organization authorizes you to access. Learning and childcare access does not grant access to clinical records. Your service agreements and the Next Level Up terms and privacy policy apply.',
    links: tenantLegalLinks(tenant).filter(link => link.type !== 'platformhipaa').map(link => ({
      label: `${tenant.name} ${link.type === 'terms' ? 'Terms of Use' : link.label}`,
      href: (tenant.legalOrigin || tenant.origin) + link.path
    }))
  };
  const service = school ? tenantLegalProfiles.schoolcarebridge : tenantLegalProfiles.auricwell;
  const profiles = [service, ...(school ? [tenantLegalProfiles.auricwell] : []), ...(tenant && tenant.slug !== service.slug ? [tenant] : [])];
  return {
    name: service.name,
    notice: school
      ? 'SchoolCareBridge is a program of MH4Kidz, with technology managed by Plot Twist Co. Use only records your school or organization authorizes you to access. School records and provider clinical records have different access rules. Portal access is not permission to disclose records. Client enrollment and clinical information is stored through AuricWell, with access controlled by your role and authorization. Read the AuricWell privacy policy for information about data storage, protection and retention.'
      : 'AuricWell provides software operated by Plot Twist Co. Your practice remains responsible for its services and clinical records. Platform terms apply to using the software; your practice’s notices and agreements apply to its services.',
    links: profiles.flatMap(profile => tenantLegalLinks(profile).filter(link => link.type !== 'platformhipaa').map(link => ({
      label: `${profile.name} ${link.type === 'terms' ? 'Terms of Use' : link.label}`,
      href: (profile.legalOrigin || profile.origin) + link.path
    })))
  };
}
