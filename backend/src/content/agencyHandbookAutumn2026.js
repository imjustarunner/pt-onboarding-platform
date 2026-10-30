import { readFileSync } from 'node:fs';
import { ADVANCED_CATEGORY_LABEL, ADVANCED_CATEGORY_DESCRIPTION, ADVANCED_CATEGORY_PLACEMENT, ADVANCED_CATEGORY_RATIONALE, advancedCategoryWording, advancedCategoryPolicyHtml } from './advancedCompensationCategory.js';
import { applyEventTimeHandbookAmendment } from './eventTimeHandbookAmendment.js';
import { applyEventTravelHandbookAmendment, EVENT_TRAVEL_NOVEMBER_UPDATE } from './eventTravelHandbookAmendment.js';
import { applyFlatAddonHandbookAmendment, FLAT_ADDON_NOVEMBER_UPDATE } from './flatAddonHandbookAmendment.js';
import { SCHOOL_SUPPORT_NOVEMBER_UPDATE } from './schoolSupportHandbookAmendment.js';
import { roleDevelopmentNovemberUpdates as roleUpdates } from './roleDevelopmentNovember2026.js';

const octoberRationales = JSON.parse(readFileSync(new URL('./handbooks/itsco-draft-updates.json', import.meta.url))).updates;
export const AUTUMN_RELEASES = {
  itsco: { name: 'ITSCO', slug: 'itsco', host: 'app.itsco.health', period: 'November 2026' },
  nlu: { name: 'Next Level Up', slug: 'nlu', host: 'app.nextleveluplcc.com', period: 'October 2026' },
  isi: { name: 'Inner Strength Institute', slug: 'tisi', host: 'app.theinnerstrengthinstitute.com', period: 'October 2026' }
};

// Adapt only the explicitly shared additions. Existing company policies retain
// their service lines, foundations, benefit eligibility and assigned duties.
export function adaptSharedAutumnText(text, tenant) {
  const release = AUTUMN_RELEASES[tenant];
  if (!release) throw Error('Unknown handbook tenant.');
  let body = String(text || '');
  if (tenant !== 'itsco') {
    body = body
      .replace(/, including outreach events held at schools/g, '')
      .replace(/, including assigned school events/g, '')
      .replace(/ Regular school-service mileage remains governed by the existing [\s\S]*?school mileage reimbursement policy<\/a>\./g, '')
      .replace(/ The existing school mileage reimbursement policy is unchanged\./g, '')
      .replace(/ This update applies to outreach only; the existing school mileage reimbursement policy is unchanged\./g, '')
      .replaceAll('home, assigned office, school or another location', 'home, assigned office or another location')
      .replaceAll('Outreach mileage does not use school benefit tiers or the school mileage cap.', 'Outreach mileage follows the event mileage policy.')
      .replace(/This corrects the add-on mapping for the October 10–23, 2026 open pay period and subsequent periods\. It does not change posted payroll\./g, 'Apply the approved agency compensation schedule for the service date; this handbook update does not change posted payroll.')
      .replace(/ This corrects the October 10–23 open payroll and subsequent periods\./g, ' Apply the approved agency compensation schedule for the service date.')
      .replaceAll('https://app.itsco.health/itsco/', `https://${release.host}/${release.slug}/`)
      .replaceAll('ITSCO', release.name);
  }
  if (tenant === 'isi') body = body.replaceAll('Facilitator and clinical support', 'Practice and clinical support');
  return body;
}

function putSection(source, slug, title, body, parentSlug = null) {
  const existing = source.sections.find(s => s.slug === slug);
  if (existing) Object.assign(existing, { title, bodyHtml: body, status: 'ready' });
  else source.sections.push({ slug, title, bodyHtml: body, status: 'ready', parentSlug, sourcePage: null });
}

export function applyAdvancedCategoryToSections(source) {
  for (const section of source.sections || []) {
    if (section.status !== 'ready') continue;
    section.title = advancedCategoryWording(section.title).replaceAll('&amp;', '&');
    section.bodyHtml = advancedCategoryWording(section.bodyHtml);
    const categorySection = section.slug === 'compensation-rate-category-3';
    const combinedSchedule = ['category-level-rate-schedule', 'role-based-supplemental-compensation-rate-schedule'].includes(section.slug)
      && section.bodyHtml.includes(ADVANCED_CATEGORY_DESCRIPTION);
    if ((categorySection || combinedSchedule) && !section.bodyHtml.includes(ADVANCED_CATEGORY_PLACEMENT)) {
      section.bodyHtml = section.bodyHtml.replace(ADVANCED_CATEGORY_DESCRIPTION, `${ADVANCED_CATEGORY_DESCRIPTION} ${ADVANCED_CATEGORY_PLACEMENT}`);
    }
  }
  return source;
}

export function applyAutumnHandbookReconciliation(source, updates, tenant) {
  const release = AUTUMN_RELEASES[tenant];
  if (!release) return { source, updates };
  const additions = [];
  for (const entry of roleUpdates) {
    const slug = entry.handbook_section_slug;
    let body = adaptSharedAutumnText(entry.changed_content, tenant)
      .replace('Independently licensed provider practice:', 'Licensed and other approved advanced professional practice:');
    // Keep ISI's distinct counseling scope alongside the shared pay clarification.
    if (tenant === 'isi' && slug === 'service-focus-assignment') {
      const original = source.sections.find(s => s.slug === slug)?.bodyHtml || '';
      if (original.includes('counseling-only practice')) body = original.split('<p>A service-focus assignment')[0] + body;
    }
    const title = source.sections.find(s => s.slug === slug)?.title || entry.subject;
    putSection(source, slug, title, body);
    additions.push({ ...entry, changed_content: body });
  }

  if (tenant !== 'itsco') {
    for (const section of source.sections) section.bodyHtml = String(section.bodyHtml || '').replaceAll(`https://${release.host}/${release.slug}/workplace-handbook#handbook-event-travel-reimbursement`, 'https://app.itsco.health/itsco/workplace-handbook#handbook-event-travel-reimbursement');
    const before = new Map(source.sections.map(s => [s.slug, s.bodyHtml]));
    applyEventTimeHandbookAmendment(source, 'itsco');
    applyEventTravelHandbookAmendment(source, 'itsco');
    for (const section of source.sections) if (before.get(section.slug) !== section.bodyHtml || section.bodyHtml.includes('https://app.itsco.health/itsco/')) section.bodyHtml = adaptSharedAutumnText(section.bodyHtml, tenant);
  }
  for (const section of source.sections) section.bodyHtml = String(section.bodyHtml || '').replaceAll(`https://${release.host}/${release.slug}/workplace-handbook#handbook-flat-clinical-addons-and-eligibility`, 'https://app.itsco.health/itsco/workplace-handbook#handbook-flat-clinical-addons-and-eligibility');
  applyFlatAddonHandbookAmendment(source, 'itsco');
  for (const section of source.sections) if (section.slug === 'flat-clinical-addons-and-eligibility' || section.bodyHtml?.includes('#handbook-flat-clinical-addons-and-eligibility')) section.bodyHtml = adaptSharedAutumnText(section.bodyHtml, tenant);
  applyAdvancedCategoryToSections(source);
  // This separate policy gives the new decision rule a stable destination even
  // when an older editable draft keeps all three rate tables in one section.
  putSection(source, 'compensation-category-placement', 'Compensation category placement', advancedCategoryPolicyHtml(),
    source.sections.some(s => s.slug === 'role-based-supplemental-compensation-rate-schedule') ? 'role-based-supplemental-compensation-rate-schedule' : null);

  additions.push(
    { ...EVENT_TRAVEL_NOVEMBER_UPDATE, changed_content: adaptSharedAutumnText(EVENT_TRAVEL_NOVEMBER_UPDATE.changedContent, tenant), handbook_section_slug: 'event-travel-reimbursement' },
    { ...FLAT_ADDON_NOVEMBER_UPDATE, changed_content: adaptSharedAutumnText(FLAT_ADDON_NOVEMBER_UPDATE.changedContent, tenant), handbook_section_slug: 'flat-clinical-addons-and-eligibility' },
    { subject: `Category 3 — ${ADVANCED_CATEGORY_LABEL}`, rationale: ADVANCED_CATEGORY_RATIONALE, changed_content: advancedCategoryPolicyHtml(), handbook_section_slug: 'compensation-category-placement' }
  );
  if (tenant === 'itsco') additions.splice(3, 0, { ...SCHOOL_SUPPORT_NOVEMBER_UPDATE, changed_content: SCHOOL_SUPPORT_NOVEMBER_UPDATE.changedContent, handbook_section_slug: 'school-support-activity-hours' });
  for (const section of source.sections) {
    // Preserve stable role anchors while removing the retired numbered track labels.
    if (/^section-[acd]-.*-tier-[123]$/.test(section.slug)) section.title = section.title.replace(/\s*\(Tier [123]\)/gi, '');
  }

  const review = updates.map(update => {
    const value = { ...update };
    if (tenant !== 'itsco') {
      value.period_label = release.period;
      value.digest_title = `${release.period} Workplace Handbook Updates`;
      value.changed_content = advancedCategoryWording(value.changed_content);
      const shared = octoberRationales.find(e => e.handbook_section_slug === value.handbook_section_slug);
      value.rationale ||= adaptSharedAutumnText(shared?.rationale || 'Consolidate the current approved procedures in the agency’s October provider update and link them to the corresponding handbook policies.', tenant);
      // A combined unsent edition should show the final wording at every link.
      const destinations = value.policy_section_slugs || [];
      if (destinations.includes('compensation-rate-category-3') && !value.changed_content.includes(ADVANCED_CATEGORY_PLACEMENT)) {
        value.changed_content = value.changed_content.replace(ADVANCED_CATEGORY_DESCRIPTION, `${ADVANCED_CATEGORY_DESCRIPTION} ${ADVANCED_CATEGORY_PLACEMENT}`);
      }
      if (destinations.length) {
        value.changed_content = destinations.map(slug => source.sections.find(s => s.slug === slug)).filter(s => s?.status === 'ready')
          .map(s => `<h3>${s.title}</h3>${s.bodyHtml}`).join('');
      }
    }
    return value;
  });
  for (const entry of additions) {
    const id = `${tenant}-source-autumn-2026-${entry.handbook_section_slug}`;
    const value = { id, status: 'draft', period_label: release.period, digest_title: `${release.period} Workplace Handbook Updates`,
      subject: entry.subject, rationale: adaptSharedAutumnText(entry.rationale, tenant), changed_content: entry.changed_content,
      handbook_section_slug: entry.handbook_section_slug, policy_section_slugs: [entry.handbook_section_slug], related_section_slugs: [], link_origin: 'source_review' };
    const index = review.findIndex(e => e.id === id);
    if (index < 0) review.push(value); else review[index] = value;
  }
  source.sourceDate = '2026-10-29';
  return { source, updates: review };
}
