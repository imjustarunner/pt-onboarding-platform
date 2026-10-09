import {it,expect} from 'vitest';
import {renamePayRateLabels,PAY_RATE_SCOPE} from '../payRateLabels.js';
import {renderAmendment,handbookSections} from '../itscoOctober2026Drafts.js';
import {codeReferenceSection} from '../compensationHandbookClarifications.js';
it('renames saved labels idempotently without changing codes, amounts or custom edits',()=>{
 const original='<h2>H-code direct-service pay</h2><p>H0004: $32.00; owner note.</p><h2>Clinical service-credit pay</h2>';
 const changed=renamePayRateLabels(original);expect(changed).toContain('<h2>Direct Care Rate</h2>');expect(changed).toContain('<h2>Clinical Session Rate</h2>');expect(changed).toContain('H0004: $32.00; owner note.');expect(renamePayRateLabels(changed)).toBe(changed);
});
it('groups approved 9-series and H-codes under their new labels without assigning unrelated codes',()=>{
 const rules=[{service_code:'90837',category:'direct',credit_value:1},{service_code:'H0004',category:'direct',credit_value:.25,pay_divisor:4},{service_code:'OTHER',category:'direct',credit_value:1},{service_code:'99414',category:'indirect',credit_value:1}];
 const html=codeReferenceSection(rules).bodyHtml;
 const clinical=html.split('<h2>Clinical Session Rate')[1].split('<h2>Direct Care Rate')[0],direct=html.split('<h2>Direct Care Rate')[1];
 expect(clinical).toContain('<th>90837</th>');expect(clinical).not.toContain('<th>H0004</th>');expect(direct).toContain('<th>H0004</th>');expect(direct).not.toContain('<th>90837</th>');
 expect(html).toContain(PAY_RATE_SCOPE);expect(html).not.toMatch(/<th>(OTHER|99414)<\/th>/);
 const appendix=handbookSections({rules}).find(s=>s.slug==='colorado-billing-compensation-appendix').bodyHtml;expect(appendix).not.toContain('<td>OTHER</td>');expect(appendix).not.toContain('<td>99414</td>');
});
it('shows both new rates in the personal amendment while preserving values and personal scope',()=>{
 const data={employee:{name:'Example'},schedule:{category:2,level:2,creditRate:44,hcodeRate:32,ptoRate:44,probationWaived:true},commonClausesHtml:'<h3>2. Individual rates</h3><p>Clinical service-credit pay; H-code direct rate. Custom term.</p>'};
 const html=renderAmendment(data);expect(html).toContain('Clinical Session Rate');expect(html).toContain('Direct Care Rate');expect(html).toContain('$44.00');expect(html).toContain('$32.00');expect(html).toContain('Custom term.');expect(html).not.toContain('Clinical service-credit pay');expect(html).not.toContain('H-code direct rate');
});
