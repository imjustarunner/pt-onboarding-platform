import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToSharePage, normalizeSharePage } from '../publicSharePreview.service.js';

test('public path maps to a share-preview page key', () => {
  assert.equal(pathToSharePage('/support'), 'support');
  assert.equal(pathToSharePage('/itsco/support'), 'support');
  assert.equal(pathToSharePage('/join/itsco/counseling'), 'join');
  assert.equal(pathToSharePage('/careers/itsco'), 'careers');
  assert.equal(pathToSharePage('/itsco/login'), 'login');
  assert.equal(normalizeSharePage('support'), 'support');
});
