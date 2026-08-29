import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROGRESS_NOTE_OUTPUT_INSTRUCTIONS,
  TREATMENT_PLAN_OUTPUT_INSTRUCTIONS,
  applySharedNoteAidToolContracts,
  getOutputInstructionsForTool,
  isSoipProgressNoteToolId,
  isTreatmentPlanToolId
} from '../clinicalNotePlanOutput.js';
import { CLINICAL_NOTE_AGENT_TOOLS } from '../clinicalNoteAgentTools.js';

test('H0004 and 90837 share the same SOIP output instructions', () => {
  assert.equal(isSoipProgressNoteToolId('clinical_h0004_note'), true);
  assert.equal(isSoipProgressNoteToolId('clinical_psychotherapy_note'), true);
  assert.equal(
    getOutputInstructionsForTool('clinical_h0004_note'),
    getOutputInstructionsForTool('clinical_psychotherapy_note')
  );
  assert.match(PROGRESS_NOTE_OUTPUT_INSTRUCTIONS, /Subjective:/);
  assert.match(PROGRESS_NOTE_OUTPUT_INSTRUCTIONS, /Interventions:/);
});

test('all treatment plan tools share Goal/Objective/1–10 contract', () => {
  const planIds = [
    'clinical_psychotherapy_plan',
    'clinical_h0004_plan',
    'clinical_skill_builders_plan',
    'clinical_individual_plan',
    'clinical_tpt_plan'
  ];
  for (const id of planIds) {
    assert.equal(isTreatmentPlanToolId(id), true);
    const out = getOutputInstructionsForTool(id);
    assert.match(out, /Goal 1:/);
    assert.match(out, /1–10/);
    assert.equal(out, TREATMENT_PLAN_OUTPUT_INSTRUCTIONS);
  }
});

test('applySharedNoteAidToolContracts upgrades H0004 note and plan', () => {
  const [h0004Note, h0004Plan] = applySharedNoteAidToolContracts([
    {
      id: 'clinical_h0004_note',
      systemPrompt: 'tone only',
      outputInstructions: 'Return the note only, no preamble.',
      maxOutputTokens: 1400
    },
    {
      id: 'clinical_h0004_plan',
      systemPrompt: 'Presenting Concerns outline',
      outputInstructions: 'weak',
      maxOutputTokens: 1400
    }
  ]);
  assert.equal(h0004Note.outputInstructions, PROGRESS_NOTE_OUTPUT_INSTRUCTIONS);
  assert.equal(h0004Note.sectionSchema, 'soip');
  assert.equal(h0004Note.maxOutputTokens, 4000);
  assert.match(h0004Note.systemPrompt, /MACHINE OUTPUT CONTRACT/);
  assert.equal(h0004Plan.outputInstructions, TREATMENT_PLAN_OUTPUT_INSTRUCTIONS);
  assert.equal(h0004Plan.sectionSchema, 'treatment_plan');
  assert.match(h0004Plan.systemPrompt, /Goal 1:/);
  assert.match(h0004Plan.systemPrompt, /1–10/);
});

test('exported CLINICAL_NOTE_AGENT_TOOLS already has shared contracts applied', () => {
  const note = CLINICAL_NOTE_AGENT_TOOLS.find((t) => t.id === 'clinical_h0004_note');
  const plan = CLINICAL_NOTE_AGENT_TOOLS.find((t) => t.id === 'clinical_h0004_plan');
  const psy = CLINICAL_NOTE_AGENT_TOOLS.find((t) => t.id === 'clinical_psychotherapy_note');
  assert.ok(note && plan && psy);
  assert.equal(note.outputInstructions, psy.outputInstructions);
  assert.equal(note.sectionSchema, 'soip');
  assert.equal(plan.sectionSchema, 'treatment_plan');
  assert.match(plan.systemPrompt, /MACHINE OUTPUT CONTRACT/);
});
