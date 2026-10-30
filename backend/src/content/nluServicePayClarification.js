// Keep the staff reference edition aligned with the approved NLU draft clarification.
// This presentation change does not publish drafts, issue amendments or enable payroll.
export const NLU_SERVICE_PAY_COMPARISON_HTML = "<!-- nlu-service-pay-type-indirect-clarification --><h3>Service pay type and automatic indirect time</h3><p><strong>Employee compensation category and service pay type are different.</strong> Your assigned Category 1, 2 or 3 and level determine your applicable rate schedule. The service you actually provide determines which pay row applies. H2014 remains an H-code program service even when the provider is in Category 2 or 3.</p>\n<table><thead><tr><th>Approved service</th><th>Pay type and compensation basis</th><th>Automatic indirect allowance</th></tr></thead><tbody>\n<tr><td>H2014 within NLU’s authorized Therapy + Tutoring program</td><td>Therapy + Tutoring · H2014 program rate, using approved 15-minute units. Use the employee’s applicable program rate; this is distinct from the general Direct Care base and from Clinical Session service credits.</td><td>10 paid minutes per direct-hour equivalent for Categories 1, 2 and 3. One unit adds 2.5 minutes; four units add 10 minutes.</td></tr>\n<tr><td>H0004 and other approved services mapped to general Direct Care</td><td>Direct Care hourly/unit rate, using the approved code-specific conversion.</td><td>10 paid minutes per direct-hour equivalent for Categories 1, 2 and 3, prorated to the approved quantity.</td></tr>\n<tr><td>Approved Clinical Session/9-series services, including 90832, 90834 and 90837</td><td>Clinical Session Rate × approved clinical credits: 0.50, 0.75 and 1.00 respectively for these examples.</td><td>No separate automatic 10-minute Direct Care allowance. Routine administrative work is included in the clinical service-credit compensation; additional actual compensable work is reconciled under the applicable policy.</td></tr>\n<tr><td>Academic Tutoring</td><td>Separate Tutoring program rate and documented academic-service units.</td><td>10 paid minutes per direct-hour equivalent under the Tutoring program schedule.</td></tr>\n<tr><td>Academic Homework Help</td><td>Separate Homework Help program rate.</td><td>No automatic allowance under the current Homework Help schedule; report actual eligible indirect or support work.</td></tr>\n<tr><td>99414 and 99416 when mapped to supervision/indirect work</td><td>Recorded indirect/supervision time at the applicable rate, not Clinical Session credits.</td><td>Pay the eligible actual time; the Direct Care automatic allowance is not added to these indirect-time entries.</td></tr>\n</tbody></table><p>H2014 therefore receives its program base pay plus automatic indirect pay; approved Clinical Session codes use their clinical-credit compensation. Service authorization, provider qualifications and the dated mapping still control. Other add-ons and restricted codes follow their own approved rows. A “9” prefix alone does not identify clinical-session compensation. Preserve any greater agreed allowance, pay eligible actual indirect work above the applicable allowance, and count each service and allowance once.</p>";
export const NLU_H2014_CLARIFICATION_HTML = "<!-- nlu-service-pay-type-indirect-clarification --><h3>H2014 and Clinical Session services use different pay rows</h3><p><strong>H2014 is the Therapy + Tutoring H-code program pay type.</strong> It uses its applicable program hourly/unit base rate plus <strong>10 automatic paid indirect minutes per direct-hour equivalent</strong> for Categories 1, 2 and 3. Four approved 15-minute H2014 units add 10 indirect minutes; one unit adds 2.5. It does not use Clinical Session/9-series service credits.</p><p>Approved clinical codes such as 90832, 90834 and 90837 use the Clinical Session Rate and do not receive a separate automatic 10-minute Direct Care allowance. Employee Category 1, 2 or 3 selects the employee’s rate schedule; the service code and approved mapping select the pay type. See <a href=\"#handbook-service-code-compensation-and-authorizations\">Service codes: Clinical Session Rate and Direct Care Rate</a> for the comparison and code-specific exceptions.</p>";
const MARKER = '<!-- nlu-service-pay-type-indirect-clarification -->';
const PROGRAM_SLUG = 'nlu-tutoring-and-h2014-compensation';

export function applyNluServicePayClarification(source, tenant) {
  if (tenant !== 'nlu') return source;
  const additions = new Map([
    ['service-code-compensation-and-authorizations', NLU_SERVICE_PAY_COMPARISON_HTML],
    ['colorado-billing-compensation-appendix', NLU_H2014_CLARIFICATION_HTML],
    [PROGRAM_SLUG, NLU_H2014_CLARIFICATION_HTML]
  ]);
  for (const section of source.sections) {
    const addition = additions.get(section.slug);
    if (!addition || String(section.bodyHtml || '').includes(MARKER)) continue;
    // Put the current classification first; retain dated authorizations and
    // greater prior allowances in the reference text below it.
    const terminology = '<p>In earlier reference wording below, “Clinical Hour Rate” means Clinical Session Rate and “Standard Professional Rate” means the general Direct Care Rate. H2014 uses its separate approved program rate. The ten-minute schedule applies where adopted; preserve any greater agreed allowance and the applicable service-date schedule.</p>';
    section.bodyHtml = addition + terminology + (section.bodyHtml || '');
    section.status = 'ready';
  }
  if (!source.sections.some(section => section.slug === PROGRAM_SLUG)) {
    source.sections.push({
      slug: PROGRAM_SLUG,
      title: 'NLU Tutoring and H2014 compensation',
      parentSlug: null,
      sourcePage: null,
      status: 'ready',
      bodyHtml: NLU_H2014_CLARIFICATION_HTML
    });
  }
  return source;
}
