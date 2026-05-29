import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractGradeFromIntakeData,
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
