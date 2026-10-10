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
 expect(section.bodyHtml).toContain('Group moratorium — express written approval of an exception required');expect(section.bodyHtml).toContain('No automatic credit payment');expect(section.bodyHtml).toContain('Actual service minutes ÷ 60');expect(section.bodyHtml).not.toContain('<th>Homework</th>');
});
it('keeps the group proposal option while explaining funding and family coverage concerns',()=>{
 expect(GROUP_POLICY_HTML).toContain('Staff may propose a group');expect(GROUP_POLICY_HTML).toContain('reasonable likelihood');expect(GROUP_POLICY_HTML).toContain('individual written agreement');expect(GROUP_POLICY_HTML).toContain('CCHA, Rocky Mountain Health Plans and Colorado Access');expect(GROUP_POLICY_HTML).toContain('federal and state levels');expect(GROUP_POLICY_HTML).toContain('even when a child remains eligible');expect(GROUP_POLICY_HTML).not.toContain('href=');
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

it('places electronic signatures last, incorporates review into section 10 and replaces prior financial terms',()=>{
 const html=renderAmendment({employee:{name:'Example'},schedule:{category:2,level:2},commonClausesHtml:commonAmendmentClauses(),additionalTerms:'Employee-specific term.'});
 expect(html).toContain('replaces all financial, compensation and employee-benefit terms');
 expect(html).toContain('All other terms of the prior agreement and all other agency policies remain in effect');
 expect(html).not.toContain('____________________');expect(html).not.toContain('Other existing vacation/PTO entitlements are unchanged');
 expect(html).toContain('countersigns electronically');expect(html).toContain('My Documents');
 expect(html.indexOf('Individual notes')).toBeLessThan(html.indexOf('13. Employee acknowledgment and signatures'));
 const section10=html.split('<h3>10. Compensation-level expectations and review</h3>')[1].split('<h3>11.')[0];
 expect(section10).toContain('Supervisory reviews, clinical documentation reviews and formal performance evaluations');
 expect(html.match(/Supervisory reviews, clinical documentation reviews/g)).toHaveLength(1);
 expect(html.slice(html.indexOf('13. Employee acknowledgment and signatures'))).not.toMatch(/<h[1-6]>/);
});

import {codeInventory,formatHandbookQuantity,formatHandbookBasis,HANDBOOK_APP_TRANSITION} from '../handbookCodePresentation.js';
import {SUPERVISOR_COMPENSATION_HANDBOOK,roleCompensationTerms} from '../roleCompensationTerms.js';
it('formats saved decimal values and basis labels without losing minute equivalence',()=>{
 expect(formatHandbookQuantity('1.0000000000')).toBe('1');expect(formatHandbookQuantity('0.7500000000')).toBe('0.75');expect(formatHandbookQuantity('0.0166666667')).toBe('1/60');expect(formatHandbookBasis('per_hour')).toBe('Per hour');
});
it('separates restricted mappings from available services in both tables',()=>{
 const rules=['90837','90853','H0004','H0025','H2014','H2015','H2016','H2017','H2018','H2032'].map(service_code=>({service_code,category:'direct',credit_value:'1.0000000000',pay_rate_unit:'per_unit'}));
 for(const html of [codeInventory(rules),codeReferenceSection(rules).bodyHtml]){
  const [available,restricted]=html.split('<h2>Restricted and currently unapproved services</h2>');
  for(const code of ['90853','H0025','H2014','H2015','H2016','H2017','H2018','H2032']){expect(available).not.toMatch(new RegExp('<(?:th|td)>'+code+'</'));expect(restricted).toContain(code);}
  expect(restricted).toContain('Not approved for individual services');expect(restricted).toContain('Skill Builders only');expect(restricted).toContain('Express written permission required before any use');
 }
});
it('uses contracted percentages only in the handbook and preserves personal supervision rates',()=>{
 expect(SUPERVISOR_COMPENSATION_HANDBOOK).not.toContain('$');for(const rate of ['100%','150%','50%'])expect(SUPERVISOR_COMPENSATION_HANDBOOK).toContain(rate);
 expect(roleCompensationTerms({supervisor:{hourlyRate:65}})).toContain('$97.50');expect(SUPERVISOR_COMPENSATION_HANDBOOK).toContain('actual note-review hour');
 expect(HANDBOOK_APP_TRANSITION.bodyHtml).toContain('will transition into the app');expect(HANDBOOK_APP_TRANSITION.bodyHtml).not.toContain('Replace old');
});

import {correctHandbookPresentation} from '../handbookPresentationCorrections.js';
it('refreshes saved content idempotently and preserves unrelated edits and attached media',()=>{
 const tail='<p>Owner note.</p><figure><img src="training.png"></figure>';
 const old='<h2>Saved code inventory</h2><table><tr><td>H2014</td></tr></table>'+tail;
 const rules=[{service_code:'H0004',credit_value:'.25',category:'direct',pay_rate_unit:'per_hour'}];
 const refreshed=correctHandbookPresentation('colorado-billing-compensation-appendix',old,rules);
 expect(refreshed).toContain(tail);expect(refreshed).toContain('Per hour');expect(correctHandbookPresentation('colorado-billing-compensation-appendix',refreshed,rules)).toBe(refreshed);
 const reference=codeReferenceSection(rules).bodyHtml+tail;expect(correctHandbookPresentation('service-code-approval-and-credit-reference',reference,rules)).toBe(reference);
 const originalSupervision='<p>Timekeeping owner edit.</p><!-- supervisor-compensation-october-2026 -->'+roleCompensationTerms({supervisor:{hourlyRate:65}})+tail;
 const supervision=correctHandbookPresentation('timekeeping-support-and-overtime',originalSupervision);
 expect(supervision).not.toContain('$65');expect(supervision).toContain('Timekeeping owner edit.');expect(supervision).toContain(tail);expect(correctHandbookPresentation('timekeeping-support-and-overtime',supervision)).toBe(supervision);
 const transition=correctHandbookPresentation(HANDBOOK_APP_TRANSITION.slug,'<p>Old summary.</p>'+tail);expect(transition).toContain('<figure>');expect(transition).not.toContain('Old summary');expect(correctHandbookPresentation(HANDBOOK_APP_TRANSITION.slug,transition)).toBe(transition);
});

import {MEDICAID_GROUP_RATIONALE,updateMedicaidGroupRationale} from '../medicaidGroupRationale.js';
it('replaces old detailed Medicaid references while preserving policy and appended owner content',()=>{
 const policy='<h2>Group approvals</h2><p>Written permission required.</p>';
 const extra='<p>Owner addition.</p><figure><img src="instructions.png"></figure>';
 const old=policy+'<h2>Why groups require review</h2><p>Old explanation.</p><ul><li><a href="https://example.test">Old citation</a></li></ul><h2>Federal Medicaid changes</h2><p>Old dated claims.</p>'+extra;
 const updated=updateMedicaidGroupRationale(old);
 expect(updated).toBe(policy+MEDICAID_GROUP_RATIONALE+extra);expect(updateMedicaidGroupRationale(updated)).toBe(updated);
});

import {EXTRA_DUTY_PAY_TERMS,updateAmendmentExecutionTerms} from '../amendmentExecution.js';
it('permits documented additional-duty pay in section 2 before signatures without rewriting unrelated terms',()=>{
 const prior='<h3>2. Individual category, level and rates</h3><p>Owner rate term.</p><h3>3. Other policy</h3><p>Keep this.</p>';
 const html=updateAmendmentExecutionTerms(prior);
 expect(html).toContain(EXTRA_DUTY_PAY_TERMS);expect(html).toContain('Owner rate term.');expect(html).toContain('<h3>3. Other policy</h3><p>Keep this.</p>');expect(updateAmendmentExecutionTerms(html)).toBe(html);
 const rendered=renderAmendment({employee:{name:'Example'},schedule:{category:2,level:2}});
 expect(rendered).toContain('both parties’ acceptance');expect(rendered).toContain('without issuing a new full employment amendment');expect(rendered.indexOf(EXTRA_DUTY_PAY_TERMS)).toBeLessThan(rendered.indexOf('13. Employee acknowledgment'));
});

import {correctIndividualAmendment,correctSpanishLanguages,correctSpanishProfile,MARIELA_TRAVEL_STIPEND} from '../octoberIndividualCorrections.js';
it('corrects Spanish eligibility without losing unrelated pay terms or languages',()=>{
 const original={schedule:{creditRate:44,spanishDifferentialEligible:true},additionalTerms:'Existing duty.'};
 expect(correctIndividualAmendment(original,482).schedule).toEqual({creditRate:44,spanishDifferentialEligible:false});
 expect(correctIndividualAmendment(original,485).schedule.spanishDifferentialEligible).toBe(true);
 expect(correctSpanishLanguages('English, Spanish (limited), French',false)).toEqual(['English','French']);
 const profile={gender:'Female',languages:['English','Spanish'],languageProficiencies:[{language:'English',proficiency:'native',canConductSessions:true},{language:'Spanish',proficiency:'fluent',canConductSessions:true}]};
 expect(correctSpanishProfile(profile,false)).toEqual({...profile,languages:['English'],languageProficiencies:[profile.languageProficiencies[0]]});
 expect(correctSpanishProfile({languages:['English']},true).languages).toEqual(['English','Spanish']);
});
it('preserves Mariela’s existing written stipend without inventing an amount or replacing individual terms',()=>{
 const data=correctIndividualAmendment({employee:{name:'Mariela Duran'},schedule:{category:2,level:2},additionalTerms:'Existing duty.'},494);
 expect(data.additionalTerms).toBe('Existing duty.\n\n'+MARIELA_TRAVEL_STIPEND);expect(correctIndividualAmendment(data,494)).toEqual(data);
 const html=renderAmendment(data);expect(html).toContain('previously agreed travel stipend will continue');expect(html.indexOf('Continuation of existing travel stipend')).toBeLessThan(html.indexOf('13. Employee acknowledgment'));
});
