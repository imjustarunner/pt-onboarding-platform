import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanPublicSupportContent,
  ticketTopicFromPublicCategory,
  canEditPublicAgencySupport
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
