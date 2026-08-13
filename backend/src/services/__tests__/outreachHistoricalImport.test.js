import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLORADO_OUTREACH_SCHOOLS } from '../../data/coloradoOutreachSchools.js';
import {
  isConfidentSchoolNameMatch,
  matchImportSchool,
  parsePocInfo,
  parseYesNo
} from '../../utils/outreachHistoricalImport.js';

const dps = COLORADO_OUTREACH_SCHOOLS.map((s) => ({
  id: s.key,
  name: s.name,
  district_name: s.district,
  city: s.city
}));

describe('historical import yes/no', () => {
  it('treats false as no', () => {
    assert.equal(parseYesNo('False'), false);
    assert.equal(parseYesNo('false'), false);
    assert.equal(parseYesNo('No'), false);
    assert.equal(parseYesNo('Yes'), true);
  });
});

describe('confident school org matching', () => {
  it('matches short partner names without attaching Lincoln HS to Lincoln Elementary', () => {
    assert.equal(isConfidentSchoolNameMatch('Lincoln Elementary School', 'Lincoln'), true);
    assert.equal(isConfidentSchoolNameMatch('Abraham Lincoln High School', 'Lincoln'), false);
    assert.equal(isConfidentSchoolNameMatch('Ashley Elementary School', 'Ashley'), true);
    assert.equal(isConfidentSchoolNameMatch('Garden Place Elementary School', 'Gardenplace'), true);
    assert.equal(isConfidentSchoolNameMatch('DSST: Green Valley Ranch High School', 'Green Valley'), false);
  });

  it('allows unique short org names like Cole without Lincoln HS collisions', async () => {
    const { isUniquePrefixSchoolMatch } = await import('../../utils/outreachHistoricalImport.js');
    const siblings = COLORADO_OUTREACH_SCHOOLS.filter((s) => s.district.includes('Denver')).map((s, i) => ({
      id: i + 1,
      name: s.name,
      city: s.city
    }));
    const cole = siblings.find((s) => s.name === 'Cole Arts and Science Academy');
    const lincolnEl = siblings.find((s) => s.name === 'Lincoln Elementary School');
    const lincolnHs = siblings.find((s) => s.name === 'Abraham Lincoln High School');
    assert.equal(isUniquePrefixSchoolMatch(cole, 'Cole', siblings), true);
    assert.equal(isUniquePrefixSchoolMatch(lincolnEl, 'Lincoln', siblings), true);
    assert.equal(isUniquePrefixSchoolMatch(lincolnHs, 'Lincoln', siblings), false);
  });
});

describe('DPS spreadsheet school matching', () => {
  it('maps unambiguous aliases and skips crossed-out or unknown schools', () => {
    const hit = (name) => matchImportSchool(name, dps);
    assert.equal(hit('Lincoln Elementary').school?.name, 'Lincoln Elementary School');
    assert.equal(hit('Manuel High School').school?.name, 'Manual High School');
    assert.equal(hit('John Amesse').school?.name, 'Amesse Elementary School');
    assert.equal(hit('Denver East High School').school?.name, 'East High School');
    assert.equal(hit('DSST Cole').school?.name, 'DSST: Cole Middle School');
    assert.equal(hit('Whittier Elementary').status, 'skip');
    assert.equal(hit('McKinley Elementary').status, 'skip');
    assert.equal(hit('Montebello Middle School').status, 'skip');
    assert.equal(hit('Park Hill Academy').status, 'skip');
    assert.equal(hit('Brown Middle School').status, 'skip');
    assert.equal(hit('Denver School of Arts').status, 'skip');
    assert.equal(hit('Abraham Lincoln High School').school?.name, 'Abraham Lincoln High School');
  });
});

describe('POC parsing', () => {
  it('splits emails, titles, and paired name/email lines', () => {
    const ashley = parsePocInfo(`Jestra1@dpsk12.net - Principal
Allison_Walsh@dpsk12.net - School Psych`);
    assert.ok(ashley.some((c) => c.email === 'jestra1@dpsk12.net' && /principal/i.test(c.title || '')));
    assert.ok(ashley.some((c) => c.email === 'allison_walsh@dpsk12.net'));

    const cole = parsePocInfo(`Office Manager - Rosa
Email: r_patron-sepulveda@dpsk12.net
Devin Rodriguez - School Social Worker
devin_rodriguez@dpsk12.net`);
    const rosa = cole.find((c) => /rosa/i.test(c.full_name));
    assert.ok(rosa?.email?.includes('patron-sepulveda'));
    assert.ok(cole.some((c) => /devin/i.test(c.full_name) && c.email === 'devin_rodriguez@dpsk12.net'));

    const polaris = parsePocInfo('Sangeeta_singh@dpsk12.net');
    assert.equal(polaris.length, 1);
    assert.equal(polaris[0].email, 'sangeeta_singh@dpsk12.net');

    const brook = parsePocInfo('Brook?');
    assert.equal(brook.length, 0);
  });
});
