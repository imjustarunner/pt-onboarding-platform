import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractGradeFromIntakeData,
  extractDobFromIntakeData,
  normalizeDobToYmd,
  ageFromDateOfBirth,
  GRADE_INTAKE_KEYS
} from '../intakeGrade.util.js';

test('extractGradeFromIntakeData reads per-child client_grade', () => {
  const grade = extractGradeFromIntakeData({
    intakeData: {
      responses: {
        submission: {},
        clients: [{ client_grade: '7th' }]
      }
    },
    clientIndex: 0
  });
  assert.equal(grade, '7th');
});

test('extractGradeFromIntakeData reads top-level submission question key', () => {
  const grade = extractGradeFromIntakeData({
    intakeData: {
      responses: {
        submission: { client_grade: '5th' },
        clients: [{}]
      }
    },
    clientIndex: 0
  });
  assert.equal(grade, '5th');
});

test('extractGradeFromIntakeData reads clinicalResponses.client_grade', () => {
  const grade = extractGradeFromIntakeData({
    intakeData: {
      responses: {
        submission: { clinicalResponses: { client_grade: '3rd' } },
        clients: [{}]
      }
    },
    clientIndex: 0
  });
  assert.equal(grade, '3rd');
});

test('extractGradeFromIntakeData prefers per-child over submission-level', () => {
  const grade = extractGradeFromIntakeData({
    intakeData: {
      responses: {
        submission: { client_grade: '5th' },
        clients: [{ client_grade: '7th' }, { client_grade: '2nd' }]
      }
    },
    clientIndex: 1
  });
  assert.equal(grade, '2nd');
});

test('extractGradeFromIntakeData normalizes flat intake_data shape', () => {
  const grade = extractGradeFromIntakeData({
    intakeData: {
      clients: [{ client_grade: '8th', firstName: 'Poppy' }]
    },
    clientIndex: 0
  });
  assert.equal(grade, '8th');
});

test('GRADE_INTAKE_KEYS includes client_grade alias', () => {
  assert.ok(GRADE_INTAKE_KEYS.includes('client_grade'));
});

test('normalizeDobToYmd handles mysql2 Date objects', () => {
  const dob = new Date(2015, 2, 15); // local Mar 15, 2015
  assert.equal(normalizeDobToYmd(dob), '2015-03-15');
});

test('ageFromDateOfBirth computes from mysql2 Date objects', () => {
  const dob = new Date(2015, 2, 15);
  const age = ageFromDateOfBirth(dob);
  assert.ok(Number.isFinite(age));
  assert.ok(age >= 10 && age <= 12);
});

test('extractDobFromIntakeData reads per-child client_dob', () => {
  const dob = extractDobFromIntakeData({
    intakeData: {
      responses: {
        submission: {},
        clients: [{ client_dob: '03/15/2015' }]
      }
    },
    clientIndex: 0
  });
  assert.equal(dob, '2015-03-15');
});
