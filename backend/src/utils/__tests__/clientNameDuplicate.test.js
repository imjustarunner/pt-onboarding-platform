import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFullName,
  nameMatchKey,
  looksLikeInitialsOnly,
  groupClientsByFirstLastName,
  flaggedClientIdsFromGroups
} from '../clientNameDuplicate.js';

describe('parseFullName', () => {
  it('parses First Last and Last, First', () => {
    assert.deepEqual(parseFullName('Elliott Kieu'), { first: 'elliott', last: 'kieu' });
    assert.deepEqual(parseFullName('Kieu, Elliott'), { first: 'elliott', last: 'kieu' });
  });

  it('uses the last token as last name and strips suffixes', () => {
    assert.deepEqual(parseFullName('Mary Ann Smith-Jones Jr'), { first: 'mary', last: 'smith-jones' });
  });

  it('returns null without both parts', () => {
    assert.equal(parseFullName('Elliott'), null);
    assert.equal(parseFullName(''), null);
  });
});

describe('nameMatchKey', () => {
  it('matches accent and punctuation variants', () => {
    assert.equal(nameMatchKey('José O’Neil'), nameMatchKey('Jose ONeil'));
  });
});

describe('looksLikeInitialsOnly', () => {
  it('treats initials-only labels as unmatchable', () => {
    assert.equal(looksLikeInitialsOnly('ABCDEF', 'ABCDEF'), true);
    assert.equal(looksLikeInitialsOnly('Elliott Kieu', 'ELKIEU'), false);
  });
});

describe('groupClientsByFirstLastName', () => {
  it('groups the same first and last name and flags both ids', () => {
    const groups = groupClientsByFirstLastName([
      { id: 1, full_name: 'Alex Rivera', initials: 'ALXRIV', organization_id: 10, date_of_birth: '2014-04-01' },
      { id: 2, full_name: 'Rivera, Alex', initials: 'ALXRIV', organization_id: 10, date_of_birth: '2014-04-01' },
      { id: 3, full_name: 'Sam Lee', initials: 'SAMLEE', organization_id: 10 }
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].confidence, 'high');
    assert.equal(groups[0].memberCount, 2);
    assert.deepEqual([...flaggedClientIdsFromGroups(groups)].sort(), [1, 2]);
  });

  it('skips initials-only rows', () => {
    const groups = groupClientsByFirstLastName([
      { id: 1, full_name: 'ABCDEF', initials: 'ABCDEF', organization_id: 10 },
      { id: 2, full_name: 'ABCDEF', initials: 'ABCDEF', organization_id: 10 }
    ]);
    assert.equal(groups.length, 0);
  });
});
