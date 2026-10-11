import { describe, it, expect } from 'vitest';
import { officePaths, officeSiteForHost, officeHtml, OFFICE_SITES } from '../officeSite';
import { publicBrowserBranding } from '../publicBrowserBranding';
describe('dedicated office sites', () => {
 it('maps Denver to its real location, not the hostname number', () => {
  expect(officePaths('office1.plottwisthq.com').internal('/')).toBe('/kiosk-welcome/6');
  expect(officePaths('437.plottwisthq.com').clean('/kiosk-welcome/1?x=1')).toBe('/?x=1');
  expect(officePaths('437.plottwisthq.com').internal('/api/kiosk/1/office-directory')).toBe('/api/kiosk/1/office-directory');
 });
 it('leaves planned/unconfigured buildings and other products untouched', () => {
  for(const host of ['office2.plottwisthq.com','office10.plottwisthq.com','fcc.plottwisthq.com','qv.itsco.health']) expect(officeSiteForHost(host)).toBeNull();
 });
 it('uses AuricWell Kiosk branding for hostnames and existing bookmark paths', () => {
  expect(publicBrowserBranding('plottwisthq.com','/kiosk-welcome/1').title).toBe('AuricWell Kiosk');
  expect(publicBrowserBranding('437.plottwisthq.com','/').title).toBe('AuricWell Kiosk');
  const html=officeHtml('<head><title>Portal</title><link rel="manifest" href="/manifest.webmanifest"></head>',OFFICE_SITES[0]);
  expect(html).toContain('<title>AuricWell Kiosk</title>');expect(html).toContain('/office/kiosk.webmanifest');expect(html).toContain('apple-mobile-web-app-title');
 });
 it('gives each location its own SMS title and landscape image without changing the installed app name',()=>{
  const shell='<head><title>Plot Twist Co</title><meta property="og:title" content="Plot Twist Co"><meta property="og:image" content="old"><meta name="twitter:title" content="Plot Twist Co"><meta name="twitter:image" content="old"></head>';
  for(const site of OFFICE_SITES.filter(s=>s.locationId)){const html=officeHtml(shell,site);expect(html).toContain(`<title>AuricWell Kiosk</title>`);expect(html).toContain(`content="${site.name} Kiosk · AuricWell Kiosk"`);expect(html).toContain(`/office/${site.locationId===6?'denver':'windchime'}-kiosk-share.jpg`);expect(html).not.toContain('content="old"');}
 });
 it.each(['kiosk.auricwell.com','kiosk.plottwisthq.com'])('opens shared setup on %s with no building inferred from its URL',host=>{
  expect(officeSiteForHost(host).locationId).toBeNull();
  expect(officePaths(host).internal('/')).toBe('/office-kiosk');
  expect(officePaths(host).clean('/office-kiosk')).toBe('/');
  expect(publicBrowserBranding(host,'/').favicon).toBe('/office/auricwell-kiosk-512.png');
 });
});
