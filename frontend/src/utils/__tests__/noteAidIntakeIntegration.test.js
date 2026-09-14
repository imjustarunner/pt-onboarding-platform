import { describe, it, expect } from 'vitest';
import { intakeDiagnoses, intakeAssessments, mergeGeneratedAssessment, generatedTreatmentPlan, intakeSectionsForRecord } from '../noteAidIntakeIntegration';
import { defaultMentalStatusExam } from '../noteAidSessionQueue';
import { parseScalePair } from '../treatmentPlanDuration';

describe('generated intake integration', () => {
  it('extracts current and target after anchors without using anchor or duration numbers', () => {
    expect(parseScalePair('Within 6 months, use a 1-10 scale where 1 means struggling and 10 means confident. The current baseline is a 4, with a target of 8.')).toEqual({ scaleCurrent: 4, scaleTarget: 8 });
    expect(parseScalePair('Current baseline is a 2, with a target of 7.')).toEqual({ scaleCurrent: 2, scaleTarget: 7 });
    expect(parseScalePair('On a 1-10 scale, where 1 is low and 10 is high.')).toEqual({ scaleCurrent: null, scaleTarget: null });
    expect(parseScalePair('Baseline: 14; target: 8')).toEqual({ scaleCurrent: null, scaleTarget: 8 });
  });

  it('builds all diagnoses and a plan with objective scores, interventions, and separate fields', () => {
    const sections = {
      Diagnosis: 'F41.1 Synthetic diagnosis\nZ63.4 Synthetic context',
      'Diagnostic Justification': 'Reviewed formulation.',
      'Presenting Problem': 'Difficulty managing emotions.',
      'Prescribed Frequency of Treatment': 'Weekly',
      'Goal 1': 'Improve coping.',
      'Objective 1.2': 'Current baseline is a 2, with a target of 7.',
      'Objective 1.1': 'Current baseline is a 4, with a target of 8.',
      'Interventions 1.1': 'Skills rehearsal; Psychoeducation',
      'Projected Time 1': '6 months',
      'Discharge Plan': 'Sustained independent coping.'
    };
    const diagnoses = intakeDiagnoses(sections);
    expect(diagnoses.map((d) => d.is_primary)).toEqual([1, 0]);
    const plan = generatedTreatmentPlan(sections, { diagnoses, effectiveDate: '2026-08-20', diagnosticJustification: sections['Diagnostic Justification'] });
    expect(plan.diagnoses).toHaveLength(2);
    expect(plan.goals[0].objectives.map((o) => [o.scaleCurrent, o.scaleTarget])).toEqual([[4, 8], [2, 7]]);
    expect(plan.goals[0].objectives[0].interventions).toEqual(['Skills rehearsal', 'Psychoeducation']);
    expect(plan.goals[0].durationMonths).toBe(6);
    expect(plan.presentingProblem).toBe(sections['Presenting Problem']);
    expect(plan.prescribedFrequency).toBe('Weekly');
    expect(plan.dischargePlan).toBe(sections['Discharge Plan']);
  });

  it('maps supplied MSE labels without inventing findings or expanding orientation ×3 to ×4', () => {
    const assessment = intakeAssessments({
      'Mental Status Examination': 'General Appearance: Appropriate\nOrientation: X3: Oriented to Person, Place, and Time\nMotor Activity: Unremarkable\nJudgment/Impulse Control: Excellent\nFunctional Status: Intact',
      'Risk Assessment': 'Patient denies all areas of risk. No contrary clinical indications present.'
    });
    expect(assessment.mentalStatusExam.domains.Appearance.option).toBe('Appropriate');
    expect(assessment.mentalStatusExam.domains.Orientation.option).toContain('X3');
    expect(assessment.mentalStatusExam.domains.Judgment.option).toBe('Excellent');
    expect(assessment.mentalStatusExam.domains['Impulse Control'].option).toBe('Excellent');
    expect(assessment.mentalStatusExam.domains['Eye Contact']).toBeUndefined();
    expect(assessment.unmappedMse).toEqual(['Functional Status: Intact']);
    expect(assessment.riskAssessment.patientDeniesAll).toBe(true);
    expect(intakeAssessments({ 'Risk Assessment': 'Patient denies all areas of risk. Recent self-harm was reported.' }).riskAssessment.patientDeniesAll).toBe(false);
  });

  it('preserves manual assessment edits through regeneration and signs the edited findings', () => {
    const original = intakeAssessments({ 'Mental Status Examination': 'Mood: Euthymic' });
    const current = mergeGeneratedAssessment(defaultMentalStatusExam(), null, original.mentalStatusExam);
    current.domains.Mood = { status: 'selected', option: 'Anxious', detail: '' };
    const revised = intakeAssessments({ 'Mental Status Examination': 'Mood: Calm\nSpeech: Normal' });
    const merged = mergeGeneratedAssessment(current, original.mentalStatusExam, revised.mentalStatusExam);
    expect(merged.domains.Mood.option).toBe('Anxious');
    expect(merged.domains.Speech.option).toBe('Normal');
    const explicitlyReviewed = { ...current, allNormal: true };
    expect(mergeGeneratedAssessment(explicitlyReviewed, original.mentalStatusExam, revised.mentalStatusExam)).toEqual(explicitlyReviewed);
    const sections = intakeSectionsForRecord({ 'Mental Status Examination': 'Mood: Calm\nFunctional Status: Intact' }, { mentalStatusExam: merged });
    expect(sections['Mental Status Examination']).toContain('Mood: Anxious');
    expect(sections['Mental Status Examination']).toContain('Functional Status: Intact');
    expect(sections['Mental Status Examination']).not.toContain('Mood: Calm');
  });
});
