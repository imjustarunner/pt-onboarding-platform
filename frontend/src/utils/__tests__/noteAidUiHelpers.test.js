import { describe, expect, it } from 'vitest';
import {
  buildDisplaySections,
  formatFullNoteCopy,
  parseSoapSectionsFromText
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

  it('splits a numbered Output blob into copyable SOAP panels', () => {
    const blob = [
      '1. Subjective: Client reported anxiety about the wedding.',
      '2. Objective: Client engaged and was reflective.',
      '3. Interventions: Supportive Therapy, Problem Solving',
      '4. Plan: Continue addressing anxiety next session.'
    ].join('\n');
    const panels = buildDisplaySections({ Output: blob });
    expect(panels.map((p) => p.id)).toEqual([
      'Subjective',
      'Objective',
      'Interventions',
      'Plan'
    ]);
    expect(panels[0].text).toBe('Client reported anxiety about the wedding.');
    expect(panels[2].text).toBe('Supportive Therapy, Problem Solving');
  });

  it('parses inline SOAP headers from raw text', () => {
    const parsed = parseSoapSectionsFromText(
      '1. Subjective: Anxious\n2. Objective: Calm\n3. Interventions: CBT\n4. Plan: Follow up'
    );
    expect(parsed).toEqual({
      Subjective: 'Anxious',
      Objective: 'Calm',
      Interventions: 'CBT',
      Plan: 'Follow up'
    });
  });

  it('formats a full note copy block', () => {
    const text = formatFullNoteCopy({
      sections: { Subjective: 'Anxious', Objective: 'Calm', Interventions: 'CBT', Plan: 'Follow up' },
      initials: 'A.M.',
      dateOfService: '2026-07-14',
      dateWritten: '2026-07-14',
      includeInteractiveComplexity: true
    });
    expect(text).toContain('Client: A.M.');
    expect(text).toContain('Interactive Complexity: Included');
    expect(text).toContain('S - Subjective');
    expect(text).toContain('I - Interventions');
    expect(text).toContain('CBT');
    expect(text).toContain('Created: 2026-07-14');
    expect(text).not.toContain('Intervention Types:');
  });
});
