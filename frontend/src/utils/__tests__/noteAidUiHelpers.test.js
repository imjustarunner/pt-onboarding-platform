import { describe, expect, it } from 'vitest';
import {
  buildDisplaySections,
  formatFullNoteCopy,
  inferInterventionTypes
} from '../../utils/noteAidUiHelpers.js';

describe('noteAidUiHelpers', () => {
  it('maps SOAP sections to lettered panels', () => {
    const panels = buildDisplaySections({
      Subjective: 'S text',
      'Objective Content': 'O text',
      'Interventions Used': 'I text',
      Plan: 'P text'
    });
    expect(panels.map((p) => p.title)).toEqual([
      'S - Subjective',
      'O - Objective',
      'I - Interventions',
      'P - Plan'
    ]);
  });

  it('infers intervention checkboxes from free text', () => {
    expect(inferInterventionTypes('Applied CBT and DBT skills with psychoeducation')).toEqual(
      expect.arrayContaining(['CBT', 'DBT', 'Psychoeducation'])
    );
  });

  it('formats a full note copy block', () => {
    const text = formatFullNoteCopy({
      sections: { Subjective: 'Anxious', Objective: 'Calm', Interventions: 'CBT', Plan: 'Follow up' },
      initials: 'A.M.',
      dateOfService: '2026-07-14',
      dateWritten: '2026-07-14',
      includeInteractiveComplexity: true,
      interventionTypes: ['CBT']
    });
    expect(text).toContain('Client: A.M.');
    expect(text).toContain('Interactive Complexity: Included');
    expect(text).toContain('S - Subjective');
    expect(text).toContain('Created: 2026-07-14');
  });
});
