// Building hostnames are explicit aliases, never database IDs inferred from a number.
// Add future buildings here after their physical location records are ready.
export const OFFICE_SITES = [
  { host: '437.plottwisthq.com', locationId: 1, name: 'Windchime', manifest: '/office/windchime.webmanifest' },
  { host: 'office1.plottwisthq.com', locationId: 6, name: 'Denver', manifest: '/office/denver.webmanifest' }
];
export const OFFICE_ICON = '/office/office-512.png';
export function officeSiteForHost(host = '') {
  return OFFICE_SITES.find(site => site.host === String(host).toLowerCase().split(':')[0]) || null;
}
export function isOfficePath(path = '') { return /^\/kiosk(?:-welcome)?\/\d+(?:\/|$|[?#])/.test(path); }
export function officePaths(host) {
  const site = officeSiteForHost(host);
  if (!site) return null;
  const route = `/kiosk-welcome/${site.locationId}`;
  return {
    internal: path => /^\/(?:[?#]|$)/.test(path) ? `${route}${path.slice(1)}` : path,
    clean: path => new RegExp(`^${route}/?(?=[?#]|$)`).test(path) ? path.replace(new RegExp(`^${route}/?`), '/'): path
  };
}
export function applyOfficeInstallIdentity(locationId) {
  if (typeof document === 'undefined') return;
  document.title = 'Office';
  const site = OFFICE_SITES.find(site => site.locationId === Number(locationId));
  for (const [name, content] of [['apple-mobile-web-app-title', 'Office'], ['application-name', 'Office'], ['theme-color', '#24443d']]) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.appendChild(meta); }
    meta.content = content;
  }
  for (const id of ['app-favicon', 'app-apple-touch-icon']) document.getElementById(id)?.setAttribute('href', OFFICE_ICON);
  if (site) document.querySelector('link[rel="manifest"]')?.setAttribute('href', site.manifest);
}
export function officeHtml(html, site) {
  return html.replace(/<title>[^<]*<\/title>/, '<title>Office</title>')
    .replace(/(<link\b[^>]*id="app-(?:favicon|apple-touch-icon)"[^>]*href=")[^"]*(")/g, `$1${OFFICE_ICON}$2`)
    .replace(/(<link\b[^>]*rel="manifest"[^>]*href=")[^"]*(")/, `$1${site.manifest}$2`)
    .replace('</head>', '<meta name="apple-mobile-web-app-title" content="Office"><meta name="application-name" content="Office"></head>');
}
