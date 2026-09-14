import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteSections, intakeOutputError } from '../clinicalNoteSections.service.js';
import { INTAKE_SECTION_TITLES } from '../../config/clinicalNotePlanOutput.js';

test('90791 headings survive alongside bold numbered treatment goals and objectives', () => {
  const text = INTAKE_SECTION_TITLES.map((title, index) => `**${index + 1}. ${title}:**\nDocumented ${title.toLowerCase()}.`).join('\n\n')
    + '\n**Goal 1:**\nImprove daily function.\n**Objective 1.1:**\nTrack coping practice.\n**Objective 1.2:**\nReview barriers.\n**Projected Time to Completion:**\n3 months\n**Goal 2:**\nImprove routines.\n**Objective 2.1:**\nTrack routines.';
  const sections = parseNoteSections(text, { intake: true });
  for (const title of INTAKE_SECTION_TITLES) assert.equal(sections[title], `Documented ${title.toLowerCase()}.`);
  assert.equal(sections['Objective 1.1'], 'Track coping practice.');
  assert.equal(sections['Objective 1.2'], 'Review barriers.');
  assert.equal(sections['Projected Time 1'], '3 months');
  assert.equal(sections.Objective, undefined);
  assert.equal(intakeOutputError('clinical_90791_intake_plan', sections, 'STOP'), null);
});

test('historical intake aliases and MSE subfields preserve their content', () => {
  const sections = parseNoteSections('Current Mental Status\nOrientation: Assessed today.\nMood: Reported low.\nHistory of Present Problem: Historical symptoms.\nMedical Conditions & History: History supplied.\nEducational/Vocational History: Working.\nObjective Content: Observations.\nDiagnostic Justification: Clinician reassessment rationale.', { intake: true });
  assert.equal(sections['Mental Status Examination'], 'Orientation: Assessed today.\nMood: Reported low.');
  assert.equal(sections['History of Present Illness'], 'Historical symptoms.');
  assert.equal(sections['Medical History'], 'History supplied.');
  assert.equal(sections['Educational / Occupational History'], 'Working.');
  assert.equal(sections['Objective Content'], 'Observations.');
  assert.equal(sections['Diagnostic Justification'], 'Clinician reassessment rationale.');
});

test('exact SOIP headings work without consuming prose or losing repeated sections', () => {
  const sections = parseNoteSections('Subjective: Client report.\nObjective: Observations.\nObjective findings remained stable.\nInterventions Used: Reflection\nPlan: Follow up.\nObjective: Additional observations.');
  assert.equal(sections.Objective, 'Observations.\nObjective findings remained stable.\n\nAdditional observations.');
  assert.equal(sections.Interventions, 'Reflection');
  assert.equal(parseNoteSections('Objective Content: Observations.').Objective, 'Observations.');
});

test('incomplete or truncated intake responses cannot pass as complete', () => {
  assert.match(intakeOutputError('clinical_90791_intake_plan', { 'Goal 1': 'Only a plan.' }, 'STOP'), /missing required sections/);
  assert.match(intakeOutputError('clinical_90791_intake_plan', {}, 'MAX_TOKENS'), /interrupted/);
  assert.equal(intakeOutputError('clinical_psychotherapy_note', { Objective: 'Observation' }, 'STOP'), null);
});
