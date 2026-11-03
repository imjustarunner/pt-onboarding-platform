// Confirmed by the practice owner on November 3, 2026. This public directory is
// deliberately separate from tenant/account enumeration and private agreements.
export const partners = Object.freeze([
  { slug: 'schoolcarebridge', name: 'SchoolCareBridge', kind: 'School & agency coordination', logo: '/assets/schoolcarebridge/logo.png', website: 'https://schoolcarebridge.org', description: 'Connecting schools, agencies and families through coordinated enrollment and care workflows. A Plot Twist Co. product, with programs operated by MH4Kidz.', links: [['Explore partnerships', 'https://schoolcarebridge.org/partners'], ['For agencies', 'https://schoolcarebridge.org/for-agencies']] },
  { slug: 'mh4kidz', name: 'MH4Kidz', kind: 'Community & program partner', logo: '/assets/mh4kidz/logo.png', website: 'https://mh4kidz.org', description: 'Supporting access to care for children and families through community partnerships and program coordination.', links: [['About MH4Kidz', 'https://mh4kidz.org/about'], ['Provider & program inquiries', 'https://mh4kidz.org/contact']] },
  { slug: 'itsco', name: 'ITSCO', kind: 'Counseling practice', logo: '/assets/itsco/logo.png', website: 'https://www.itsco.health', description: 'A counseling practice helping clients and families connect with providers and begin their care journey.', links: [['Meet the providers', 'https://www.itsco.health/providers'], ['Contact the practice', 'https://www.itsco.health/contact']] },
  { slug: 'nlu', name: 'Next Level Up Learning and Counseling Centers', kind: 'Learning & counseling', logo: '/assets/nlu/logo.png', website: 'https://nextleveluplcc.com', description: 'Learning and counseling services that bring educational support and personal growth together.', links: [['Meet the providers', 'https://nextleveluplcc.com/providers'], ['Find a counselor', 'https://nextleveluplcc.com/nlu/find-counselor'], ['Find a tutor', 'https://nextleveluplcc.com/nlu/find-tutor']] },
  { slug: 'tisi', name: 'The Inner Strength Institute', kind: 'Care & personal growth', logo: '/assets/branding/innerstrength-mark.png', website: 'https://theinnerstrengthinstitute.com', description: 'A partner organization focused on care, connection and building inner strength.', links: [['Practice & provider inquiries', 'https://theinnerstrengthinstitute.com/contact']] },
  { slug: 'rise', name: 'Rise Revive Counseling and Coaching', kind: 'Counseling & coaching', logo: '/assets/rise/logo.webp', website: 'https://risereviveco.com', description: 'Counseling and coaching with a focus on personal growth and moving forward.', links: [['About Rise Revive', 'https://risereviveco.com/about'], ['Practice & provider inquiries', 'https://risereviveco.com/contact']] }
]);

export const featureNavigation = Object.freeze([
  ['office', 'Kiosk & office management'], ['scheduling', 'Scheduling & reservations'],
  ['appointment-reminders', 'Appointment texts & Y confirmation'], ['texting', '1-to-1 provider texting'],
  ['guardians', 'Multiple guardian accounts'], ['intake', 'Enrollment & digital consent'],
  ['documentation', 'Notes & optional AI'], ['progress', 'Rated treatment plans'],
  ['supervision', 'Supervision & co-sign review'], ['billing', 'Billing & claims'],
  ['virtual-office', 'Private virtual offices'], ['plans', 'Plans & availability']
]);

export const serviceInquiries = Object.freeze({
  billing: { title: 'Let’s talk billing', message: 'I would like help with billing for my practice. Please contact me about services and next steps.' },
  credentialing: { title: 'Let’s talk credentialing', message: 'I would like help with credentialing for my practice. Please contact me about services and next steps.' },
  'people-operations': { title: 'Let’s talk people operations', message: 'I would like help with people operations for my organization. Please contact me about services and next steps.' }
});

export function managementSection({ link }) {
  return `<section class="section management-section" id="management"><div class="management-strip"><div class="management-logo"><img src="/assets/ptco/logo-flat.webp" alt="Plot Twist Co." loading="lazy" width="220" height="88"></div><div><p class="eyebrow">THE TEAM BEHIND THE PLATFORM</p><h2>Managed by Plot Twist Co.</h2><p>AuricWell is a Plot Twist Co. product. We work closely with the management team to connect the software with the practical work of running a practice, including billing, credentialing and people operations.</p><p class="feature-note">Management services are scoped separately to fit your organization.</p></div></div><div class="service-cards">${[['billing','Billing','Support for the work from claim preparation through follow-up.'],['credentialing','Credentialing','Help organizing payer applications, provider information and next steps.'],['people-operations','People Operations','Hiring, onboarding and the day-to-day work of supporting your team.']].map(([key,title,description])=>`<article><h3>${title}</h3><p>${description}</p>${link(`contact?service=${key}#contact-form`,`I need ${title}`,'text-link')}</article>`).join('')}</div></section>`;
}

export function integrationsSection() {
  const integrations = [
    ['Plot Twist Co.', '/assets/ptco/logo-flat.webp', 'Management services', 'Practice operations connect with billing, credentialing and people operations support from the team behind AuricWell.', 'https://plottwistco.com'],
    ['Plotline', '/assets/plotline/website/brand/logos/plotline-primary-transparent.webp', 'People operations', 'Connected staff workflows bring hiring, onboarding, documents, training and evaluations into the wider platform.', 'https://plotlinepo.com'],
    ['SchoolCareBridge', '/assets/schoolcarebridge/logo.png', 'School & agency coordination', 'Connected enrollment and agency coordination support organizations working across school and clinical care settings.', 'https://schoolcarebridge.org']
  ];
  return `<section class="section tinted" id="integrations"><div class="section-heading"><div><p class="eyebrow">INTEGRATIONS & CONNECTED SERVICES</p><h2>A practice connected<br> to the bigger picture.</h2></div><p>AuricWell works within the Plot Twist Co. platform, connecting clinical work with the teams and services around it.</p></div><div class="ecosystem-grid">${integrations.map(([name,logo,kind,description,href])=>`<article class="ecosystem-card"><div class="ecosystem-logo"><img src="${logo}" alt="${name}" loading="lazy" width="240" height="90"></div><span class="quiet-tag">Integrated platform</span><h3>${name}</h3><p class="ecosystem-kind">${kind}</p><p>${description}</p><a class="text-link" href="${href}" target="_blank" rel="noopener">Explore ${name} ↗</a></article>`).join('')}</div><p class="feature-note">Connections and service access depend on your organization’s configuration, permissions and agreements. Each product retains its own purpose and workspace.</p></section>`;
}

export function partnersSection({ hero, link }) {
  return `${hero('OUR PARTNER NETWORK', 'Care takes<br> <em>good partners.</em>', 'Meet the practices, programs and organizations connected with AuricWell. Explore their work, find their teams and reach out directly.', '', false)}<section class="section partner-directory" aria-label="AuricWell partners"><div class="partner-jump">${partners.map(p=>`<a href="#${p.slug}">${p.name}</a>`).join('')}</div><div class="ecosystem-grid">${partners.map(p=>`<article class="ecosystem-card partner-card" id="${p.slug}" data-partner="${p.slug}"><div class="ecosystem-logo"><img src="${p.logo}" alt="${p.name}" loading="lazy" width="240" height="90"></div><span class="partner-label">AuricWell Partner</span><p class="ecosystem-kind">${p.kind}</p><h2>${p.name}</h2><p>${p.description}</p><a class="text-link partner-website" href="${p.website}" target="_blank" rel="noopener">Visit website ↗</a><div class="partner-links">${p.links.map(([label,href])=>`<a href="${href}" target="_blank" rel="noopener">${label} ↗</a>`).join('')}</div></article>`).join('')}</div><p class="feature-note">Each organization manages its own services, provider availability and inquiries.</p><div class="actions">${link('contact','Connect your organization')}${link('about#integrations','Explore our integrations','button secondary')}</div></section>`;
}
