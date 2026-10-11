// Apply the owner's October 10 role clarification consistently to supplied
// handbook and provider-guide starting points. Published editions remain stored
// snapshots and only change through the existing review/publication workflow.
export const FACILITATOR_SCOPE_SLUG = 'bachelors-level-facilitator-scope-and-h0004';
export const facilitatorPolicyHtml = `<p>Bachelor’s-level staff assigned to this clinical support role use the title <strong>facilitator</strong>, not counselor or therapist. Work must remain within the person’s education, relevant training, skills and demonstrated competence. This pathway supports approved low-acuity care, early recognition of concerns and appropriate referral; it does not confer independent psychotherapy authority.</p>
<p>All facilitator clinical work requires oversight by an appropriately qualified, fully licensed provider with at least two years in the field. Verify all applicable licensing-board, Medicaid rendering-oversight and payer requirements as well; the agency experience minimum alone does not establish supervisor eligibility. Follow any stricter requirements.</p>
<p>Facilitators do not independently establish, select or change a primary diagnosis. They must not begin diagnosis-targeted treatment activities without the express, documented approval of the appropriately qualified licensed clinician responsible for the case. That clinician determines the plan, the permitted activities and oversight after verifying the facilitator’s competence. Approval cannot expand lawful scope, payer eligibility or demonstrated competence. An existing diagnosis is neither automatic permission to treat it nor an automatic exclusion from all approved support.</p>
<p>H0004 is a service code, not a license or blanket coverage authorization. Clinical and billing staff must verify the actual service, assessment, plan, medical necessity, consent, provider qualifications, payer/RAE rules, authorizations, setting, modality, actual time and required documentation. Do not include tutoring or other nonclinical time in a counseling claim. Record actual work in the app under the current compensation policy even when a clinical claim cannot be submitted.</p>
<p>Reading a guide, completing a knowledge check or receiving a completion record does not authorize a technique, certify competence or confer a professional title. If the need exceeds the approved role, stop the unsupported activity and arrange qualified review. Emergency action and legally required reporting must not wait for routine approval.</p>
<p><a href="/library?companyDocument=counseling-guide#counseling-guide-facilitator-scope">Care Approaches &amp; Practice Guide → Facilitator scope, titles and express approval</a></p>
<p><a href="/library?companyDocument=counseling-guide#counseling-guide-licensed-oversight">Care Guide → Licensed oversight and the two-year agency minimum</a> · <a href="/library?companyDocument=counseling-guide#counseling-guide-h0004-service">Care Guide → H0004 service and billing boundaries</a></p>`;

export function applyFacilitatorHandbookScope(source, tenant) {
  const related = [];
  for (const section of source.sections) {
    const previous = section.bodyHtml;
    section.bodyHtml = section.bodyHtml?.replaceAll('Bachelor’s-Level Mental Health Counselors', 'Bachelor’s-Level Mental Health Facilitators');
    if (['section-a-clinical-support-providers-tier-1', 'typical-duties-mental-health-facilitator'].includes(section.slug)) {
      section.bodyHtml = `<p><strong>Bachelor’s-level facilitator requirements:</strong> the role-specific title, competence, express approval and licensed-oversight requirements in <a href="#handbook-${FACILITATOR_SCOPE_SLUG}">Facilitator scope and H0004</a> apply to every clinical assignment described here. A listed duty does not expand these limits.</p>` + section.bodyHtml;
    }
    if (section.bodyHtml !== previous) related.push(section.slug);
  }
  if (!source.sections.some(s => s.slug === FACILITATOR_SCOPE_SLUG)) {
    const parentSlug = source.sections.some(s => s.slug === 'role-based-practice-expectations') ? 'role-based-practice-expectations' : null;
    const index = source.sections.findIndex(s => s.slug === 'section-a-clinical-support-providers-tier-1');
    source.sections.splice(index < 0 ? source.sections.length : index + 1, 0, { slug: FACILITATOR_SCOPE_SLUG, parentSlug, title: 'Bachelor’s-level facilitators · Scope, oversight and H0004', sourcePage: null, status: 'ready', bodyHtml: facilitatorPolicyHtml });
  }
  return { id: `${tenant}-source-care-scope-2026-10-10`, status: 'draft', subject: 'Bachelor’s-level facilitator scope, titles and H0004 oversight', rationale: 'Owner clarification: facilitators must stay within demonstrated competence, with express approval for diagnosis-targeted work and qualified licensed oversight. Guide completion is orientation only.', changed_content: facilitatorPolicyHtml,
    handbook_section_slug: FACILITATOR_SCOPE_SLUG, policy_section_slugs: [FACILITATOR_SCOPE_SLUG], related_section_slugs: related, link_origin: 'source_review' };
}

export function applyFacilitatorProviderReference(source) {
  // Company-owned reference; generic templates retain their company-setup gate.
  source.sections.push({ slug: 'facilitator-scope-reference', title: 'Bachelor’s-level facilitators · Scope and care orientation', parent_slug: null, source_page: null, content_status: 'ready', sort_order: source.sections.length,
    body_html: `<p>Bachelor’s-level clinical support staff use the facilitator title. They remain within their education, training and demonstrated competence under qualified fully licensed oversight with at least two years in the field, plus any stricter applicable requirements. Diagnosis-targeted activities require express documented approval; approval cannot expand lawful scope or competence.</p><p>The <a href="/workplace-handbook#handbook-${FACILITATOR_SCOPE_SLUG}">Workplace Handbook → Bachelor’s-level facilitators · Scope, oversight and H0004</a> contains the agency policy. The <a href="/library?companyDocument=counseling-guide#counseling-guide-care-orientation">Care Approaches &amp; Practice Guide</a> introduces approaches and basic helping skills. Reading or completing its knowledge check does not authorize clinical practice.</p>` });
}
