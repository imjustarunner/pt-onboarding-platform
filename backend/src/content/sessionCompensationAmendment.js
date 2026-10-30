import { CODE_INVENTORY_NOTICE, EXTENDED_PSYCHOTHERAPY_HTML, missedSessionFeeSectionForTenant, NLU_BETWEEN_SESSION_SECTION, SESSION_COMPENSATION_RATIONALE, NLU_BETWEEN_SESSION_RATIONALE } from './sessionCompensationHandbook.js';
import { NLU_H2014_CODE_PERMISSION } from './nluH2014ProgramClarification.js';
import { AUTUMN_RELEASES } from './agencyHandbookAutumn2026.js';

const restricted = ['90853','H0025','H2014','H2015','H2016','H2017','H2018','H2032'];
function restriction(code, tenant) {
  if (code === 'H2014' && tenant === 'nlu') return NLU_H2014_CODE_PERMISSION;
  if (tenant === 'isi' && code.startsWith('H')) return 'Informational classification only; outside the current counseling service scope. Not approved for use.';
  if (['H0025','H2032'].includes(code)) return 'Informational classification only; not currently approved for agency use.';
  if (code === 'H2014') return 'Skill Builders only with express written approval; individual services remain unapproved.';
  return 'Group moratorium or written permission applies. Listing does not authorize service delivery or billing.';
}
function amendInventory(html, tenant) {
  return html.replace(/(<h[24]>Saved code inventory<\/h[24]>)([\s\S]*?)(<table>[\s\S]*?<\/table>)/, (_,heading,between,table) => {
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map(match => match[1]);
    const inventory = rows.map(row => {
      const code = row.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/)?.[1];
      return `<tr>${row}<td>${restricted.includes(code) ? restriction(code,tenant) : 'Use only for eligible services within approved scope and current payer rules.'}</td></tr>`;
    });
    const codes = rows.map(row => row.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/)?.[1]);
    for (const code of restricted.filter(code => !codes.includes(code))) inventory.push(`<tr><td>${code}</td><td>${code.startsWith('H') ? 'Direct Care Rate classification, if approved' : 'Clinical Session Rate classification, if approved'}</td><td>${code === 'H2014' && tenant === 'nlu' ? '0.25 direct-hour equivalent' : 'No active value implied'}</td><td>${code === 'H2014' && tenant === 'nlu' ? 'Per approved 15-minute unit' : 'Approved code-specific mapping required'}</td><td>${restriction(code,tenant)}</td></tr>`);
    const extended = '<tr><td>90834 × 2</td><td>Clinical Session Rate · eligible extended encounter</td><td>1.50 total clinical credits (0.75 per approved unit)</td><td>Two approved units</td><td>Current payer and service-date rules apply; do not combine with 90785.</td></tr>';
    const at = inventory.findIndex(row => row.startsWith('<tr><td>90834</td>'));
    inventory.splice(at < 0 ? inventory.length : at+1,0,extended);
    return `${heading}${CODE_INVENTORY_NOTICE}<table><thead><tr><th>Code</th><th>Pay classification</th><th>Employee compensation quantity</th><th>Quantity basis</th><th>Permission and limits</th></tr></thead><tbody>${inventory.join('')}</tbody></table>`;
  });
}

export function applySessionCompensationAmendment(source, tenant) {
  const put = section => {
    const existing = source.sections.find(s => s.slug === section.slug);
    if (existing) Object.assign(existing,{bodyHtml:section.bodyHtml,title:section.title,status:'ready'});
    else source.sections.push({...section,status:'ready',parentSlug:null,sourcePage:null});
  };
  const missedFeeSection = missedSessionFeeSectionForTenant(tenant);
  put(missedFeeSection);
  if (tenant === 'nlu') put(NLU_BETWEEN_SESSION_SECTION);
  const feeLink = '<a href="#handbook-missed-session-fee-compensation">Collected missed-session fees and employee compensation</a>';
  for (const section of source.sections) {
    section.bodyHtml = String(section.bodyHtml || '')
      .replace(/<p>A discretionary missed-appointment benefit[\s\S]*?<\/p>/, `<p>An eligible collected no-show or late-cancellation fee earns the employee’s applicable category percentage under ${feeLink}, beginning on the communicated prospective effective date. This fee share does not create clinical credits or hours and is separate from wages for actual work and required waiting. Previously earned amounts and signed terms remain protected.</p>`)
      .replace('Collection status may affect a separately agreed discretionary missed-appointment benefit, but it does not cancel wages earned for work actually performed.', 'The category fee share is calculated when an eligible fee is actually collected; collection status does not cancel wages earned for work actually performed.')
      .replace('Under no circumstances will clients with Medicaid be charged no-show or late cancellation fees. Do not create a missed-appointment charge for a Medicaid client in the app.', 'Do not charge no-show or late-cancellation fees to Medicaid-only members. A potential exception involving Medicare or commercial primary coverage requires documented billing review under the applicable coverage and advance-notice requirements; staff must not assume an exception applies.')
      .replace('Denial of discretionary payments (e.g., missed session bonus), and/or', 'Review of unearned discretionary benefits where permitted; earned fee shares and wages are not forfeited for late documentation, and/or')
      .replace('Some benefits scale by percentage (e.g., insurance contributions, missed session pay, mileage reimbursement).', `Some benefits scale by percentage, such as insurance contributions or mileage reimbursement. Collected missed-session fee shares follow the employee’s compensation category under ${feeLink}; they do not vary by workload/benefit tier.`);
    if (section.slug === 'colorado-billing-compensation-appendix') section.bodyHtml = amendInventory(section.bodyHtml,tenant) + EXTENDED_PSYCHOTHERAPY_HTML;
    if (section.slug === 'service-code-compensation-and-authorizations') section.bodyHtml = CODE_INVENTORY_NOTICE + section.bodyHtml + EXTENDED_PSYCHOTHERAPY_HTML;
    if (tenant === 'nlu' && section.slug === 'client-policies-and-attendance') section.bodyHtml = section.bodyHtml
      .replace('The standard no-show fee is $100 for an eligible non-Medicaid client when applicable under the client’s agreement.', 'Use the no-show fee permitted by the client’s applicable signed agreement and approved billing policy.')
      .replace('The standard late-cancellation fee is $80 for an eligible non-Medicaid client who cancels less than 24 hours before the appointment, subject to the client’s agreement.', 'Use the applicable signed agreement’s late-cancellation notice window and fee, subject to billing eligibility review.')
      .replace("These fees are standard but may be adjusted at the clinician's discretion.", 'Honor existing package exemptions and client fee terms until validly changed prospectively. An example in the employee compensation policy does not itself authorize a new client charge.');
    if (tenant === 'nlu' && ['actual-work-time-support-and-corrections','client-policies-and-attendance'].includes(section.slug)) section.bodyHtml += '<p>For no-show openings and time between appointments, follow <a href="#handbook-nlu-between-session-work-and-release">NLU · No-shows, between-session work and release from duty</a>. Record actual duties, required waiting and any explicit release separately.</p>';
    if (tenant === 'nlu' && section.slug === 'meal-and-break-periods') section.bodyHtml = '<p>For nonexempt employees covered by Colorado COMPS, a work period over five consecutive hours includes an uninterrupted meal period of at least 30 minutes. It is unpaid only when the employee is fully relieved of all duties and can pursue personal activities. When the work prevents an uninterrupted meal, allow the employee to eat while on paid duty. As practical, schedule the meal at least one hour after starting and one hour before ending work.</p><p>Provide a paid, duty-free 10-minute rest period for each four hours worked or major fraction: none required for two hours or less; one for more than two through six hours; two for more than six through ten hours; three for more than ten through fourteen hours, and additional periods as required. Rest periods count as hours worked. Place them near the middle of the work period as practical.</p><p>An appointment gap substitutes for a meal or rest period only if it actually meets the applicable duty-free requirements; a missed appointment does not automatically create unpaid break time. Follow <a href="#handbook-nlu-between-session-work-and-release">between-session work and release from duty</a>. Applicable law and any more protective requirement control.</p>';
  }
  const release = AUTUMN_RELEASES[tenant];
  const entry = (section,rationale,related=[]) => ({id:`${tenant}-source-session-policy-${section.slug}`,status:'draft',period_label:release.period,digest_title:`${release.period} Workplace Handbook Updates`,subject:section.title,rationale,changed_content:section.bodyHtml,handbook_section_slug:section.slug,policy_section_slugs:[section.slug,...related],related_section_slugs:[],link_origin:'source_review'});
  const updates = [entry(missedFeeSection,SESSION_COMPENSATION_RATIONALE)];
  const inventory = source.sections.find(s=>s.slug==='colorado-billing-compensation-appendix');
  if (tenant === 'itsco') updates.push(entry({...inventory,title:'Code inventory permissions and extended 90834 encounters'},'Distinguish informational compensation classifications from permission to deliver or bill services, and include the eligible two-unit 90834 extended encounter with payer-specific safeguards.'));
  if(tenant==='nlu')updates.push(entry(NLU_BETWEEN_SESSION_SECTION,NLU_BETWEEN_SESSION_RATIONALE,['meal-and-break-periods']));
  return updates;
}
