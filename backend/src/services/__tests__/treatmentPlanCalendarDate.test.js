import {expect,it} from 'vitest';
import {parseTreatmentPlanText} from '../treatmentPlanImport.service.js';
it('leaves a missing source date for local-calendar review rather than inventing a UTC date',()=>{
 expect(parseTreatmentPlanText('Goal 1: Improve coping.\nObjective 1.1: Practice a coping skill.').effectiveDate).toBeNull();
});
it('retains the effective calendar date explicitly present on a source plan',()=>{
 expect(parseTreatmentPlanText('Effective Date: 11/07/2026\nGoal 1: Improve coping.').effectiveDate).toBe('2026-11-07');
});
