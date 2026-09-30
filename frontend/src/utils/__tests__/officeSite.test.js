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
 it('uses Office branding for hostnames and existing bookmark paths', () => {
  expect(publicBrowserBranding('plottwisthq.com','/kiosk-welcome/1').title).toBe('Office');
  expect(publicBrowserBranding('437.plottwisthq.com','/').title).toBe('Office');
  const html=officeHtml('<head><title>Portal</title><link rel="manifest" href="/manifest.webmanifest"></head>',OFFICE_SITES[0]);
  expect(html).toContain('<title>Office</title>');expect(html).toContain('/office/windchime.webmanifest');expect(html).toContain('apple-mobile-web-app-title');
 });
});
