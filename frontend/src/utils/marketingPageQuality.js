import { isTisiAudiencePage } from '../constants/tisiAudiencePages';
/** Shared by the editor and public renderer: a placeholder is not a destination. */
export const isPlaceholderCopy = (value) => /coming soon|\btodo\b|\btbd\b|\blorem ipsum\b|details coming/i.test(String(value || ''));
export function safeMarketingHref(value) {
  const href = String(value || '').trim();
  if (!href || /[\u0000-\u0020\\]/.test(href)) return '';
  if (/^\/(?!\/)/.test(href) || /^#[a-z][\w-]*$/i.test(href)) return href;
  if (/^https?:\/\//i.test(href)) {
    try { return new URL(href).hostname ? href : ''; } catch { return ''; }
  }
  if (/^mailto:[^@?]+@[^@?]+\.[^@?]+(?:\?.*)?$/i.test(href) || /^tel:\+?[\d().-]+$/i.test(href)) return href;
  return '';
}
const sections = new Set(['who-we-support', 'services', 'how-it-works', 'contact', 'main']);
export function landingDestination(href, { slug = 'tisi', contentPages = [] } = {}) {
  const safe = safeMarketingHref(href);
  if (!safe) return '';
  if (safe.startsWith('#')) return sections.has(safe.slice(1)) ? safe : '';
  const base = `/p/${slug}`;
  if (safe === base || safe === `${base}/`) return base;
  if (!safe.startsWith(`${base}/`)) return safe;
  const segment = safe.slice(base.length + 1).split(/[?#]/)[0];
  if (slug === 'tisi' && isTisiAudiencePage(segment)) return safe;
  const page = contentPages.find((p) => p.slug === segment);
  if (page?.body?.trim() && !isPlaceholderCopy(page.body)) return safe;
  return ({ services: '#services', 'who-we-help': '#who-we-support', contact: '#contact' })[segment] || '';
}
export function marketingPageIssues(config, context = {}) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  if (!config.heroImageUrl) add('Hero image', 'Choose a hero image.');
  if (!config.heroTitle?.trim()) add('Hero title', 'Add a hero heading.');
  if (!landingDestination(config.ctaHref, context)) add('Get Started', 'Connect the primary button to a real intake, booking, or contact destination.');
  const links = [
    ...(config.primaryNav || []), ...(config.legalFooterLinks || []),
    ...(config.supportCards || []).filter(x => x.href), ...(config.services || []).filter(x => x.href), ...(config.processSteps || []).filter(x => x.href),
    { label: 'Learn More', href: config.learnMoreHref },
    { label: 'View All Services', href: config.servicesViewAllHref }
  ];
  for (const link of links) {
    if (!landingDestination(link.href, context)) add(link.label || link.title || 'Link', 'Destination is missing, unsafe, or points to an unfinished subpage.');
  }
  for (const link of config.socialLinks || []) {
    if (!/^https?:\/\//i.test(safeMarketingHref(link.href))) add(link.label || 'Social link', 'Use the actual social profile URL.');
  }
  for (const field of ['contactPhone', 'contactEmail', 'contactAddress']) {
    if (isPlaceholderCopy(config[field])) add(field, 'Remove placeholder contact details or enter confirmed information.');
  }
  if ((config.testimonials || []).some(q => q.text && q.verified !== true)) add('Testimonials', 'Confirm each quote is authentic and approved for publication, or remove it. Unconfirmed quotes stay hidden.');
  return issues;
}
