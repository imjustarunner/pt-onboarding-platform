import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMergePreview,
  pickMergeField,
  scorePersonPair,
  USER_MERGE_FIELDS
} from '../identityHygiene.js';

describe('identityHygiene scoring', () => {
  it('scores exact name+email highly', () => {
    const score = scorePersonPair(
      { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
      { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }
    );
    assert.ok(score >= 90, score);
  });

  it('scores last-name-only lower than full name', () => {
    const full = scorePersonPair(
      { first_name: 'Ada', last_name: 'Lovelace' },
      { first_name: 'Ada', last_name: 'Lovelace' }
    );
    const last = scorePersonPair(
      { first_name: 'Ada', last_name: 'Lovelace' },
      { first_name: 'Bob', last_name: 'Lovelace' }
    );
    assert.ok(full > last);
  });
});

describe('identityHygiene merge picks', () => {
  it('prefers filled data over empty', () => {
    const pick = pickMergeField({
      keepValue: '',
      otherValue: '555-1212',
      keepRecency: 100,
      otherRecency: 1
    });
    assert.equal(pick.value, '555-1212');
    assert.equal(pick.source, 'other');
  });

  it('prefers newer when both have data', () => {
    const pick = pickMergeField({
      keepValue: 'old@example.com',
      otherValue: 'new@example.com',
      keepRecency: 10,
      otherRecency: 99
    });
    assert.equal(pick.value, 'new@example.com');
    assert.equal(pick.source, 'other');
  });

  it('honors manual override', () => {
    const pick = pickMergeField({
      keepValue: 'keep',
      otherValue: 'other',
      keepRecency: 1,
      otherRecency: 99,
      overrideValue: 'keep'
    });
    assert.equal(pick.source, 'manual');
    assert.equal(pick.value, 'keep');
  });

  it('builds a preview that highlights non-keep fields', () => {
    const keep = { id: 1, first_name: 'Ada', last_name: 'Lovelace', email: '', created_at: '2020-01-01' };
    const other = { id: 2, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@x.com', created_at: '2024-01-01' };
    const fields = buildMergePreview({
      keep,
      others: [other],
      fields: USER_MERGE_FIELDS.filter((f) => f.key === 'email' || f.key === 'first_name')
    });
    const email = fields.find((f) => f.key === 'email');
    assert.equal(email.chosenValue, 'ada@x.com');
    assert.equal(email.highlighted, true);
  });
});
