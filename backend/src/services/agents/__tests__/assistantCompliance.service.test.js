import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeMyComplianceQuestion,
  parseAgencyComplianceFilterFromPrompt
} from '../assistantCompliance.service.js';

test('looksLikeMyComplianceQuestion matches license expiration asks', () => {
  assert.equal(looksLikeMyComplianceQuestion('when does my license expire'), true);
  assert.equal(looksLikeMyComplianceQuestion('is my license up to date'), true);
  assert.equal(looksLikeMyComplianceQuestion('who has an expired license'), false);
});

test('parseAgencyComplianceFilterFromPrompt classifies admin compliance asks', () => {
  assert.equal(parseAgencyComplianceFilterFromPrompt('who has an expired license'), 'expired_licenses');
  assert.equal(parseAgencyComplianceFilterFromPrompt('who has a background check due'), 'background_due');
  assert.equal(parseAgencyComplianceFilterFromPrompt('open payroll'), null);
});
