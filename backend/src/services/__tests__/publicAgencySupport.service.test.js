import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanPublicSupportContent,
  validatePublicSupportContact,
  ticketTopicFromPublicCategory,
  canEditPublicAgencySupport,
  resolvePublicSupportContactEmail
} from '../publicAgencySupport.service.js';

test('billing category maps to billing ticket topic', () => {
  assert.equal(ticketTopicFromPublicCategory('billing'), 'billing');
  assert.equal(ticketTopicFromPublicCategory('careers'), 'general');
});

test('admin support and super_admin can edit the public support page', () => {
  assert.equal(canEditPublicAgencySupport({ role: 'admin' }), true);
  assert.equal(canEditPublicAgencySupport({ role: 'support' }), true);
  assert.equal(canEditPublicAgencySupport({ role: 'super_admin' }), true);
  assert.equal(canEditPublicAgencySupport({ role: 'superadmin' }), true);
  assert.equal(canEditPublicAgencySupport({ role: 'provider' }), false);
  assert.equal(canEditPublicAgencySupport(null), false);
});

test('SSN-like content is blocked; health details are flagged but not blocked', () => {
  const blocked = scanPublicSupportContent('My SSN is 123-45-6789');
  assert.equal(blocked.block, true);
  const phi = scanPublicSupportContent('My child was diagnosed with ADHD and takes medication.');
  assert.equal(phi.block, false);
  assert.ok(phi.flags.includes('possible_phi'));
});

test('website inquiries require a valid email, phone, or both', () => {
 for (const contact of [{email:'visitor@example.com'}, {phone:'(719) 555-0100'}, {email:'visitor@example.com',phone:'+1 719 555 0100'}]) assert.doesNotThrow(()=>validatePublicSupportContact(contact));
 for (const contact of [{}, {email:'invalid'}, {phone:'123'}, {email:'visitor@example.com',phone:'not a phone'}, {email:'wrong',phone:'7195550100'}]) assert.throws(()=>validatePublicSupportContact(contact), e=>e.status===400);
});

test('public support contact uses support@ and never forms@', () => {
  assert.equal(
    resolvePublicSupportContactEmail({
      support_team_email: 'support@mh4kidz.org',
      onboarding_team_email: 'forms@mh4kidz.org'
    }),
    'support@mh4kidz.org'
  );
  assert.equal(
    resolvePublicSupportContactEmail({
      support_team_email: 'forms@mh4kidz.org',
      onboarding_team_email: 'forms@mh4kidz.org'
    }, 'support@mh4kidz.org'),
    'support@mh4kidz.org'
  );
  assert.equal(
    resolvePublicSupportContactEmail({
      support_team_email: 'forms@mh4kidz.org',
      onboarding_team_email: 'po@mh4kidz.org'
    }),
    'po@mh4kidz.org'
  );
  assert.equal(
    resolvePublicSupportContactEmail({
      support_team_email: 'forms@mh4kidz.org',
      onboarding_team_email: 'forms@mh4kidz.org'
    }),
    ''
  );
});
