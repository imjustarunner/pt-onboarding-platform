import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import EmailTemplateService from '../emailTemplate.service.js';

describe('EmailTemplateService portal links', () => {
  const itsco = {
    name: 'ITSCO',
    slug: 'itsco',
    portal_url: 'itsco',
    organization_type: 'agency'
  };

  const hogwarts = {
    name: 'Hogwarts',
    slug: 'hogwarts',
    portal_url: 'hogwarts',
    organization_type: 'school',
    parent_portal_url: 'itsco'
  };

  it('keeps portal login separate from reset link when keepPortalLoginLink is true', async () => {
    const params = await EmailTemplateService.collectParameters(
      { first_name: 'Severus', email: 'severus@hogwarts.edu' },
      hogwarts,
      { passwordlessToken: 'abc123', keepPortalLoginLink: true }
    );
    assert.match(params.RESET_TOKEN_LINK, /reset-password\/abc123$/);
    assert.match(params.PORTAL_LOGIN_LINK, /\/login$/);
    assert.notEqual(params.PORTAL_LOGIN_LINK, params.RESET_TOKEN_LINK);
    assert.match(params.PORTAL_URL, /^https:\/\/app\.itsco\.health\/hogwarts$/);
  });

  it('uses reset link as portal login for legacy welcome-style templates by default', async () => {
    const params = await EmailTemplateService.collectParameters(
      { first_name: 'Ada', email: 'ada@example.com' },
      itsco,
      { passwordlessToken: 'tok' }
    );
    assert.equal(params.PORTAL_LOGIN_LINK, params.RESET_TOKEN_LINK);
    assert.equal(params.PORTAL_URL, 'https://app.itsco.health');
  });
});
