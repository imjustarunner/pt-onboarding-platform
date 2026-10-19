import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_FORM_CHANNELS,
  isTutoringMasterServiceType,
  isTutoringMasterFormType
} from '../masterFormChannels.js';

test('supported printable channels open their individual enrollment documents in the library', () => {
  for (const channel of ['school','office','tutoring']) {
    assert.equal(MASTER_FORM_CHANNELS[channel].hasPrintable, true);
    assert.ok(MASTER_FORM_CHANNELS[channel].paperAdminPath.startsWith('/library?section=enrollment&'));
  }
  assert.equal(MASTER_FORM_CHANNELS.school.adminPath, '/admin/master-school-form');
  assert.equal(MASTER_FORM_CHANNELS.office.adminPath, '/admin/master-office-form');
});

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
