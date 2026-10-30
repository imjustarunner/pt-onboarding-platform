import {describe,it,expect} from 'vitest';
import {applyDirectCareIndirectCorrection, correctDirectCareIndirectText, DIRECT_CARE_INDIRECT_CORRECTION_HTML} from '../directCareIndirectCorrection.js';
import {personalPayTypeDescriptions} from '../compensationSchedulePresentation.js';
import {employmentCategoryLevelTerms} from '../employmentCategoryLevelTerms.js';
import {handbookSections} from '../itscoOctober2026Drafts.js';

describe('Direct Care handbook correction',()=>{
 it('preserves owner content and is idempotent',()=>{
  const source={sections:[{slug:'owner-section',bodyHtml:'<p>Owner wording and rates $42.00.</p><p>Category 1 reports actual indirect time separately and receives no automatic allowance. </p><img src="owner.png">'}]};
  const result=applyDirectCareIndirectCorrection(source),once=structuredClone(result);
  expect(result.sections[0].bodyHtml).toContain('Owner wording and rates $42.00.');expect(result.sections[0].bodyHtml).toContain('owner.png');
  expect(result.sections[0].bodyHtml).not.toContain('receives no automatic allowance');
  expect(applyDirectCareIndirectCorrection(result)).toEqual(once);
 });
 it.each([1,2,3])('gives Category %s the allowance in new employment terms despite a saved zero',category=>{
  const paySystem={creditRate:44,creditRateProbation:36,hcodeRate:32,hcodeRateProbation:28,indirectRate:22,supportActivityRate:18,autoIndirectMinutesPerHour:0};
  const result=employmentCategoryLevelTerms({row:{category,level:2,paySystem},agencySlug:'itsco'});
  expect(result.schedule.autoIndirectMinutes).toBe(10);
  expect(result.compensation.includes('10 minutes of automatic indirect pay')).toBe(true);
  expect(paySystem.autoIndirectMinutesPerHour).toBe(0);
  expect(personalPayTypeDescriptions(result.schedule).includes('no indirect allowance')).toBe(false);
 });
 it('repairs all reusable October policy sections and states the full service scope',()=>{
  for(const section of handbookSections()){
   const html=correctDirectCareIndirectText(section.bodyHtml);
   expect(/Category 1[^<.]*no.automatic.indirect|Category 1 reports actual indirect time separately|Category 1 uses separately submitted actual indirect time/.test(html),section.slug).toBe(false);
  }
  expect(DIRECT_CARE_INDIRECT_CORRECTION_HTML).toContain('other approved non-9-series billable hourly or unit-based services');
  expect(DIRECT_CARE_INDIRECT_CORRECTION_HTML).toContain('Preserve the original issued or signed amendment');
 });
});
