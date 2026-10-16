import { injectShareMetaIntoHtml } from './sharePreview.js';

// Shared entry points serve every building. Retain old aliases for bookmarks;
// the authenticated device session always selects the actual building.
export const OFFICE_SITES = [
  { host: '437.plottwisthq.com', locationId: 1, name: 'Windchime', manifest: '/office/windchime.webmanifest' },
  { host: 'office1.plottwisthq.com', locationId: 6, name: 'Denver', manifest: '/office/denver.webmanifest' },
  { host: 'kiosk.auricwell.com', locationId: null, name: 'AuricWell', manifest: '/office/kiosk.webmanifest' },
  { host: 'kiosk.plottwisthq.com', locationId: null, name: 'AuricWell', manifest: '/office/kiosk.webmanifest' }
];
export const OFFICE_ICON = '/office/auricwell-kiosk-512.png';
export const OFFICE_APP_NAME = 'AuricWell Kiosk';
export function officeSiteForHost(host = '') {
  return OFFICE_SITES.find(site => site.host === String(host).toLowerCase().split(':')[0]) || null;
}
export function isOfficePath(path = '') { return /^\/office-kiosk(?:\/|$|[?#])/.test(path) || /^\/kiosk(?:-welcome)?\/\d+(?:\/|$|[?#])/.test(path); }
export function officePaths(host) {
  const site = officeSiteForHost(host);
  if (!site) return null;
  const route = site.locationId ? `/kiosk-welcome/${site.locationId}` : '/office-kiosk';
  return {
    internal: path => /^\/(?:[?#]|$)/.test(path) ? `${route}${path.slice(1)}` : path,
    clean: path => new RegExp(`^${route}/?(?=[?#]|$)`).test(path) ? path.replace(new RegExp(`^${route}/?`), '/'): path
  };
}
export function applyOfficeInstallIdentity(locationId) {
  if (typeof document === 'undefined') return;
  document.title = OFFICE_APP_NAME;
  for (const [name, content] of [['apple-mobile-web-app-title', 'Kiosk'], ['application-name', OFFICE_APP_NAME], ['theme-color', '#073782']]) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.appendChild(meta); }
    meta.content = content;
  }
  for (const id of ['app-favicon', 'app-apple-touch-icon']) document.getElementById(id)?.setAttribute('href', OFFICE_ICON);
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/office/kiosk.webmanifest');
}
export function officeHtml(html, site) {
  const title = site.locationId ? `${site.name} Kiosk · ${OFFICE_APP_NAME}` : OFFICE_APP_NAME;
  const origin = `https://${site.host}`;
  const imagePath = site.locationId ? `/office/${site.locationId === 6 ? 'denver' : 'windchime'}-kiosk-share.jpg` : '/office/auricwell-kiosk-share.png';
  const meta = {
    name: OFFICE_APP_NAME, title,
    description: 'A warm welcome with AuricWell. Client check-in, today’s providers, and the office directory.',
    image: `${origin}${imagePath}`, url: `${origin}/`
  };
  return injectShareMetaIntoHtml(html.replace(/<meta\b[^>]*property=["']og:type["'][^>]*>/gi, ''), meta)
    .replace(/<title>[^<]*<\/title>/, `<title>${OFFICE_APP_NAME}</title>`)
    .replace(/(<link\b[^>]*id="app-(?:favicon|apple-touch-icon)"[^>]*href=")[^"]*(")/g, `$1${OFFICE_ICON}$2`)
    .replace(/(<link\b[^>]*rel="manifest"[^>]*href=")[^"]*(")/, '$1/office/kiosk.webmanifest$2')
    .replace('</head>', `${site.locationId ? '' : '<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="AuricWell Kiosk — A warm welcome starts here.">'}<meta name="apple-mobile-web-app-title" content="Kiosk"><meta name="application-name" content="${OFFICE_APP_NAME}"></head>`);
}
