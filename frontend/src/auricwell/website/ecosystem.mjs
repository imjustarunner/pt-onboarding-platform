import { ptcoServices } from '../../constants/ptcoWebsite.js';

// Confirmed by the practice owner on November 3, 2026. This public directory is
// deliberately separate from tenant/account enumeration and private agreements.
export const partners = Object.freeze([
  { slug: 'schoolcarebridge', name: 'SchoolCareBridge', kind: 'School & agency coordination', logo: '/assets/schoolcarebridge/wordmark.svg', website: 'https://schoolcarebridge.org', description: 'Connecting schools, agencies and families through coordinated enrollment and care workflows. A Plot Twist Co. product, with programs operated by MH4Kidz.', links: [['Explore partnerships', 'https://schoolcarebridge.org/partners'], ['For agencies', 'https://schoolcarebridge.org/for-agencies']] },
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

// Reuse the management team's published service catalog rather than maintaining
// a second description of their scope on AuricWell.
export const managementServices = Object.freeze([
  { key:'billing', title:'Billing', catalog:'medical-billing', note:'New AuricWell contracts start in 2027. Talk with Plot Twist Co. about billing in your existing EHR or planning your transition.', brand:'Plot Twist Co.', logo:'/assets/ptco/logo-flat.webp', website:'https://plottwistco.com', contact:'https://plottwistco.com/contact?topic=billing#contact-form' },
  { key:'credentialing', title:'Credentialing', catalog:'credentialing', brand:'Plot Twist Co.', logo:'/assets/ptco/logo-flat.webp', website:'https://plottwistco.com', contact:'https://plottwistco.com/contact?topic=credentialing#contact-form' },
  { key:'people-operations', title:'People Operations', catalog:'people', brand:'Plotline', logo:'/assets/plotline/website/brand/logos/favicon-48.png', website:'https://plotlinepo.com', contact:'https://plotlinepo.com/start?topic=people-operations#contact-form' }
]);

export function managementShortcuts(url) {
  return `<div class="practice-help" aria-label="Practice management services"><span>How can we help your practice?</span>${managementServices.map(s=>`<a href="${url(`about#service-${s.key}`)}" data-management-link><img src="${s.logo}" alt="" width="20" height="20">I need ${s.title}</a>`).join('')}</div>`;
}

export function managementSection() {
  return `<section class="section management-section" id="management"><div class="management-strip"><div class="management-logo"><img src="/assets/ptco/logo-flat.webp" alt="Plot Twist Co." loading="lazy" width="220" height="88"></div><div><p class="eyebrow">THE TEAM BEHIND THE PLATFORM</p><h2>Managed by Plot Twist Co.</h2><p>AuricWell is a Plot Twist Co. product. We work closely with the management team to connect the software with the practical work of running a practice, including billing, credentialing and people operations.</p><p class="feature-note">Explore the support you need below. Management services are scoped separately to fit your organization.</p></div></div><div class="service-cards">${managementServices.map(service=>{
    const catalog=ptcoServices.find(s=>s.id===service.catalog);
    return `<details class="management-service" id="service-${service.key}" data-management-service="${service.key}"><summary><div class="service-card-heading"><img src="${service.logo}" alt="" width="38" height="38"><div><span class="service-brand">${service.brand}</span><h3>${service.title}</h3></div><span class="service-expand" aria-hidden="true">+</span></div><p>${catalog.body}</p><span class="service-read-more">Explore ${service.title.toLowerCase()} support</span></summary><div class="service-details"><p class="service-intro">${catalog.detail}</p><div class="service-details-grid"><div><h4>How we can help</h4><ul>${catalog.includes.map(item=>`<li>${item}</li>`).join('')}</ul></div><div><h4>What happens next</h4><ol>${catalog.process.map(item=>`<li>${item}</li>`).join('')}</ol></div></div><p class="service-scope">${catalog.pricing}</p>${service.note?`<p class="feature-note">${service.note}</p>`:''}<div class="service-actions"><a class="button" href="${service.contact}">Contact ${service.brand} <span aria-hidden="true">↗</span></a><a class="text-link" href="${service.website}">Visit ${service.brand} website <span aria-hidden="true">↗</span></a></div></div></details>`;
  }).join('')}</div></section>`;
}

export function integrationsSection() {
  const integrations = [
    ['Plot Twist Co.', '/assets/ptco/logo-flat.webp', 'Management services', 'Practice operations connect with billing, credentialing and people operations support from the team behind AuricWell.', 'https://plottwistco.com'],
    ['Plotline', '/assets/plotline/website/brand/logos/plotline-primary-transparent.webp', 'People operations', 'Connected staff workflows bring hiring, onboarding, documents, training and evaluations into the wider platform.', 'https://plotlinepo.com'],
    ['SchoolCareBridge', '/assets/schoolcarebridge/wordmark.svg', 'School & agency coordination', 'Connected enrollment and agency coordination support organizations working across school and clinical care settings.', 'https://schoolcarebridge.org']
  ];
  return `<section class="section tinted" id="integrations"><div class="section-heading"><div><p class="eyebrow">INTEGRATIONS & CONNECTED SERVICES</p><h2>A practice connected<br> to the bigger picture.</h2></div><p>AuricWell works within the Plot Twist Co. platform, connecting clinical work with the teams and services around it.</p></div><div class="ecosystem-grid">${integrations.map(([name,logo,kind,description,href])=>`<article class="ecosystem-card"><div class="ecosystem-logo"><img src="${logo}" alt="${name}" loading="lazy" width="240" height="90"></div><span class="quiet-tag">Integrated platform</span><h3>${name}</h3><p class="ecosystem-kind">${kind}</p><p>${description}</p><a class="text-link" href="${href}" target="_blank" rel="noopener">Explore ${name} ↗</a></article>`).join('')}</div><p class="feature-note">Connections and service access depend on your organization’s configuration, permissions and agreements. Each product retains its own purpose and workspace.</p></section>`;
}

export function partnersSection({ hero, link }) {
  return `${hero('OUR PARTNER NETWORK', 'Care takes<br> <em>good partners.</em>', 'Meet the practices, programs and organizations connected with AuricWell. Explore their work, find their teams and reach out directly.', '', false)}<section class="section partner-directory" aria-label="AuricWell partners"><div class="partner-jump">${partners.map(p=>`<a href="#${p.slug}">${p.name}</a>`).join('')}</div><div class="ecosystem-grid">${partners.map(p=>`<article class="ecosystem-card partner-card" id="${p.slug}" data-partner="${p.slug}"><div class="ecosystem-logo"><img src="${p.logo}" alt="${p.name}" loading="lazy" width="240" height="90"></div><span class="partner-label">AuricWell Partner</span><p class="ecosystem-kind">${p.kind}</p><h2>${p.name}</h2><p>${p.description}</p><a class="text-link partner-website" href="${p.website}" target="_blank" rel="noopener">Visit website ↗</a><div class="partner-links">${p.links.map(([label,href])=>`<a href="${href}" target="_blank" rel="noopener">${label} ↗</a>`).join('')}</div></article>`).join('')}</div><p class="feature-note">Each organization manages its own services, provider availability and inquiries.</p><div class="actions">${link('contact','Connect your organization')}${link('about#integrations','Explore our integrations','button secondary')}</div></section>`;
}
