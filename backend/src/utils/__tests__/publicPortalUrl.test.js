import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicAppUrl,
  buildPublicPortalBaseUrl,
  buildPublicPortalLoginUrl,
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
});
