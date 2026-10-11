import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { studentTrainingTemplate, studentTrainingAppendixHtml } from './studentTrainingEvaluationForm.js';
import { employeeHandbookForms, employeeSelfAssessmentHtml } from './employeeEvaluationHandbookForms.js';
import { handbookTenant } from './handbookTenant.js';
import { applyFacilitatorHandbookScope } from './careGuideScope.js';

const itsco = JSON.parse(readFileSync(new URL('../content/handbooks/itsco.json', import.meta.url), 'utf8'));
const itscoUpdateDrafts = JSON.parse(readFileSync(new URL('../content/handbooks/itsco-draft-updates.json', import.meta.url), 'utf8'));
const nlu = JSON.parse(readFileSync(new URL('../content/handbooks/nlu.json', import.meta.url), 'utf8'));
const nluUpdateDrafts = JSON.parse(readFileSync(new URL('../content/handbooks/nlu-draft-updates.json', import.meta.url), 'utf8'));
const isi = JSON.parse(readFileSync(new URL('../content/handbooks/isi.json', import.meta.url), 'utf8'));
const isiUpdateDrafts = JSON.parse(readFileSync(new URL('../content/handbooks/isi-draft-updates.json', import.meta.url), 'utf8'));
export const handbookBodyHash = body => createHash('sha256').update(cleanHandbookHtml(body)).digest('hex');

export function cleanHandbookHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'span', 's', 'u', 'mark'],
    allowedAttributes: { a: ['href', 'title'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ol: ['start'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'], allowProtocolRelative: false
  });
}

export function getHandbookSource(agency, { employeeTemplates } = {}) {
  // Match the tenant's configured slug, never a fuzzy name or another tenant's ID.
  const tenant = handbookTenant(agency);
  if (!tenant) return null;
  const source = structuredClone({ itsco, nlu, isi }[tenant]);
  const facilitatorUpdate = applyFacilitatorHandbookScope(source, tenant);
  const updateDrafts = { itsco: itscoUpdateDrafts, nlu: nluUpdateDrafts, isi: isiUpdateDrafts }[tenant];
  const trainingTemplate = studentTrainingTemplate();
  const selfAssessments = employeeHandbookForms(employeeTemplates ?? (tenant !== 'itsco' ? [] : undefined));
  source.forms = { studentTrainingEvaluation: trainingTemplate, employeeSelfAssessments: selfAssessments };
  const trainingSection = source.sections.find(s => s.slug === trainingTemplate.sectionSlug);
  if (trainingSection) {
    trainingSection.bodyHtml = cleanHandbookHtml(studentTrainingAppendixHtml(trainingTemplate));
    trainingTemplate.sectionBodyHtml = trainingSection.bodyHtml;
  }
  // Appendix H is the billing/compliance rubric referenced in the original
  // handbook. Preserve that identity for its source when it is supplied.
  source.sections.push({ slug: 'appendix-i', title: 'Appendix I · Employee self-assessments', parentSlug: null, sourcePage: null, status: 'ready', bodyHtml: '<p>Role-specific employee self-assessments use a 1–4 rating scale: Needs Improvement, Developing, Proficient and Exemplary. Review each criterion, select a rating, and add development notes and reflections in your assigned evaluation.</p><p>Complete your self-assessment in My Account → Evaluations. This appendix shows blank form definitions; individual scores, comments and completed evaluations stay private. Your assignment retains the form version assigned to it.</p>' });
  if (!selfAssessments.length) {
    const appendix = source.sections.at(-1);
    appendix.status = 'pending';
    appendix.bodyHtml = '';
  }
  for (const form of selfAssessments) {
    form.sectionBodyHtml = cleanHandbookHtml(employeeSelfAssessmentHtml(form));
    source.sections.push({ slug: form.sectionSlug, title: form.name, parentSlug: 'appendix-i', sourcePage: null, status: 'ready', bodyHtml: form.sectionBodyHtml });
  }
  source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  source.sections = source.sections.map((s, index) => ({
    slug: s.slug, parent_slug: s.parentSlug, title: s.title, source_page: s.sourcePage,
    content_status: s.status, body_html: cleanHandbookHtml(s.bodyHtml), source_body_hash: s.status === 'ready' ? handbookBodyHash(s.bodyHtml) : null, sort_order: index
  }));
  validateHandbookSections(source.sections);
  // These are review material only. Never put draft policies into a published
  // section or its metadata merely because their source snapshot is available.
  source.reviewUpdates = [...structuredClone(updateDrafts.updates), facilitatorUpdate];
  source.reviewUpdatesCapturedAt = updateDrafts.capturedAt;
  return source;
}

export function mapHandbookReviewUpdates(source, liveEntries) {
  const mappings = new Map((source?.reviewUpdates || []).map(e => [e.subject, e]));
  return liveEntries.map(entry => {
    const match = mappings.get(entry.subject);
    const linked = entry.handbook_section_slug || match?.handbook_section_slug || null;
    const policySections = entry.handbook_section_slug && entry.handbook_section_slug !== match?.handbook_section_slug
      ? [entry.handbook_section_slug] : match?.policy_section_slugs || (linked ? [linked] : []);
    return { ...entry, handbook_section_slug: linked, related_section_slugs: entry.handbook_section_slug ? [] : match?.related_section_slugs || [], policy_section_slugs: policySections, link_origin: entry.handbook_section_slug ? 'saved' : match ? 'source_review' : null };
  });
}

export function validateHandbookSections(sections) {
  const keys = new Set();
  for (const section of sections) {
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(section.slug || '') || keys.has(section.slug)) {
      throw Object.assign(new Error('Handbook section links must be unique and stable.'), { status: 400 });
    }
    if (!String(section.title || '').trim()) throw Object.assign(new Error('Every handbook section needs a title.'), { status: 400 });
    keys.add(section.slug);
  }
  const byKey = new Map(sections.map(s => [s.slug, s]));
  for (const section of sections) {
    const seen = new Set([section.slug]);
    let parent = section.parent_slug;
    while (parent) {
      if (!byKey.has(parent) || seen.has(parent)) throw Object.assign(new Error('The handbook outline contains an invalid parent or cycle.'), { status: 400 });
      seen.add(parent);
      parent = byKey.get(parent).parent_slug;
    }
  }
}

export function handbookChanges(before = [], after = []) {
  const prior = new Map(before.map(s => [s.slug, s]));
  const next = new Map(after.map(s => [s.slug, s]));
  const commonPositions = (sections, other) => {
    const counts = new Map();
    const positions = new Map();
    for (const s of [...sections].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))) {
      if (!other.has(s.slug) || (other.get(s.slug).parent_slug || null) !== (s.parent_slug || null)) continue;
      const parent = s.parent_slug || '';
      const position = counts.get(parent) || 0;
      positions.set(s.slug, position); counts.set(parent, position + 1);
    }
    return positions;
  };
  const beforePositions = commonPositions(before, next);
  const afterPositions = commonPositions(after, prior);
  const changes = [];
  for (const s of after) {
    const p = prior.get(s.slug);
    const ready = s.content_status !== 'pending';
    const wasReady = p && p.content_status !== 'pending';
    // Outline-only additions are tracked in the version, not announced as policy.
    if (!ready && !wasReady) continue;
    let kind = null;
    if (!wasReady && ready) kind = 'added';
    else if (wasReady && !ready) kind = 'removed';
    else if (cleanHandbookHtml(p.body_html) !== cleanHandbookHtml(s.body_html)) kind = 'updated';
    else if (p.title !== s.title) kind = 'renamed';
    else if ((p.parent_slug || null) !== (s.parent_slug || null) || beforePositions.get(s.slug) !== afterPositions.get(s.slug)) kind = 'moved';
    if (kind) changes.push({ slug: s.slug, title: s.title, kind, beforeHtml: cleanHandbookHtml(p?.body_html), afterHtml: ready ? cleanHandbookHtml(s.body_html) : '' });
  }
  for (const p of before) {
    if (!next.has(p.slug) && p.content_status !== 'pending') changes.push({ slug: p.slug, title: p.title, kind: 'removed', beforeHtml: cleanHandbookHtml(p.body_html), afterHtml: '' });
  }
  return changes;
}

export function mergeSuppliedSections(sourceSections, existingSections, removedSlugs = []) {
  const previous = new Map(existingSections.map(s => [s.slug, s]));
  const incoming = new Set(sourceSections.map(s => s.slug));
  const removed = new Set(removedSlugs);
  if (sourceSections.some(s => removed.has(s.slug))) throw Object.assign(new Error('A removed section cannot also appear in the supplied outline.'), { status: 400 });
  const merged = sourceSections.map(s => {
    const existing = previous.get(s.slug);
    // An incomplete paste must never erase already supplied policy text.
    if (existing?.content_status !== 'pending' && existing?.body_html && (s.content_status === 'pending' || (existing.source_body_hash && existing.source_body_hash === s.source_body_hash))) {
      return { ...s, body_html: existing.body_html, content_status: 'ready', source_body_hash: existing.source_body_hash || null };
    }
    if (existing?.source_body_hash && s.source_body_hash && handbookBodyHash(existing.body_html) !== existing.source_body_hash && handbookBodyHash(existing.body_html) !== s.source_body_hash) {
      throw Object.assign(new Error(`“${s.title}” has newer in-app wording. Reconcile it with the supplied text before importing.`), { status: 409 });
    }
    return { ...s };
  });
  for (const section of existingSections) {
    if (!incoming.has(section.slug) && !removed.has(section.slug)) merged.push({ ...section, sort_order: merged.length });
  }
  validateHandbookSections(merged);
  return merged;
}

export function handbookMetadata(source) {
  return { title: source.title, organization: source.organization, coverUrl: source.coverUrl, edition: source.edition, sourceDate: source.sourceDate, ...(source.presentation ? { presentation: structuredClone(source.presentation) } : {}), ...(source.forms ? { forms: structuredClone(source.forms) } : {}), ...(source.template ? { template: structuredClone(source.template) } : {}) };
}

export function parseHandbookMetadata(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
