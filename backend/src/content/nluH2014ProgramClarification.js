const programLink = '<a href="#handbook-therapy-plus-tutoring-program">Therapy + Tutoring program</a>';
const codesLink = '<a href="#handbook-service-code-compensation-and-authorizations">Service-code permissions and restrictions</a>';

export const NLU_H2014_RATIONALE = 'Authorize eligible individual H2014 services within Therapy + Tutoring at the employee’s assigned category and rate, encourage small groups through a separate attendance-based supplement, and preserve payer eligibility, accurate service records and the moratorium on other group codes.';
export const NLU_H2014_CODE_PERMISSION = `Allowed within the ${programLink} for eligible individual or small-group skills services at the employee’s applicable category and rate. Small groups are encouraged. Group compensation adds $5 per attendee who actually participates, with the session base counted once. Current provider, setting, authorization, documentation and payer requirements apply.`;
export const NLU_H2014_SECTION_SLUGS = [
  'therapy-plus-tutoring-program', 'therapy-plus-tutoring-groups',
  'group-services-moratorium-and-exceptions', 'service-code-compensation-and-authorizations',
  'direct-behavioral-health-services-hcpcs', 'colorado-billing-compensation-appendix',
  'nlu-tutoring-and-h2014-compensation'
];

// The owner-approved exception applies to NLU's existing skills-group program.
// Keep the supplied source archives and the other agencies' policies intact.
export function applyNluH2014ProgramClarification(source, tenant) {
  if (tenant !== 'nlu') return source;
  const bySlug = new Map(source.sections.map(section => [section.slug, section]));
  for (const slug of NLU_H2014_SECTION_SLUGS) if (!bySlug.has(slug)) throw Error(`Missing NLU H2014 policy: ${slug}`);
  const append = (slug, html) => {
    const section = bySlug.get(slug);
    if (!section.bodyHtml.includes(html)) section.bodyHtml += html;
  };
  for (const section of source.sections) section.bodyHtml = String(section.bodyHtml || '')
    .replace(/Individual skills services are not offered through insurance; separately agreed self-pay may be available\./g, 'Eligible individual H2014 skills services are permitted within Therapy + Tutoring, subject to current provider, setting, authorization, documentation and payer requirements. Academic tutoring remains separate.')
    .replace(/Individual skills services are not (?:offered|currently provided) through insurance\./g, 'Eligible individual H2014 skills services are permitted within Therapy + Tutoring, subject to current provider, setting, authorization, documentation and payer requirements.')
    .replace('schedule three or more clients, proceed with at least two attending, and reschedule or offer separately agreed self-pay if only one attends.', 'aim to schedule three or more clients where appropriate, record two or more actual participants as a group, and deliver an eligible individual H2014 service if only one attends and the applicable requirements are met.');
  append('therapy-plus-tutoring-program', `<p><strong>H2014 is permitted within this program for eligible individual and small-group skills services.</strong> Individual services use the employee’s applicable compensation category and H2014 rate. Small groups are encouraged and receive the attendance-based supplement in <a href="#handbook-nlu-tutoring-and-h2014-compensation">Tutoring and H2014 compensation</a>. The H2014 program exception does not lift the moratorium on other group codes. See ${codesLink}.</p>`);
  bySlug.get('therapy-plus-tutoring-groups').bodyHtml = `<p>Small groups are encouraged when appropriate for the clients’ needs. Aim to schedule at least three clients; at least two actual participants are needed to record the visit as a group. Document each participant’s actual attendance, service, response and progress toward their own goals.</p><p>If one client attends, an eligible individual H2014 skills session may proceed at the employee’s applicable category and rate. Verify the actual individual service, current provider and setting eligibility, authorization and payer requirements; do not bill an absent participant or report a one-person visit as a group. Academic tutoring remains separate from H2014. See ${codesLink}.</p><p>A completed group with two or more actual participants adds <strong>$5 per attendee</strong> to the employee’s session compensation. Count the base service compensation once, and count only people who actually participated. An individual session has no group supplement. See <a href="#handbook-nlu-tutoring-and-h2014-compensation">Tutoring and H2014 compensation</a> for payroll review.</p>`;
  bySlug.get('group-services-moratorium-and-exceptions').bodyHtml = `<p>NLU’s authorized H2014 pathway is the ${programLink}. Eligible individual skills sessions and small-group skills sessions are permitted within that program, subject to current provider, setting, authorization, documentation and payer requirements.</p><p>Small groups are encouraged. Aim to schedule three or more clients where appropriate; record a group only when at least two actually participate. If one attends, an eligible individual H2014 session may proceed at the employee’s applicable category and rate. Do not bill absent participants, relabel academic tutoring as H2014 or assume program enrollment establishes insurance coverage.</p><p>The H2014 program exception does not lift the moratorium on other group codes. Other group services require express written leadership approval before use. H2015, H2016, H2017 and H2018 require express written permission for any use; H0025 and H2032 remain unapproved. See ${codesLink} and <a href="#handbook-nlu-tutoring-and-h2014-compensation">Tutoring and H2014 compensation</a>.</p>`;
  append('nlu-tutoring-and-h2014-compensation', `<h2>Individual H2014 and small-group supplement</h2><p>H2014 is permitted for eligible individual and small-group skills services within the ${programLink}. Use the employee’s applicable compensation category, level, approved H2014 rate and service-date terms for the actual eligible service. The Category 1 rate and indirect allowance described above remain applicable; other categories retain their configured rates and allowances.</p><p>For a completed small group with at least two actual participants, add <strong>$5 for each attendee who actually participates</strong> once per group session, in addition to the base service compensation counted once for that session. Three actual attendees add $15; two add $10. An individual session receives its applicable base compensation without a group supplement. Do not multiply the session’s base by the number of client records, count absent participants or repeat the $5 supplement for each time unit.</p><p>Record actual attendance and service time for payroll review. Submit the group addition through the approved payroll supplement process with attendance evidence; a scheduled participant list is not proof of attendance. Required work and any applicable indirect allowance remain separately reconciled without duplication. Group supplements begin prospectively on the communicated effective date after required notice or agreement.</p>`);
  for (const slug of ['service-code-compensation-and-authorizations', 'colorado-billing-compensation-appendix', 'direct-behavioral-health-services-hcpcs']) {
    const section = bySlug.get(slug);
    section.bodyHtml = section.bodyHtml
      .replace('Restricted and currently unapproved services', 'Service permissions, program exceptions and restrictions')
      .replace('Any service delivered or billed as a group, regardless of its code, is subject to the group moratorium and requires express written approval before use.', `H2014 is permitted for eligible individual and small-group skills services within the ${programLink}. Other group codes remain under the moratorium unless expressly approved in writing.`)
      .replace('H2014 requires written code-specific approval for eligible small-group skills services.', 'Individual and group H2014 use within the program remains subject to current provider, setting, authorization, documentation and payer requirements.')
      .replace(/(<tr><th>H2014<\/th><td>)[\s\S]*?(<\/td><\/tr>)/, `$1${NLU_H2014_CODE_PERMISSION}$2`);
    if (!section.bodyHtml.includes(NLU_H2014_CODE_PERMISSION)) throw Error(`Missing H2014 code row: ${slug}`);
  }
  return source;
}

export function applyNluH2014ReviewClarification(updates, tenant) {
  if (tenant !== 'nlu') return updates;
  return updates.map(update => NLU_H2014_SECTION_SLUGS.includes(update.handbook_section_slug)
    && !String(update.rationale).includes(NLU_H2014_RATIONALE)
    ? { ...update, rationale: `${update.rationale || ''} ${NLU_H2014_RATIONALE}`.trim() } : update);
}
