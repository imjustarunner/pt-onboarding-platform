import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNluPacketChromeAgency,
  isItscoPacketChromeAgency,
  resolvePacketBrandChrome
} from '../packetBrandChrome.service.js';

test('detects NLU agencies without treating ITSCO as NLU', () => {
  assert.equal(isNluPacketChromeAgency({ slug: 'nlu' }), true);
  assert.equal(isNluPacketChromeAgency({ portal_url: 'nextleveluplcc' }), true);
  assert.equal(isNluPacketChromeAgency({ official_name: 'Next Level Up' }), true);
  assert.equal(isNluPacketChromeAgency({ slug: 'itsco' }), false);
  assert.equal(isItscoPacketChromeAgency({ slug: 'itsco' }), true);
});

test('NLU chrome uses bundled header, footer, watermark, and logo', async () => {
  const brand = await resolvePacketBrandChrome({ slug: 'nlu', name: 'Next Level Up' });
  assert.equal(brand.useItscoChrome, false);
  assert.match(String(brand.headerImageDataUrl || ''), /^data:image\/png;base64,/);
  assert.match(String(brand.headerLogoDataUrl || ''), /^data:image\/png;base64,/);
  assert.match(String(brand.footerMarkDataUrl || ''), /^data:image\/png;base64,/);
  assert.match(String(brand.watermarkDataUrl || ''), /^data:image\/png;base64,/);
  assert.match(String(brand.coverDataUrl || ''), /^data:image\/png;base64,/);
  assert.match(brand.bodyFontFamily, /Montserrat/);
});
