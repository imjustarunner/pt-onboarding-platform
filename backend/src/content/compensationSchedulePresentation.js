const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const amount = value => value != null && Number(value) > 0 ? `$${Number(value).toFixed(2)}` : '[confirm rate]';
import {conditionalLevelBonus} from '../utils/serviceCreditPolicy.js';
export {conditionalLevelBonus};
export const categoryDescriptions = {
  1: 'Unlicensed staff. The H-code row applies to eligible bachelor’s-level services. The clinical service-credit row applies only to authorized intern/unlicensed master’s-level services. Scope and supervision requirements still apply. Submit actual indirect time separately; no indirect time is added automatically.',
  2: 'Pre-licensed master’s-level staff. Approved psychotherapy/9-series and other designated master’s-level services use clinical service-credit pay. Approved H-code services use the separate H-code direct-service rate plus 10 minutes of indirect pay per direct-hour equivalent.',
  3: 'Fully licensed professionals. Approved psychotherapy/9-series and other designated master’s-level services use clinical service-credit pay. Approved H-code services use the separate H-code direct-service rate plus 10 minutes of indirect pay per direct-hour equivalent.'
};
export const payTypeDescriptions = `<dl>
<dt><strong>Clinical service-credit pay</strong></dt><dd>The assigned credit value multiplied by your clinical rate. This covers approved 9-series clinical codes and designated master’s-level services in the appendix; it does not authorize every code beginning with 9. A 1.00-credit service pays the full rate and a 0.75-credit service pays 75%. Routine administrative work is included in this service pay. The 1.20 equivalent affects sick-leave accrual, not additional cash pay.</dd>
<dt><strong>H-code direct-service pay</strong></dt><dd>The approved direct-hour equivalent multiplied by your H-code rate. Code-specific units determine the equivalent. Categories 2 and 3 also receive 10 minutes (10/60 hour) of indirect pay per direct-hour equivalent. Category 1 records actual indirect work separately.</dd>
<dt><strong>Indirect hourly pay</strong></dt><dd>Pay for eligible indirect work at the stated hourly rate. Category 1 submits actual time. Categories 2 and 3 receive the H-code allowance automatically and report additional compensable work without claiming the same work twice.</dd>
<dt><strong>Support activity pay</strong></dt><dd>The hourly rate for designated support activities, including required Provider Update review. Record actual compensable time.</dd>
<dt><strong>Probationary and minimum-workload rates</strong></dt><dd>Two distinct conditions that use the stated reduced rate: new-hire probation and the minimum-workload policy. Each has its own timing and exceptions, including the 60-day amendment transition for minimum workload. A slash in the prior chart separated H-code and clinical rates; it did not combine them into one payment.</dd>
<dt><strong>Levels and conditional bonuses</strong></dt><dd>A compensation level selects the base rate within the credential category; it is separate from a workload/benefit tier. The chart’s “+” amount is conditional, not guaranteed and not included in base pay. The addition applies only when the employee qualifies for Tier 3 based on sessions per pay period.</dd></dl>`;

export function personalRateTable(s) {
  const rows = [
    ['Clinical service-credit pay','per credit',s.creditRate,s.creditRateProbation],
    ['H-code direct-service pay','per direct-hour equivalent',s.hcodeRate,s.hcodeRateProbation],
    ['Indirect pay','per hour',s.indirectRate,s.indirectRateProbation ?? s.indirectRate],
    ['Support activities','per hour',s.supportRate,s.supportRateProbation ?? s.supportRate]
  ];
  return '<table class="compensation-rates"><thead><tr><th scope="col">Pay type / basis</th><th scope="col">Regular base rate</th><th scope="col">Probationary / minimum-workload rate</th></tr></thead><tbody>'+rows.map(([label,basis,regular,reduced])=>`<tr><th scope="row">${label}<br /><small>${basis}</small></th><td>${amount(regular)}</td><td>${amount(reduced)}</td></tr>`).join('')+'</tbody></table>';
}

export function categoryRateSchedule(rates, levels = []) {
  return '<h2>Category and level rate schedule</h2>'+payTypeDescriptions+[1,2,3].map(category=>{
    const rows = rates.filter(r=>Number(r.category)===category).sort((a,b)=>Number(a.level)-Number(b.level));
    return `<section class="compensation-category"><h2>Category ${category} · ${['','Unlicensed','Pre-licensed','Fully licensed'][category]}</h2><p>${categoryDescriptions[category]}</p>`+rows.map(r=>{
      const description=levels.find(l=>Number(l.category)===category&&Number(l.level)===Number(r.level))?.label;
      const bonus=conditionalLevelBonus(r.level);
      return `<h3>Level ${e(r.level)}</h3><p>${description?e(description):'This level uses the base rates below. Your individual amendment states your assigned level; advancement is not automatic.'}</p>`+personalRateTable({creditRate:r.credit_rate,creditRateProbation:r.credit_rate_probation,hcodeRate:r.hcode_rate,hcodeRateProbation:r.hcode_rate_probation,indirectRate:r.indirect_rate,supportRate:r.support_activity_rate})+(bonus?`<p><strong>Conditional addition in the level chart: +${amount(bonus)}</strong> to the applicable clinical service-credit rate${category===1?' or Category 1 H-code rate':''}, only when the employee qualifies for Tier 3 based on sessions per pay period. This is shown separately from the base rate; it is not an automatic increase${category!==1?' to the $32 H-code base rate':''}.</p>`:'')+
      (category===1?'<p>Indirect time: submit actual time worked.</p>':'<p>H-code allowance: 10 minutes per direct-hour equivalent, paid at this category’s indirect rate. It also applies when the H-code direct rate is probationary or minimum-workload.</p>');
    }).join('')+'</section>';
  }).join('');
}
