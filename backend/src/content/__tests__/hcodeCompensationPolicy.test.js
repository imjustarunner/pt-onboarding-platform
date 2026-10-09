import {expect,it} from 'vitest';
import {HCODE_HANDBOOK_HTML,replaceHcodeHandbookSection} from '../hcodeCompensationPolicy.js';
import {handbookSections,renderAmendment} from '../itscoOctober2026Drafts.js';
it('preserves edited content surrounding the targeted handbook section and is idempotent',()=>{
 const before='<p>Owner introduction</p>',after='<h2>Actual time, payer units and internal credits</h2><p>Owner addition</p>';
 const result=replaceHcodeHandbookSection(before+'<h2>H-code category and indirect allowance</h2><p>Old rule</p>'+after);
 expect(result).toBe(before+HCODE_HANDBOOK_HTML+after);
 expect(replaceHcodeHandbookSection(result)).toBe(result);
 expect(()=>replaceHcodeHandbookSection('Unrecognized edited document')).toThrow('preserve draft');
});
it('keeps unit-based and encounter-minute methods distinct, with correct threshold and allowance',()=>{
 const body=handbookSections().find(s=>s.slug==='colorado-billing-compensation-appendix').bodyHtml;
 for(const phrase of ['H0031 and H0032','Units × 0.25','Documented service minutes ÷ 60','8 through 22 minutes = 1 unit','23 through 37 minutes = 2 units','adds 2.5 indirect minutes','adds 5 indirect minutes','Category 1 reports actual indirect time separately','does not itself change compensation','below a payer’s billing threshold'])expect(body).toContain(phrase);
});
it.each([1,2,3])('keeps category %i amendments personal and defers service-basis changes to the handbook',category=>{
 const html=renderAmendment({employee:{name:'Example'},leaveChoice:'sick',schedule:{category,level:2,creditRate:44,hcodeRate:32,indirectRate:22,supportRate:18,ptoRate:44,probationWaived:true}});
 expect(html).toContain('current, effective Colorado Billing &amp; Compensation Appendix'.replace('&amp;','&'));
 expect(html).toContain('unit-based versus actual-minute compensation');
 expect(html).toContain('Under the current handbook unit-based method');
 expect(html).not.toContain(category===1?'You receive 10 minutes of indirect pay':'Category 1 reports actual indirect time separately');
 expect(html).toContain('do not reduce pay already earned');
});
