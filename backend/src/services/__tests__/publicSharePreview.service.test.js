import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pathToSharePageKey,
  resolvePortalSlugFromSharePath,
  tenantSmsImage
} from '../../content/tenantBrandAssets.js';

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
  assert.equal(pathToSharePageKey('/district-schedule/colorado-springs-school-district-11'), 'district_schedule');
  assert.equal(pathToSharePageKey('/itsco/bookclub'), 'bookclub');
  assert.equal(pathToSharePageKey('/itsco/book-club'), 'bookclub');
});

test('portal slug is extracted from PTHQ share paths', () => {
  assert.equal(resolvePortalSlugFromSharePath('/join/nlu/counseling'), 'nlu');
  assert.equal(resolvePortalSlugFromSharePath('/join/nlu/tutoring'), 'nlu');
  assert.equal(resolvePortalSlugFromSharePath('/careers/nlu'), 'nlu');
  assert.equal(resolvePortalSlugFromSharePath('/nlu/join/counseling'), 'nlu');
  assert.equal(resolvePortalSlugFromSharePath('/careers/itsco'), 'itsco');
  assert.equal(resolvePortalSlugFromSharePath('/itsco/bookclub'), 'itsco');
  assert.equal(resolvePortalSlugFromSharePath('/support'), '');
  assert.equal(resolvePortalSlugFromSharePath('/join/counseling'), '');
});

test('NLU counseling/tutoring SMS assets resolve from tenant key', () => {
  assert.match(tenantSmsImage('nlu', 'counseling'), /NLUCounseling/);
  assert.match(tenantSmsImage('nlu', 'tutoring'), /NLUTutoring/);
  assert.match(tenantSmsImage('nlu', 'careers'), /NLUCareers/);
  assert.match(tenantSmsImage('nextleveluplcc', 'counseling'), /NLUCounseling/);
  assert.match(tenantSmsImage('itsco', 'careers'), /ITSCOCareers/);
  assert.match(tenantSmsImage('itsco', 'bookclub'), /bookclub\.png/);
});
