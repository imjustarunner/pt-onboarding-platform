import { describe, expect, it } from 'vitest';
import {
  buildDisplaySections,
  buildTreatmentPlanPanels,
  formatFullNoteCopy,
  parseSoapSectionsFromText,
  parseTreatmentPlanPanelsFromText
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

  it('splits treatment plan into copyable Goal then Objective panels', () => {
    const blob = [
      'Goal 1: Reduce anxiety symptoms',
      'Objective 1:',
      'Client will practice coping skills rated 4/10 currently.',
      'Projected Time to Completion: 12 weeks',
      'Goal 2: Improve school engagement',
      'Objective 2:',
      'Client will attend school 4 days per week.',
      'Projected Time to Completion: 16 weeks',
      'Goal 3: Strengthen family communication',
      'Objective 3: Family will use weekly check-ins.',
      'Projected Time to Completion: 10 weeks',
      'Discharge Plan',
      'Services end when goals are met and functioning stabilizes.'
    ].join('\n');
    const panels = buildDisplaySections({ Output: blob });
    expect(panels.map((p) => p.id)).toEqual([
      'Goal 1',
      'Objective 1',
      'Projected Time 1',
      'Goal 2',
      'Objective 2',
      'Projected Time 2',
      'Goal 3',
      'Objective 3',
      'Projected Time 3',
      'Discharge Plan'
    ]);
    expect(panels[0].text).toContain('Reduce anxiety');
    expect(panels[1].kind).toBe('objective');
    expect(panels[panels.length - 1].id).toBe('Discharge Plan');
  });

  it('parses treatment plan headers from raw text', () => {
    const panels = parseTreatmentPlanPanelsFromText(
      'Goal 1: Sleep\nObjective 1: Bedtime routine\nGoal 2: Mood\nObjective 2: Track mood\nDischarge Plan\nDone when stable.'
    );
    expect(buildTreatmentPlanPanels({ Output: panels.map(() => '').join('') }).length).toBeGreaterThanOrEqual(0);
    expect(panels.filter((p) => p.kind === 'goal')).toHaveLength(2);
    expect(panels.filter((p) => p.kind === 'objective')).toHaveLength(2);
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
