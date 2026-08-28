import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicAppUrl,
  buildPublicPortalBaseUrl,
  buildPublicPortalLoginUrl,
  buildQuickViewHomeUrl,
  buildQuickViewTenantBaseUrl,
  buildQuickViewTokenUrl,
  dedicatedAppHostForSlug
} from '../publicPortalUrl.js';

const PLATFORM = 'https://plottwisthq.com';

describe('publicPortalUrl', () => {
  it('maps ITSCO to the dedicated app host with a flat login path', () => {
    const itsco = { name: 'ITSCO', slug: 'itsco', portal_url: 'itsco', organization_type: 'agency' };
    assert.equal(dedicatedAppHostForSlug('itsco'), 'app.itsco.health');
    assert.equal(buildPublicPortalBaseUrl(itsco, { platformBaseUrl: PLATFORM }), 'https://app.itsco.health');
    assert.equal(buildPublicPortalLoginUrl(itsco, { platformBaseUrl: PLATFORM }), 'https://app.itsco.health/login');
    assert.equal(
      buildPublicAppUrl(itsco, 'reset-password/abc', { platformBaseUrl: PLATFORM }),
      'https://app.itsco.health/reset-password/abc'
    );
  });

  it('puts ITSCO schools on the parent host without /itsco in the path', () => {
    const hogwarts = {
      name: 'Hogwarts',
      slug: 'hogwarts',
      portal_url: 'hogwarts',
      organization_type: 'school',
      parent_portal_url: 'itsco'
    };
    assert.equal(
      buildPublicPortalLoginUrl(hogwarts, { platformBaseUrl: PLATFORM }),
      'https://app.itsco.health/hogwarts/login'
    );
  });

  it('keeps other agencies on the platform host with a slug path', () => {
    const sage = {
      name: 'Burning Sage Therapy',
      slug: 'burning-sage',
      portal_url: 'burning-sage',
      organization_type: 'agency'
    };
    assert.equal(
      buildPublicPortalLoginUrl(sage, { platformBaseUrl: PLATFORM }),
      'https://plottwisthq.com/burning-sage/login'
    );
  });

  it('uses an explicit custom_domain over the dedicated-host map', () => {
    const org = {
      slug: 'itsco',
      portal_url: 'itsco',
      organization_type: 'agency',
      custom_domain: 'https://app.itsco.health'
    };
    assert.equal(buildPublicPortalBaseUrl(org, { platformBaseUrl: PLATFORM }), 'https://app.itsco.health');
  });

  it('maps Next Level Up to its dedicated app host', () => {
    const nlu = {
      name: 'Next Level Up',
      slug: 'nextleveluplcc',
      portal_url: 'nextleveluplcc',
      organization_type: 'agency'
    };
    assert.equal(dedicatedAppHostForSlug('nextleveluplcc'), 'app.nextleveluplcc.com');
    assert.equal(dedicatedAppHostForSlug('nextlevelup'), 'app.nextleveluplcc.com');
    assert.equal(buildPublicPortalBaseUrl(nlu, { platformBaseUrl: PLATFORM }), 'https://app.nextleveluplcc.com');
    assert.equal(buildPublicPortalLoginUrl(nlu, { platformBaseUrl: PLATFORM }), 'https://app.nextleveluplcc.com/login');
  });

  it('builds tenant Quick View hosts as qv.{tenant}', () => {
    const itsco = { slug: 'itsco', portal_url: 'itsco', organization_type: 'agency' };
    assert.equal(
      buildQuickViewTenantBaseUrl(itsco, { platformBaseUrl: PLATFORM }),
      'https://qv.app.itsco.health'
    );
    assert.equal(
      buildQuickViewHomeUrl(itsco, { platformBaseUrl: PLATFORM }),
      'https://qv.app.itsco.health'
    );
    assert.equal(
      buildQuickViewTokenUrl(itsco, 'abc123', { platformBaseUrl: PLATFORM }),
      'https://qv.app.itsco.health/t/abc123'
    );

    const sage = {
      slug: 'burning-sage',
      portal_url: 'burning-sage',
      organization_type: 'agency'
    };
    assert.equal(
      buildQuickViewTenantBaseUrl(sage, { platformBaseUrl: PLATFORM }),
      'https://qv.burning-sage.app.plottwisthq.com'
    );
  });
});
