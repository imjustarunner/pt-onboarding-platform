import { describe, it, expect } from 'vitest';
import {
  currentEvaluationPeriod
} from '../employeeEvaluation.service.js';
import {
  generateRubricFromJobDescription,
  templateSlugForJobDescription
} from '../jobDescriptionEvaluationTemplate.service.js';
import {
  normalizeMeetingSubtype,
  isCompensationClaimMeeting,
  meetingTypeLabelForEvent
} from '../meetingCompensationClaims.service.js';

describe('currentEvaluationPeriod', () => {
  it('returns H1 for January–June', () => {
    expect(currentEvaluationPeriod(new Date('2027-03-15T12:00:00Z'))).toEqual({
      periodYear: 2027,
      periodHalf: 'H1',
      label: 'H1 2027'
    });
  });

  it('returns H2 for July–December', () => {
    expect(currentEvaluationPeriod(new Date('2026-08-22T12:00:00Z'))).toEqual({
      periodYear: 2026,
      periodHalf: 'H2',
      label: 'H2 2026'
    });
  });
});

describe('generateRubricFromJobDescription', () => {
  it('builds criteria from responsibilities section', () => {
    const rubric = generateRubricFromJobDescription({
      title: 'Support Staff Assistant',
      description_sections_json: {
        responsibilities: [
          'Coordinate office logistics and scheduling support',
          'Maintain accurate records and documentation'
        ]
      }
    });
    expect(rubric.sections[0].criteria).toHaveLength(2);
    expect(rubric.sections[0].criteria[0].label).toMatch(/office logistics/i);
    expect(rubric.ratingScale.length).toBeGreaterThanOrEqual(4);
    expect(rubric.reflectionPrompts.length).toBeGreaterThan(0);
  });

  it('falls back to default criteria when JD has no responsibilities', () => {
    const rubric = generateRubricFromJobDescription({ title: 'Intern Mental Health Provider' });
    expect(rubric.sections[0].criteria.length).toBeGreaterThanOrEqual(3);
    expect(rubric.title).toMatch(/Intern Mental Health Provider/i);
  });

  it('slugifies job titles for template keys', () => {
    expect(templateSlugForJobDescription({ id: 29, title: 'Support Staff Assistant - Denver' }))
      .toMatch(/support_staff_assistant/);
  });
});

describe('evaluation meeting compensation', () => {
  it('normalizes evaluation subtype', () => {
    expect(normalizeMeetingSubtype('evaluation')).toBe('evaluation');
    expect(normalizeMeetingSubtype('EVALUATION')).toBe('evaluation');
    expect(normalizeMeetingSubtype('other')).toBe('general');
  });

  it('marks evaluation TEAM_MEETING as compensation-eligible', () => {
    expect(isCompensationClaimMeeting({ kind: 'TEAM_MEETING', meeting_subtype: 'evaluation' })).toBe(true);
    expect(isCompensationClaimMeeting({ kind: 'TEAM_MEETING', meetingSubtype: 'evaluation' })).toBe(true);
    expect(isCompensationClaimMeeting({ kind: 'TEAM_MEETING', meeting_subtype: 'general' })).toBe(false);
  });

  it('labels evaluation meetings for payroll claims', () => {
    expect(meetingTypeLabelForEvent({ kind: 'TEAM_MEETING', meeting_subtype: 'evaluation' }))
      .toBe('Employee Evaluation');
  });
});
