import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToSharePageKey } from '../../content/tenantBrandAssets.js';

test('public path maps to a share-preview page key', () => {
  assert.equal(pathToSharePageKey('/support'), 'support');
  assert.equal(pathToSharePageKey('/itsco/support'), 'support');
  assert.equal(pathToSharePageKey('/join/itsco/counseling'), 'counseling');
  assert.equal(pathToSharePageKey('/join/itsco'), 'join');
  assert.equal(pathToSharePageKey('/itsco/school-referral'), 'school_referral');
  assert.equal(pathToSharePageKey('/itsco/events'), 'events');
  assert.equal(pathToSharePageKey('/terms'), 'terms');
  assert.equal(pathToSharePageKey('/privacypolicy'), 'privacy');
  assert.equal(pathToSharePageKey('/find-provider/2'), 'providers');
  assert.equal(pathToSharePageKey('/careers/itsco'), 'careers');
  assert.equal(pathToSharePageKey('/itsco/login'), 'login');
  assert.equal(pathToSharePageKey('/nlu/tutors'), 'tutors');
  assert.equal(pathToSharePageKey('/nlu/find-tutor'), 'tutors');
  assert.equal(pathToSharePageKey('/join/nlu/tutoring'), 'tutoring');
});
