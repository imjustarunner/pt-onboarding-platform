import { expect, it } from 'vitest';
import { isUnsignedEncounter, encounterNeedsNote, encounterScheduleLabel, isUnsignedClinicalNote } from '../clientEncounterUtils.js';
it('separates future preparation, missing notes, and authored unsigned work', () => {
  expect(isUnsignedEncounter({ note_status: 'planned', display_state: 'planned' })).toBe(false);
  expect(isUnsignedEncounter({ note_status: 'draft', display_state: 'planned' })).toBe(false);
  expect(isUnsignedEncounter({ note_status: null, display_state: 'past' })).toBe(false);
  expect(encounterNeedsNote({ note_status: null, display_state: 'past' })).toBe(true);
  expect(isUnsignedEncounter({ note_status: 'draft', display_state: 'past' })).toBe(true);
  expect(isUnsignedEncounter({ note_status: 'signed', display_state: 'past' })).toBe(false);
  expect(encounterScheduleLabel({ source: 'appointment', display_state: 'past', billing_attached: false })).toContain('attendance not confirmed');
});
it('does not turn review-only contacts or future notes into signature tasks', () => {
  const sessions = [{ id: 1, scheduled_start_at: '2099-11-15T17:00:00Z' }, { id: 2, encounter_status: 'NO_SHOW' }];
  expect(isUnsignedClinicalNote({ note_type: 'CONTACT' })).toBe(false);
  expect(isUnsignedClinicalNote({ clinical_session_id: 1 }, sessions)).toBe(false);
  expect(isUnsignedClinicalNote({ clinical_session_id: 2 }, sessions)).toBe(false);
  expect(isUnsignedClinicalNote({ id: 3, note_type: 'PROGRESS' })).toBe(true);
});
