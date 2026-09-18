import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITSCO_SIGNATURE_DEFAULTS,
  buildStaffSignatureHtml,
  signatureColorsForAgency,
  signatureTaglines,
  usesDepartmentHtmlSignature
} from '../staffHtmlEmailSignature.service.js';

describe('tenant HTML signatures', () => {
  it('keeps the ITSCO two-part tagline and does not copy it to other tenants', () => {
    assert.deepEqual(signatureTaglines({ isItsco: true }), {
      taglineLeft: ITSCO_SIGNATURE_DEFAULTS.taglineLeft,
      taglineRight: ITSCO_SIGNATURE_DEFAULTS.taglineRight
    });
    assert.deepEqual(signatureTaglines({ isItsco: false }), {
      taglineLeft: '',
      taglineRight: ''
    });
    assert.deepEqual(
      signatureTaglines({ isItsco: false, customTagline: 'Small steps. Big possibilities.' }),
      { taglineLeft: 'Small steps. Big possibilities.', taglineRight: '' }
    );
  });

  it('uses the tenant palette instead of ITSCO green', () => {
    const tisi = signatureColorsForAgency(
      { color_palette: { primary: '#13304E', secondary: '#0B1F3A' } },
      false
    );
    assert.equal(tisi.green, '#13304E');
    assert.equal(tisi.navy, '#0B1F3A');
    assert.notEqual(tisi.green, ITSCO_SIGNATURE_DEFAULTS.colors.green);
  });

  it('does not inject ITSCO copy, phone, or leaf into a non-ITSCO signature', () => {
    const html = buildStaffSignatureHtml({
      displayName: 'TISI Forms',
      title: 'Forms',
      orgShortName: 'The Inner Strength Institute',
      email: 'forms@innerstrengthin.com',
      phone: { display: '719-657-1381', tel: '+17196571381' },
      website: { display: 'Theinnerstrengthinstitute.com', url: 'https://theinnerstrengthinstitute.com' },
      taglineLeft: 'STRONGER PEOPLE. BRIGHTER TOMORROWS.',
      taglineRight: '',
      socialLinks: [],
      colors: signatureColorsForAgency({ color_palette: { primary: '#13304E' } }, false),
      isItsco: false,
      signatureVariant: 'department',
      photoUrl: 'https://example.com/logo.png',
      assets: {
        iconEmail: '/email-signatures/staff-html/icon-email-white.png',
        iconPhone: '/email-signatures/staff-html/icon-phone-white.png',
        iconWeb: '/email-signatures/staff-html/icon-web-white.png',
        leaf: 'https://example.com/itsco-leaf.png',
        phoenix: 'https://example.com/phoenix.png'
      }
    });
    assert.equal(html.includes('STRONGER SCHOOL COMMUNITIES'), false);
    assert.equal(html.includes('MENTAL HEALTH SUPPORT'), false);
    assert.equal(html.includes('719-657-7444'), false);
    assert.equal(html.includes('itsco-leaf.png'), false);
    assert.equal(html.includes('filter:'), false);
    assert.match(html, /STRONGER PEOPLE\. BRIGHTER TOMORROWS\./);
    assert.match(html, /#13304E/);
    assert.match(html, /bgcolor="#13304E"/);
    assert.match(html, /icon-email-white\.png/);
  });

  it('treats support and other department mailboxes as HTML signatures, not personal_*', () => {
    assert.equal(usesDepartmentHtmlSignature({ identity_key: 'support', agency_id: 434 }), true);
    assert.equal(usesDepartmentHtmlSignature({ identity_key: 'schools', agency_id: 2 }), true);
    assert.equal(usesDepartmentHtmlSignature({ identity_key: 'personal_501', agency_id: 2 }), false);
  });
});
