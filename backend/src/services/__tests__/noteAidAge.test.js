import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAtServiceDate, applyIntakeIdentifyingAge, intakeAgeInstruction } from '../noteAidAge.service.js';
import { parseScalePair } from '../treatmentPlanImport.service.js';

test('age uses encounter date and civil birthday, including invalid and missing DOB', () => {
  assert.equal(ageAtServiceDate('1990-09-14', '2026-09-13'), 35);
  assert.equal(ageAtServiceDate('1990-09-14', '2026-09-14'), 36);
  assert.equal(ageAtServiceDate('1990-09-14', '2020-09-14'), 30);
  assert.equal(ageAtServiceDate('2000-02-29', '2025-02-28'), 24);
  assert.equal(ageAtServiceDate('2000-02-29', '2025-03-01'), 25);
  assert.equal(ageAtServiceDate('', '2026-09-14'), null);
  assert.equal(ageAtServiceDate('2026-02-30', '2026-09-14'), null);
  assert.equal(ageAtServiceDate('2026-10-01', '2026-09-14'), null);
});

test('corrects identifying age while preserving historical ages and only prompts with age', () => {
  const sections = { Identification: 'The client is a 27-year-old adult. At age 12, the client moved.', History: 'The client was 27 at the previous intake.' };
  const result = applyIntakeIdentifyingAge(sections, 36);
  assert.match(result.Identification, /client is a 36-year-old/);
  assert.match(result.Identification, /At age 12/);
  assert.equal(result.History, sections.History);
  assert.equal(applyIntakeIdentifyingAge(sections, null), sections);
  assert.match(intakeAgeInstruction(36), /36 years/);
  assert.equal(intakeAgeInstruction(null), '');
});

test('intake objective parser honors explicit baseline and target after scale anchors', () => {
  assert.deepEqual(parseScalePair('Within 6 months, use a 1-10 scale, where 1 is struggling and 10 is confident. The current baseline is a 4, with a target of 8.'), { scaleCurrent: 4, scaleTarget: 8 });
  assert.deepEqual(parseScalePair('The current baseline is a 2, with a target of 7.'), { scaleCurrent: 2, scaleTarget: 7 });
});
