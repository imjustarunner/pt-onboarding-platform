import test from 'node:test';
import assert from 'node:assert/strict';
import { fullBleedCoverRect, LETTER_PAGE_PT } from '../fullBleedCover.js';

test('narrow cover fills the page width and crops top and bottom', () => {
  const rect = fullBleedCoverRect(1000, 2000);
  assert.equal(rect.width, LETTER_PAGE_PT.width);
  assert.ok(rect.height >= LETTER_PAGE_PT.height);
  assert.equal(rect.x, 0);
  assert.ok(rect.y <= 0);
});

test('wide cover fills the page height and crops the sides', () => {
  const rect = fullBleedCoverRect(2000, 1000);
  assert.equal(rect.height, LETTER_PAGE_PT.height);
  assert.ok(rect.width >= LETTER_PAGE_PT.width);
  assert.equal(rect.y, 0);
  assert.ok(rect.x <= 0);
});
