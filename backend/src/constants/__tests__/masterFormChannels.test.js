import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTutoringMasterServiceType,
  isTutoringMasterFormType
} from '../masterFormChannels.js';

test('tutoring master covers tutoring, assessment, and evaluation services', () => {
  assert.equal(isTutoringMasterServiceType('tutoring'), true);
  assert.equal(isTutoringMasterServiceType('assessment'), true);
  assert.equal(isTutoringMasterServiceType('evaluation'), true);
  assert.equal(isTutoringMasterServiceType('counseling'), false);
});

test('tutoring master form types include intake, assessment, and evaluation', () => {
  assert.equal(isTutoringMasterFormType('intake'), true);
  assert.equal(isTutoringMasterFormType('assessment'), true);
  assert.equal(isTutoringMasterFormType('evaluation'), true);
  assert.equal(isTutoringMasterFormType('job_application'), false);
});
