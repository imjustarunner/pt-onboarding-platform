// Exact public entry points. These adapters change addresses, never account access.
const hostname = host => String(host || '').toLowerCase().split(':')[0];
export const FAMILY_ORIGIN = 'https://familycommandcenterhub.com';
export const MICHAEL_ORIGIN = 'https://michaelvmendez.com';
export const KIOSK_ORIGIN = 'https://kiosk.auricwell.com';
export const isFamilyWebsiteHost = host => hostname(host) === 'familycommandcenterhub.com';
export const isMichaelHost = host => hostname(host) === 'michaelvmendez.com';
export const isKioskHost = host => hostname(host) === 'kiosk.auricwell.com';

export function productDomainPaths(host) {
  if (isFamilyWebsiteHost(host)) return {
    internal: value => String(value).replace(/^\/(?:[?#]|$)/, match => '/family-website' + match.slice(1)).replace(/^\/(app|login)\/?(?=[?#]|$)/, '/family'),
    clean: value => String(value).replace(/^\/family-website\/?(?=[?#]|$)/, '/').replace(/^\/family\/?(?=[?#]|$)/, '/app')
  };
  if (isMichaelHost(host)) return {
    internal(value) {
      const path = String(value);
      if (/^\/(?=[?#]|$)/.test(path)) return path.replace(/^\//, '/michael');
      if (/^\/(services|packages|nonprofits|pay|find-consultant)(?:[/?#]|$)/.test(path)) return `/michael${path}`;
      if (/^\/(app|login)\/?(?=[?#]|$)/.test(path)) return path.replace(/^\/(app|login)\/?/, '/michael/login');
      return path;
    },
    clean: value => String(value).replace(/^\/michael(?=\/(?:services|packages|nonprofits|pay|find-consultant|login)(?:[/?#]|$)|[?#]|\/?$)/, '').replace(/^([?#]|$)/, '/$1')
  };
  return null;
}

export function productBrowserBranding(host) {
  if (isFamilyWebsiteHost(host)) return { slug: 'family', title: 'Family Command Center | A little more together', favicon: '/family-home.svg', image: '/assets/family-events/family.jpg', description: 'Bring your family calendar, chores, meals, and everyday lists together in one private home.' };
  if (isMichaelHost(host)) return { slug: 'michael', title: 'Michael V. Mendez | Consulting', favicon: '/michael-mark.svg', image: '/assets/ptco/consulting.webp', description: 'Practical strategy for private practice, AI app development, and growing organizations.' };
  return null;
}
