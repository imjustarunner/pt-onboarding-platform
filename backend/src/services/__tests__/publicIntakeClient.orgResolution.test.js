import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickAffiliatedOrgForService,
  preferredOrgTypesForJoinService
} from '../publicIntakeClient.service.js';

describe('publicIntakeClient join org resolution', () => {
  const affiliated = [
    { id: 10, organization_type: 'school' },
    { id: 20, organization_type: 'program' },
    { id: 30, organization_type: 'learning' },
    { id: 40, organization_type: 'clinical' }
  ];

  it('prefers clinical then program for counseling', () => {
    assert.deepEqual(preferredOrgTypesForJoinService('counseling'), ['clinical', 'program']);
    assert.equal(pickAffiliatedOrgForService(affiliated, 'counseling'), 40);
  });

  it('prefers learning for tutoring', () => {
    assert.deepEqual(preferredOrgTypesForJoinService('tutoring'), ['learning']);
    assert.equal(pickAffiliatedOrgForService(affiliated, 'tutoring'), 30);
  });

  it('falls back to program when clinical missing for counseling', () => {
    const rows = affiliated.filter((r) => r.organization_type !== 'clinical');
    assert.equal(pickAffiliatedOrgForService(rows, 'counseling'), 20);
  });
});
