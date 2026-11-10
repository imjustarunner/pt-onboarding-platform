import {expect,it} from 'vitest';
import {parseTreatmentPlanText} from '../treatmentPlanImport.service.js';
it('leaves a missing source date for local-calendar review rather than inventing a UTC date',()=>{
 expect(parseTreatmentPlanText('Goal 1: Improve coping.\nObjective 1.1: Practice a coping skill.').effectiveDate).toBeNull();
});
it('retains the effective calendar date explicitly present on a source plan',()=>{
 expect(parseTreatmentPlanText('Effective Date: 11/07/2026\nGoal 1: Improve coping.').effectiveDate).toBe('2026-11-07');
});
it('keeps unnumbered interventions and review instructions out of the objective',()=>{
 const parsed=parseTreatmentPlanText('Goal: Identify feelings.\nObjective: Name three feelings.\nIntervention: Skills practice and role play.\nReview interval: 90 days, reminder 75 days.\nNo effective date or signature has been supplied. Provider review is required; do not sign actual clinical records.');
 expect(parsed.effectiveDate).toBeNull();
 expect(parsed.goals[0].objectives[0].objectiveText).toBe('Name three feelings.');
 expect(parsed.goals[0].objectives[0].interventions).toEqual(['Skills practice and role play.']);
 expect(parsed.sourceReviewSchedule).toEqual({renewAfterDays:90,flagAfterDays:75});
});
