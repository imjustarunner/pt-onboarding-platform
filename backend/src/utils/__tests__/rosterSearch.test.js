import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientMatchesRosterSearch,
  dobSearchTokens,
  parseTruthyQuery
} from '../rosterSearch.js';

describe('parseTruthyQuery', () => {
  it('accepts common truthy strings', () => {
    assert.equal(parseTruthyQuery('true'), true);
    assert.equal(parseTruthyQuery('1'), true);
    assert.equal(parseTruthyQuery('yes'), true);
    assert.equal(parseTruthyQuery('false'), false);
    assert.equal(parseTruthyQuery(''), false);
  });
});

describe('clientMatchesRosterSearch', () => {
  const client = {
    id: 9,
    initials: 'AJ',
    identifier_code: 'PT-1042',
    full_name: 'Alex Jordan',
    date_of_birth: '2015-03-22',
    guardian_names: 'Maria Jordan, Sam Lee'
  };

  it('matches initials, name, code, guardian, and birthdate formats', () => {
    assert.equal(clientMatchesRosterSearch(client, 'aj'), true);
    assert.equal(clientMatchesRosterSearch(client, 'Alex'), true);
    assert.equal(clientMatchesRosterSearch(client, '1042'), true);
    assert.equal(clientMatchesRosterSearch(client, 'maria'), true);
    assert.equal(clientMatchesRosterSearch(client, '03/22/2015'), true);
    assert.equal(clientMatchesRosterSearch(client, 'march 22'), true);
    assert.equal(clientMatchesRosterSearch(client, 'unrelated'), false);
  });

  it('builds compact dob tokens', () => {
    assert.ok(dobSearchTokens('2015-03-22').includes('03222015'));
  });
});
