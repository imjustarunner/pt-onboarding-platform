import { applyScreenerReference } from './safetyPlans/guideReference.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handbookTenant } from './handbookTenant.js';
import { cleanHandbookHtml, validateHandbookSections } from './workplaceHandbookContent.js';
import { applyFacilitatorProviderReference } from './careGuideScope.js';

const sources = Object.fromEntries(['itsco', 'nlu', 'isi'].map(key => [key, JSON.parse(readFileSync(new URL(`../content/provider-guides/${key}.json`, import.meta.url), 'utf8'))]));
const schoolSource = JSON.parse(readFileSync(new URL('../content/school-practice-guides/itsco.json', import.meta.url), 'utf8'));
const careSource = JSON.parse(readFileSync(new URL('../content/care-guides/shared.json', import.meta.url), 'utf8'));
const skillsSources = Object.fromEntries(['itsco', 'nlu'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/skill-development-guides/${tenant}.json`, import.meta.url), 'utf8'))]));
const facilitiesSource = JSON.parse(readFileSync(new URL('../content/facilities-guides/shared.json', import.meta.url), 'utf8'));
const facilitiesLocations = Object.fromEntries(['itsco', 'nlu', 'isi'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/facilities-guides/${tenant}-locations.json`, import.meta.url), 'utf8'))]));
const crisisSource = JSON.parse(readFileSync(new URL('../content/crisis-guides/shared.json', import.meta.url), 'utf8'));
const crisisContexts = Object.fromEntries(['itsco', 'nlu', 'isi'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/crisis-guides/${tenant}-context.json`, import.meta.url), 'utf8'))]));
const facilitatorSource = JSON.parse(readFileSync(new URL('../content/facilitator-protocols/shared.json', import.meta.url), 'utf8'));
const facilitatorContexts = Object.fromEntries(['itsco', 'nlu', 'isi'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/facilitator-protocols/${tenant}-context.json`, import.meta.url), 'utf8'))]));
const documentationSource = JSON.parse(readFileSync(new URL('../content/documentation-standards/shared.json', import.meta.url), 'utf8'));
const documentationContexts = Object.fromEntries(['itsco', 'nlu', 'isi'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/documentation-standards/${tenant}-context.json`, import.meta.url), 'utf8'))]));
const caseloadSource = JSON.parse(readFileSync(new URL('../content/caseload-management/shared.json', import.meta.url), 'utf8'));
const groupTherapySource = JSON.parse(readFileSync(new URL('../content/group-therapy-sop/shared.json', import.meta.url), 'utf8'));
const reportingSource = JSON.parse(readFileSync(new URL('../content/mandated-reporting/shared.json', import.meta.url), 'utf8'));
const reportingContexts = Object.fromEntries(['itsco', 'nlu', 'isi'].map(tenant => [tenant, JSON.parse(readFileSync(new URL(`../content/mandated-reporting/${tenant}-context.json`, import.meta.url), 'utf8'))]));
const schoolReporting = JSON.parse(readFileSync(new URL('../content/mandated-reporting/itsco-school.json', import.meta.url), 'utf8'));
const noteAidSource = JSON.parse(readFileSync(new URL('../content/clinical-note-aid/shared.json', import.meta.url), 'utf8'));
const nluPilotGuide = JSON.parse(readFileSync(new URL('../content/nlu-learning-pilot/guide.json', import.meta.url), 'utf8'));
export const referenceCatalog = [
  { key: 'nlu-learning-pilot-guide', title: 'NLU Learning & Emotional Functioning Pilot', description: 'Reference only · Ages 8–17 · Student and caregiver profiles, separate academic observations and the validation plan.', minimumTier: 'basic', tenants: ['nlu'] },
  { key: 'clinical-note-aid-guide', title: 'Clinical Note Aid & Care Continuity Guide', description: 'Reference only · Michael Mendez’s method for connecting intake, goals, session notes, progress and continuity of care.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'provider-guide', title: 'Provider’s Guide', description: 'Clinical practice, documentation, attendance and role-specific guidance for mental health providers.', minimumTier: 'basic' },
  { key: 'school-practice-guide', title: 'School Practice Guide', description: 'ITSCO only · School assignments, intake, caseload management and essential protocols.', minimumTier: 'basic', tenants: ['itsco'] },
  { key: 'counseling-guide', title: 'Care Approaches & Practice Guide', description: 'An introduction to care approaches, foundational helping skills, facilitator scope and Colorado H0004 oversight.', minimumTier: 'basic' },
  { key: 'skill-development-guide', title: 'Skill Development & Learning Guide', description: 'Connection, emotional regulation, group practice and supervised skills development, with company-specific program rules.', minimumTier: 'basic', tenants: ['itsco', 'nlu'] },
  { key: 'facilities-guide', title: 'Operations & Facilities Guide', description: 'Shared office use, room scheduling, access, privacy and closing at 437 Windchime, with company-specific location guidance.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'crisis-response-guide', title: 'Crisis & Emergency Response Guide', description: 'Preparation, emergency response, Colorado reporting, safety planning, documentation and follow-up.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'facilitator-coding-protocol', title: 'Facilitator Coding & Documentation Protocol', description: 'Bachelor’s-level facilitator workflow: approved services, documentation, coding review and work-time records.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'service-documentation-standards', title: 'Service Documentation Standards', description: 'Practical note-writing standards, service-specific records, progress, examples and transparent corrections.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'group-psychotherapy-sop', title: 'Group Psychotherapy SOP · 90853', description: 'Reference only · Group planning, screening, consent, delivery, participant-specific documentation and billing review.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'caseload-management-sop', title: 'Caseload Management SOP', description: 'Reference only · Sustainable capacity, scheduling, outreach, documentation, engagement and continuity of care.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] },
  { key: 'mandated-reporting-sop', title: 'Mandated Reporting SOP', description: 'Recognize concerns, report promptly, protect privacy and document the response. Required onboarding for staff.', minimumTier: 'basic', tenants: ['itsco', 'nlu', 'isi'] }
];
export const referenceAllowed = (agency, key) => {
  const entry = referenceCatalog.find(d => d.key === key);
  return !!entry && (!entry.tenants || entry.tenants.includes(handbookTenant(agency)));
};
export const referenceCatalogFor = agency => referenceCatalog.filter(d => referenceAllowed(agency, d.key));
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function referenceSource(agency, key, { packageAssigned = false } = {}) {
  if (!referenceAllowed(agency, key)) return null;
  if (key === 'school-practice-guide') {
    const source = structuredClone(schoolSource);
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  const tenant = handbookTenant(agency);
  if (!tenant && !packageAssigned) return null;
  if (key === 'mandated-reporting-sop') {
    const source = structuredClone(reportingSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'follow-up-and-support': 'aspens' };
    source.sections.find(s => s.slug === 'company-reporting-context').body_html = reportingContexts[tenant].body_html;
    if (tenant === 'itsco') source.sections.push(structuredClone(schoolReporting));
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'nlu-learning-pilot-guide') {
    const source = structuredClone(nluPilotGuide);
    source.presentation = structuredClone(sources.nlu.presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = {};
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'clinical-note-aid-guide') {
    const source = structuredClone(noteAidSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'purpose-and-method': 'bear-lake', 'transition-and-termination': 'aspens' };
    const context = {
      itsco: '<p>Apply the method to approved school and office care. Distinguish school observations from caregiver and client reports. Use the School Practice Guide for school-specific procedures. This guide does not change service approvals or the group-service moratorium.</p>',
      nlu: '<p>Next Level Up provides office counseling and tutoring. Record actual clinical services separately from tutoring, with distinct purposes and nonoverlapping time. Academic progress is not itself proof of clinical improvement. This guide does not create school-based services, a Skill Builders program or automatic blended billing.</p>',
      isi: '<p>Inner Strength Institute is counseling-only. Apply this method to approved counseling care and supervision; this edition does not establish tutoring or skills programs.</p>'
    };
    source.sections.find(s => s.slug === 'company-care-context').body_html = context[tenant];
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'caseload-management-sop') {
    const source = structuredClone(caseloadSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'purpose-and-priorities': 'bear-lake', 'engagement-and-retention': 'aspens' };
    const context = {
      itsco: '<p>ITSCO caseload planning includes approved school assignments and office services. Account for school access, travel, breaks and closures alongside the clinical plan. Coordinate scheduling with authorized school contacts without disclosing unnecessary clinical information. School calendar changes do not automatically terminate care.</p><p>Follow the <a href="/library?companyDocument=school-practice-guide">ITSCO School Practice Guide</a> for setting-specific procedures. ITSCO’s group-service moratorium remains in effect unless a specific written approval authorizes the group. Do not add group appointments to fill a caseload without that approval.</p>',
      nlu: '<p>Next Level Up provides counseling and tutoring. Keep clinical care, tutoring and approved small-group skill development distinct in scheduling, documentation and billing review. The client’s learning and care needs determine the plan; a productivity goal does not justify relabeling a service.</p><p>For approved small-group skills services, schedule three participants and proceed with at least two attending. With one attending, offer separately agreed self-pay or reschedule. Therapy Plus Tutoring requires the actual, separately identified services and nonoverlapping time; a combined booking does not automatically authorize insurance claims. These rules do not establish a Skill Builders program.</p>',
      isi: '<p>Inner Strength Institute is counseling-only. Plan caseload capacity around approved counseling services, documentation, coordination, supervision and continuity. This edition does not establish tutoring or skills-development programs.</p>'
    };
    source.sections.find(section => section.slug === 'company-caseload-context').body_html = context[tenant];
    source.sections = source.sections.map(section => ({ ...section, body_html: cleanHandbookHtml(section.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'group-psychotherapy-sop') {
    const source = structuredClone(groupTherapySource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'purpose-and-use': 'bear-lake', 'review-and-completion': 'aspens' };
    const context = {
      itsco: '<p>ITSCO’s group-service moratorium remains in effect unless a specific written approval authorizes the group. This resource does not lift that restriction. Confirm approval, an eligible clinical leader and approved setting before recruiting or scheduling.</p><p>For an explicitly approved school group, follow the School Practice Guide and complete the applicable school packet, group informed-consent addendum and group policies/services addendum in the app. School permission does not replace clinical consent. Office groups follow the office intake requirements.</p>',
      nlu: '<p>Next Level Up provides counseling and tutoring in approved settings, not school-based services. A psychotherapy group requires its own clinical and operational approval, qualified leader and billing review.</p><p>Therapy Plus Tutoring and NLU small-group skill development are separate services. Their three-scheduled/two-attending rules do not authorize 90853, and tutoring or skills practice must not be relabeled group psychotherapy. This SOP does not change that program or establish a Skill Builders program.</p>',
      isi: '<p>Inner Strength Institute is counseling-only. Any proposed psychotherapy group requires clinical and operational approval, an appropriately qualified leader and billing review. This resource does not create tutoring, Skill Builders or school-based services, and does not by itself authorize a group.</p>'
    };
    source.sections.find(s => s.slug === 'company-group-approval').body_html = context[tenant];
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'service-documentation-standards') {
    const source = structuredClone(documentationSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'purpose-and-use': 'bear-lake', 'note-writing-examples': 'aspens' };
    source.sections.find(s => s.slug === 'company-documentation-context').body_html = documentationContexts[tenant].body_html;
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'facilitator-coding-protocol') {
    const source = structuredClone(facilitatorSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'purpose-and-use': 'bear-lake', 'worked-examples': 'aspens' };
    source.sections.find(s => s.slug === 'company-service-boundaries').body_html = facilitatorContexts[tenant].body_html;
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'crisis-response-guide') {
    const source = structuredClone(crisisSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    // Keep response and reporting instructions free of decorative interruptions.
    source.presentation.sectionArtwork = { 'preparation-and-roles': 'bear-lake', 'staff-support': 'aspens' };
    source.sections.find(s => s.slug === 'company-response-context').body_html = crisisContexts[tenant].body_html;
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'facilities-guide') {
    const source = structuredClone(facilitiesSource);
    source.organization = sources[tenant].organization;
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'facilities-overview': 'bear-lake', 'locations-and-scope': 'pikes-peak', 'shared-offices': 'aspens', 'cleanliness-and-maintenance': 'bear-lake', 'windchime-opening-and-closing': 'aspens', 'denver-procedures': 'pikes-peak' };
    source.facilities = { primaryLocation: '437 Windchime', ...(tenant === 'itsco' ? { denverStatus: 'coming_soon', denverSectionSlug: 'denver-procedures' } : {}) };
    source.sections.find(s => s.slug === 'locations-and-scope').body_html = facilitiesLocations[tenant].body_html;
    if (tenant === 'itsco') source.sections.push({ slug: 'denver-procedures', title: 'ITSCO Denver · Office procedures coming soon', parent_slug: null, sort_order: source.sections.length, content_status: 'ready', source_page: null,
      body_html: '<p><strong>Coming soon: Denver office-specific procedures.</strong> ITSCO also uses a Denver office, but verified instructions for that site have not yet been added to this guide. This section is a notice, not an operating procedure or permission to enter.</p><p>Before using the Denver office, obtain current site-specific access, room use, alarm, emergency and closing instructions from authorized operations staff. Do not apply Windchime’s door, camera or closing instructions to Denver.</p><p>The procedure-development work covers the verified address and authorized spaces, entry and exit, restricted access instructions, room scheduling, visitors, equipment, camera/privacy arrangements if any, emergency contacts and routes, after-hours use, and an observed opening/closing check. Credentials must stay out of the general guide.</p><p>Until the verified procedures are published here, the guide’s Q&amp;A cannot answer Denver-specific operational questions.</p>' });
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'skill-development-guide') {
    const source = structuredClone(skillsSources[tenant]);
    source.presentation = structuredClone(sources[tenant].presentation);
    source.presentation.chapterDividers = [];
    source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'skills-orientation': 'pikes-peak', 'program-boundaries': 'bear-lake', 'skill-domains': 'aspens', rapport: 'bear-lake', 'practice-examples': 'aspens', 'learning-moments': 'pikes-peak', precepting: 'bear-lake', 'research-and-rationale': 'pikes-peak' };
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  if (key === 'counseling-guide') {
    const source = structuredClone(careSource);
    const name = tenant ? sources[tenant].organization : String(agency.name || 'Your company').replace(/<[^>]*>/g, '').trim().slice(0, 200) || 'Your company';
    source.organization = name;
    source.presentation = tenant ? structuredClone(sources[tenant].presentation) : { theme: 'company-foundations', brandLabel: name };
    source.presentation.chapterDividers = [];
    if (tenant) source.presentation.coverImageUrl = '/assets/handbooks/colorado-bear-lake.jpg';
    source.presentation.sectionArtwork = { 'care-orientation': 'pikes-peak', 'facilitator-pathway': 'bear-lake', connection: 'aspens', approaches: 'bear-lake', 'recognition-and-response': 'pikes-peak', 'planning-and-records': 'aspens', 'ethical-practice': 'bear-lake', 'learning-and-resources': 'pikes-peak' };
    const context = source.sections.find(s => s.slug === 'company-care-context');
    const settings = {
      itsco: 'ITSCO provides school-based mental health care and other approved clinical services. Staff assigned to schools also use the ITSCO-only School Practice Guide. This care guide does not replace school readiness, consent, safety or referral procedures.',
      nlu: 'Next Level Up provides counseling and tutoring in its approved settings; it does not provide school-based services. Tutoring is separate from clinical care. For Therapy Plus Tutoring, follow the approved program plan and record the actual clinical and self-pay tutoring portions separately. A combined booking does not make tutoring reimbursable counseling or authorize a facilitator beyond their scope.',
      isi: 'Inner Strength Institute provides counseling in its approved settings. Its edition is counseling-only and does not establish tutoring, a Skill Builders program or school-based services. Students and facilitators remain subject to the applicable agreements, scope and licensed oversight.'
    };
    if (tenant) context.body_html = `<p>${settings[tenant]}</p><p>Follow ${escape(name)}’s current Workplace Handbook and Provider’s Guide. Student training agreements remain applicable; this orientation does not replace them.</p>`;
    else {
      source.requiredSections = [{ slug: context.slug, title: context.title, prompt: 'Define this company’s services, populations, jurisdictions, roles and supervision. Confirm whether the Colorado facilitator/H0004 pathway applies, or remove/adapt that material before publishing. Verify consent, emergency and reporting requirements for the actual settings.' }];
      context.body_html = ''; context.content_status = 'pending';
    }
    source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
    validateHandbookSections(source.sections);
    source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    return source;
  }
  const source = applyScreenerReference(structuredClone(sources[tenant || 'isi']), tenant);
  if (tenant) {
    applyFacilitatorProviderReference(source);
    const related = source.sections.find(s => s.slug === '6-relationship-to-other-documents');
    if (related) {
      if (tenant === 'isi') related.body_html = related.body_html.replace('There is no separate facilitator or tutoring program at ISI.', 'ISI remains counseling-only; the facilitator protocol applies to approved bachelor’s-level counseling assignments and does not create a separate program.');
      related.body_html += '<p><a href="/library?companyDocument=facilitator-coding-protocol">Facilitator Coding &amp; Documentation Protocol</a> — the companion workflow for approved services, code review and work-time records. Use it when assigned to the bachelor’s-level facilitator role.</p>';
      related.body_html += '<p><a href="/library?companyDocument=service-documentation-standards">Service Documentation Standards</a> — practical note-writing guidance, service-specific records, progress examples and corrections.</p>';
    }
  }
  if (!tenant) {
    const name = String(agency.name || 'Your company').replace(/<[^>]*>/g, '').trim().slice(0, 200) || 'Your company';
    source.organization = name;
    source.presentation = { theme: 'company-foundations', brandLabel: name };
    source.sections = source.sections.map(section => ({ ...section,
      title: section.title.replaceAll('Inner Strength Institute', name),
      body_html: section.body_html.replaceAll('Inner Strength Institute', escape(name))
    }));
    const topics = {
      'definition-of-services': ['Company service scope', 'Define the mental health services, populations, locations, provider roles and programs this company authorizes.'],
      'parent-and-guardian-signatures': ['Consent and decision-making authority', 'Set company consent and signature procedures for the jurisdictions and populations served, including custody and minor-consent review.'],
      'annual-documentation-requirements': ['Document review and renewal', 'Set review and renewal requirements for consent, releases and disclosures.'],
      'section-a-clinical-support-providers-tier-1-reference-only': ['Clinical support roles', 'Define any authorized clinical support roles, or state that this company does not offer these roles.']
    };
    source.requiredSections = Object.entries(topics).map(([slug, [title, prompt]]) => ({ slug, title, prompt }));
    for (const section of source.sections) {
      if (topics[section.slug]) Object.assign(section, { title: topics[section.slug][0], body_html: '', content_status: 'pending' });
      // Owned-company handbook anchors are not portable to a licensed company.
      section.body_html = section.body_html.replace(/href="\/workplace-handbook#handbook-[^"]+"/g, 'href="/workplace-handbook"');
      if (section.title === '6. Relationship to Other Documents' || section.title.startsWith('PART IV:')) section.body_html = '<p>Use this guide with the current company Workplace Handbook, approved role expectations, applicable agreements and payer requirements. Training arrangements and any additional manuals are defined by your company.</p><p><a href="/workplace-handbook">Open the Workplace Handbook</a></p>';
    }
  }
  source.sections = source.sections.map(s => ({ ...s, body_html: cleanHandbookHtml(s.body_html) }));
  validateHandbookSections(source.sections);
  source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  return source;
}

export function referenceMetadata(source) {
  const { sections, revision, ...metadata } = source;
  if (source.documentKey === 'clinical-note-aid-guide') return { ...metadata, sourceRevision: revision, coverTitle: ['A thread of care.', 'A clearer record.'], coverDescription: 'Clinical Note Aid & Care Continuity Guide\nAdapted from Michael Mendez’s original guide.' };
  if (source.documentKey === 'nlu-learning-pilot-guide') return { ...metadata, sourceRevision: revision, coverTitle: ['Understand learning.', 'Notice change.'], coverDescription: 'NLU Learning & Emotional Functioning Pilot\nSeparate perspectives. Better conversations.' };
  const school = source.documentKey === 'school-practice-guide';
  const care = source.documentKey === 'counseling-guide';
  if (source.documentKey === 'mandated-reporting-sop') return { ...metadata, sourceRevision: revision, coverTitle: ['Recognize.', 'Report.'], coverDescription: 'Mandated Reporting SOP\nSafety first. Clear action. Accurate records.' };
  if (source.documentKey === 'caseload-management-sop') return { ...metadata, sourceRevision: revision, coverTitle: ['Care in focus.', 'Room to follow through.'], coverDescription: 'Caseload Management SOP\nPlan realistically. Keep care connected.' };
  if (source.documentKey === 'group-psychotherapy-sop') return { ...metadata, sourceRevision: revision, coverTitle: ['Group', 'psychotherapy.'], coverDescription: '90853 · A resource for approved groups.\nPlan with purpose. Document each person’s care.' };
  if (source.documentKey === 'service-documentation-standards') return { ...metadata, sourceRevision: revision, coverTitle: ['Document', 'with care.'], coverDescription: 'The service. The response. The next step.\nA clear record of the care you provide.' };
  if (source.documentKey === 'facilitator-coding-protocol') return { ...metadata, sourceRevision: revision, coverTitle: ['Facilitator', 'protocol.'], coverDescription: 'Approved services. Accurate records.\nA clear path from care to documentation.' };
  if (source.documentKey === 'crisis-response-guide') return { ...metadata, sourceRevision: revision, coverTitle: ['Crisis &', 'emergency.'], coverDescription: 'Recognize concerns. Respond with care.\nConnect people with the help they need.' };
  if (source.documentKey === 'facilities-guide') return { ...metadata, sourceRevision: revision, coverTitle: ['Shared', 'spaces.'], coverDescription: 'A welcoming office. A thoughtful routine.\nCare for the space we share.' };
  if (source.documentKey === 'skill-development-guide') return { ...metadata, sourceRevision: revision, coverTitle: ['Skills in', 'practice.'], coverDescription: 'Build connection. Support regulation.\nMake space for learning.' };
  return { ...metadata, sourceRevision: revision, documentKey: source.documentKey, coverTitle: care ? ['Care', 'approaches.'] : school ? ['School', 'practice.'] : ['Provider’s', 'guide.'], coverDescription: care ? 'Understand the approaches. Respect the role.\nBuild connection, with care.' : school ? 'Your school assignment. Your first intake.\nA clear path through the school year.' : 'Clinical practice. Clear expectations.\nGuidance for the care you provide.' };
}
