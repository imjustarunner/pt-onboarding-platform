import {it,expect} from 'vitest';
import {SIMPLE_HANDBOOK_CLAUSE,workloadHandbookSection,codeReferenceSection,GROUP_POLICY_HTML,TRAINING_LEAVE_SECTION,SCHOOL_SUPPORT_SECTION} from '../compensationHandbookClarifications.js';
import {renderAmendment,commonAmendmentClauses} from '../itscoOctober2026Drafts.js';
it('replaces the old dense clause even in saved custom amendment text and preserves other edits',()=>{
 const old=commonAmendmentClauses().replace(/<h3>8\.[\s\S]*?(?=<h3>9\.)/,'<h3>8. Handbook appendix, group policy and prospective changes</h3><p>Old dense wording.</p>')+'<p>Owner individual edit.</p>';
 const result=renderAmendment({employee:{name:'Example'},schedule:{category:2,level:2},commonClausesHtml:old});
 expect(result).toContain(SIMPLE_HANDBOOK_CLAUSE);expect(result).not.toContain('Old dense wording');expect(result).toContain('Owner individual edit.');expect(result).toContain('Supervisory reviews');expect(result).toContain('mileage reimbursement');expect(result).toContain('Training Leave policy');
});
it('uses the saved threshold and separate reduced rates rather than guessing from the regular rate',()=>{
 const section=workloadHandbookSection({thresholds:{tier1MinWeekly:6},rates:[{category:2,credit_rate_probation:38,hcode_rate_probation:25}]});
 expect(section.bodyHtml).toContain('12 per two-week');expect(section.bodyHtml).toContain('$38.00');expect(section.bodyHtml).toContain('$25.00');expect(section.bodyHtml).toContain('December 9');expect(section.bodyHtml).toContain('prior-period tier grace');
});
it('does not treat a saved group rate or zero-credit mapping as approval',()=>{
 const section=codeReferenceSection([{service_code:'90853',category:'direct',credit_value:1},{service_code:'99051',category:'direct',credit_value:0},{service_code:'H0031',category:'direct',credit_value:1/60,pay_divisor:60},{service_code:'Homework',category:'direct',credit_value:1/60,pay_divisor:60}]);
 expect(section.bodyHtml).toContain('Group moratorium — written exception required');expect(section.bodyHtml).toContain('No automatic credit payment');expect(section.bodyHtml).toContain('Actual service minutes ÷ 60');expect(section.bodyHtml).not.toContain('<th>Homework</th>');
});
it('keeps the group proposal option while requiring funded legal wages and official dated sources',()=>{
 expect(GROUP_POLICY_HTML).toContain('Staff may propose a group');expect(GROUP_POLICY_HTML).toContain('reasonable likelihood');expect(GROUP_POLICY_HTML).toContain('individual written agreement');expect(GROUP_POLICY_HTML).toContain('Public Law 119-21');expect(GROUP_POLICY_HTML).toContain('leg.colorado.gov/bills/hb26-1410');expect(GROUP_POLICY_HTML).toContain('historical context');
});
it('keeps benefit drafts separate and does not invent forfeiture authority or remove wages from payroll',()=>{
 expect(TRAINING_LEAVE_SECTION.bodyHtml).toContain('All hours');expect(TRAINING_LEAVE_SECTION.bodyHtml).toContain('0.25');expect(TRAINING_LEAVE_SECTION.bodyHtml).toContain('20-hour balance cap');
 expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('2 support activity hours');expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('Thirty qualifying hours earn 2.4');expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('not be sent to ADP as a leave bank');expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('normal payroll, tax and wage records');expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('20-hour balance cap');
});

it('replaces future funding percentages without changing prior earnings or salary terms',()=>{
 const rendered=renderAmendment({employee:{name:'Example'},schedule:{category:2,level:2},commonClausesHtml:commonAmendmentClauses()});
 expect(rendered).toContain('11. Compensation regardless of funding source');expect(rendered).toContain('13. Employee acknowledgment');expect(rendered).toContain('iMatter');expect(rendered).toContain('replace prior funding-specific percentage');expect(rendered).toContain('does not reduce compensation already earned');
 expect(rendered.match(/<h3>11. Compensation regardless of funding source/g)).toHaveLength(1);
});

it('places named benefits before agreement clauses, with school benefits only for assigned staff',()=>{
 const base={employee:{name:'Example'},schedule:{category:2,level:2},benefitsEligibility:{schoolAssigned:true}};
 const html=renderAmendment(base);
 for(const text of ['Benefits and handbook policies','Earned training benefit','Earned school support benefit','School mileage reimbursement','weather-related school closures','client absences or cancellations','only after payroll approves'])expect(html).toContain(text);
 expect(html.indexOf('Benefits and handbook policies')).toBeLessThan(html.indexOf('1. Effective date'));
 const office=renderAmendment({...base,benefitsEligibility:{schoolAssigned:false}});
 expect(office).toContain('Earned training benefit');expect(office).not.toContain('Earned school support benefit');expect(office).not.toContain('<h4>School mileage reimbursement');
 expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('weather-related school closures');expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('20-hour balance cap');
});
