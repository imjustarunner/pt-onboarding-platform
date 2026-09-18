import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTenantEmailChromeHtml } from '../tenantEmailChrome.service.js';

describe('tenant email chrome', () => {
  it('keeps Contact Support even without header or footer art', () => {
    const html = applyTenantEmailChromeHtml('<p>Hi from a school</p>', {
      headerUrl: '',
      footerUrl: '',
      supportUrl: 'https://mh4kidz.org/support',
      agencyName: 'MH4kidz'
    });
    assert.match(html, /Contact Support/);
    assert.match(html, /Need Help\?/);
    assert.match(html, /mh4kidz\.org\/support/);
    assert.match(html, /Hi from a school/);
  });

  it('does not wrap twice', () => {
    const once = applyTenantEmailChromeHtml('<p>Hi</p>', {
      headerUrl: 'https://example.com/header.png',
      footerUrl: 'https://example.com/footer.png',
      supportUrl: 'https://itsco.health/support'
    });
    const twice = applyTenantEmailChromeHtml(once, {
      headerUrl: 'https://example.com/other.png',
      footerUrl: 'https://example.com/other-footer.png',
      supportUrl: 'https://other.example/support'
    });
    assert.equal(twice, once);
    assert.equal((twice.match(/Contact Support/g) || []).length, 1);
  });
});
