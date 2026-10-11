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
  const title=site.locationId ? `${site.name} Kiosk · ${OFFICE_APP_NAME}` : OFFICE_APP_NAME, image=site.locationId ? `https://plottwisthq.com/office/${site.locationId===6?'denver':'windchime'}-kiosk-share.jpg` : 'https://plottwisthq.com/office/auricwell-kiosk-512.png';
  return html.replace(/<title>[^<]*<\/title>/, `<title>${OFFICE_APP_NAME}</title>`)
    .replace(/(<meta\b[^>]*(?:property|name)="(?:og|twitter):title"[^>]*content=")[^"]*(")/g,`$1${title}$2`)
    .replace(/(<meta\b[^>]*(?:property|name)="(?:og|twitter):description"[^>]*content=")[^"]*(")/g,'$1A warm welcome with AuricWell. Client check-in, today’s providers, and the office directory.$2')
    .replace(/(<meta\b[^>]*(?:property|name)="(?:og|twitter):image"[^>]*content=")[^"]*(")/g,`$1${image}$2`)
    .replace(/(<link\b[^>]*id="app-(?:favicon|apple-touch-icon)"[^>]*href=")[^"]*(")/g, `$1${OFFICE_ICON}$2`)
    .replace(/(<link\b[^>]*rel="manifest"[^>]*href=")[^"]*(")/, '$1/office/kiosk.webmanifest$2')
    .replace('</head>', `<meta name="apple-mobile-web-app-title" content="Kiosk"><meta name="application-name" content="${OFFICE_APP_NAME}"></head>`);
}
