import test from 'node:test';
import assert from 'node:assert/strict';
import { h0002ClientCode } from '../schoolIntakeReviewTask.service.js';

test('h0002ClientCode uses three letters of first and last name', () => {
  assert.equal(h0002ClientCode('Michael', 'Mendez'), 'MICMEN');
  assert.equal(h0002ClientCode('Brody', 'Robbins'), 'BROROB');
  assert.equal(h0002ClientCode('Al', 'Li'), 'ALXLIX');
});
