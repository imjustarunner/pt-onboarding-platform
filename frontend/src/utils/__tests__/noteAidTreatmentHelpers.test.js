import { describe, expect, it } from 'vitest';
import {
  buildObjectiveRatingsContextText,
  buildTreatmentPlanContextText,
  clientDisplayInitials,
  computeProgressLabel,
  distanceToGoal
} from '../noteAidTreatmentHelpers.js';

describe('noteAidTreatmentHelpers', () => {
  it('computes distance and progress toward goal (higher is better)', () => {
    expect(distanceToGoal(3, 8)).toBe(5);
    expect(computeProgressLabel({ previousValue: 3, newValue: 5, target: 8 })).toBe('progressing');
    expect(computeProgressLabel({ previousValue: 5, newValue: 2, target: 8 })).toBe('regressed');
    expect(computeProgressLabel({ previousValue: 5, newValue: 8, target: 8 })).toBe('improved');
  });

  it('computes progress when lower scores are better', () => {
    expect(computeProgressLabel({ previousValue: 7, newValue: 4, target: 2 })).toBe('progressing');
    expect(computeProgressLabel({ previousValue: 4, newValue: 6, target: 2 })).toBe('regressed');
    expect(computeProgressLabel({ previousValue: 4, newValue: 2, target: 2 })).toBe('improved');
  });

  it('builds plan and ratings context text', () => {
    const plan = {
      goals: [
        {
          id: 1,
          goal_index: 1,
          goal_text: 'Reduce anxiety',
          objectives: [
            {
              id: 11,
              objective_index: 1,
              objective_text: 'Use coping skills 4x/week',
              scale_current: 3,
              scale_target: 7
            }
          ]
        }
      ]
    };
    const ctx = buildTreatmentPlanContextText(plan);
    expect(ctx).toContain('Reduce anxiety');
    expect(ctx).toContain('3 → goal 7');
    const ratings = buildObjectiveRatingsContextText([
      {
        goalText: 'Reduce anxiety',
        objectiveText: 'Use coping skills 4x/week',
        disposition: 'rated',
        scaleValue: 5,
        scaleTarget: 7,
        progressLabel: 'progressing'
      }
    ]);
    expect(ratings).toContain('rated 5/10');
    expect(ratings).toContain('progressing');
  });

  it('builds updater prefill with diagnosis, plan, and ratings', async () => {
    const { buildUpdaterPrefillDocument } = await import('../noteAidTreatmentHelpers.js');
    const text = buildUpdaterPrefillDocument({
      latestPlan: {
        goals: [
          {
            id: 1,
            goal_index: 1,
            goal_text: 'Reduce anxiety',
            objectives: [
              {
                id: 11,
                objective_index: 1,
                objective_text: 'Coping skills weekly',
                scale_current: 4,
                scale_target: 8
              }
            ]
          }
        ]
      },
      diagnoses: [{ icd10_code: 'F41.1', description: 'GAD', is_primary: 1, is_active: 1 }],
      ratings: [
        {
          goal_text: 'Reduce anxiety',
          objective_text: 'Coping skills weekly',
          disposition: 'rated',
          scale_value: 8,
          scale_target: 8,
          progress_label: 'improved'
        }
      ],
      renewalReason: 'Objective reached goal',
      progressNoteExcerpt: 'Client reported fewer panic episodes.'
    });
    expect(text).toContain('F41.1');
    expect(text).toContain('Reduce anxiety');
    expect(text).toContain('improved');
    expect(text).toContain('fewer panic');
    expect(text).toContain('Update reason');
  });

  it('derives initials from client name', () => {
    expect(clientDisplayInitials({ first_name: 'Sam', last_name: 'Baker' })).toBe('SB');
    expect(clientDisplayInitials({ initials: 'AM' })).toBe('AM');
  });
});
