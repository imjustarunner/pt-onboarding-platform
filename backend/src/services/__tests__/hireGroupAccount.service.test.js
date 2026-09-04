import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWorkspaceDomain,
  resolveWorkspaceFormat,
  isGroupPasswordHireMode
} from '../hireGroupAccount.service.js';
import { extractJobApplicationProfileFields } from '../hiringApplicationImport.service.js';

test('resolveWorkspaceDomain strips @', () => {
  assert.equal(resolveWorkspaceDomain('@itsco.health'), 'itsco.health');
  assert.equal(resolveWorkspaceDomain('itsco.health'), 'itsco.health');
});

test('resolveWorkspaceFormat defaults and aliases', () => {
  assert.equal(resolveWorkspaceFormat(''), 'first_last_initial');
  assert.equal(resolveWorkspaceFormat('first'), 'first');
  assert.equal(resolveWorkspaceFormat('first.last'), 'first_last');
  assert.equal(resolveWorkspaceFormat('first_last_initial'), 'first_last_initial');
  assert.equal(resolveWorkspaceFormat('first_initial_last'), 'first_initial_last');
});

test('isGroupPasswordHireMode reads feature flag', () => {
  assert.equal(isGroupPasswordHireMode({ feature_flags: { hireAccountMode: 'group_password' } }), true);
  assert.equal(isGroupPasswordHireMode({ feature_flags: '{"hireAccountMode":"group_password"}' }), true);
  assert.equal(isGroupPasswordHireMode({ feature_flags: {} }), false);
});

test('extractJobApplicationProfileFields maps common keys', () => {
  const { fieldMap, coverLetter } = extractJobApplicationProfileFields({
    responses: {
      applicant: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        phone: '555-0100',
        city: 'Denver',
        state: 'CO'
      },
      submission: { cover_letter: 'I love this role' }
    }
  });
  assert.equal(fieldMap.legal_first_name, 'Ada');
  assert.equal(fieldMap.legal_last_name, 'Lovelace');
  assert.equal(fieldMap.personal_phone, '555-0100');
  assert.equal(fieldMap.home_city, 'Denver');
  assert.equal(coverLetter, 'I love this role');
});
