import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cleanHandbookHtml, handbookBodyHash, parseHandbookMetadata, validateHandbookSections, mergeSuppliedSections } from './workplaceHandbookContent.js';

// Releases are immutable. Add a new version/file rather than rewriting an
// assigned release. A company edition is always stored in handbook_versions.
const handbookV1 = JSON.parse(readFileSync(new URL('../content/document-library/workplace-handbook-v1.json', import.meta.url), 'utf8'));
const releases = [handbookV1];
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const color = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value || '') ? value : fallback;
const brandImage = value => {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) return '';
  if (/^\/(?!\/)/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : ''; } catch { return ''; }
};

export function documentTemplate(key, version) {
  return releases.find(r => r.key === key && r.version === version) || null;
}
export function documentTemplateCatalog() {
  return releases.filter((r, i) => releases.findLastIndex(item => item.key === r.key) === i).map(r => ({
    key: r.key, version: r.version, title: r.title, owner: r.owner, minimumTier: r.minimumTier,
    description: r.description, sectionCount: r.sections.length,
    requiredSections: r.sections.filter(s => s.required).map(s => ({ slug: s.slug, title: s.title, prompt: s.setupPrompt }))
  }));
}
export function companyHandbookSource(agency, assignment) {
  if (Number(agency?.id) !== Number(assignment?.agency_id)) throw Object.assign(new Error('Company document access denied.'), { status: 403 });
  const template = documentTemplate(assignment.document_key, assignment.template_version);
  if (!template) throw Object.assign(new Error('This document template release is unavailable.'), { status: 409 });
  const organization = String(agency.name || '').trim();
  if (!organization) throw Object.assign(new Error('Add the company name before preparing its handbook.'), { status: 400 });
  const palette = parseHandbookMetadata(agency.color_palette);
  const replace = value => value.replaceAll('{{company}}', escape(organization));
  const sections = template.sections.map((s, sort_order) => {
    const body_html = cleanHandbookHtml((s.paragraphs || []).map(p => `<p>${replace(p)}</p>`).join(''));
    return { slug: s.slug, title: s.title.replaceAll('{{company}}', organization), parent_slug: null, source_page: null,
      sort_order, body_html, content_status: s.required ? 'pending' : 'ready', source_body_hash: s.required ? null : handbookBodyHash(body_html) };
  });
  validateHandbookSections(sections);
  const source = {
    title: template.title, organization, coverUrl: '', edition: 'Company edition', sourceDate: null, sections,
    presentation: { theme: 'company-foundations', brandLabel: organization, logoUrl: brandImage(agency.logo_url),
      primaryColor: color(palette.primary || palette.primaryColor, '#223a50'), accentColor: color(palette.secondary || palette.secondaryColor, '#426c60') },
    template: { key: template.key, version: template.version, owner: template.owner, minimumTier: template.minimumTier, assignmentId: assignment.id,
      requiredSections: template.sections.filter(s => s.required).map(s => ({ slug: s.slug, title: s.title, prompt: s.setupPrompt })) },
    importNotes: [{ key: 'company-edition', message: template.adaptationNotes }], reviewUpdates: []
  };
  source.revision = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  return source;
}

export function companyHandbookReadiness(metadata, sections) {
  if (!metadata?.template) return [];
  const release = documentTemplate(metadata.template.key, metadata.template.version);
  if (!release) return [{ slug: '', title: 'Template release unavailable', prompt: 'Restore the assigned template release before publishing.' }];
  // Read requirements from the immutable release, not client-controlled metadata.
  return release.sections.filter(s => s.required).filter(required => {
    const section = sections.find(s => s.slug === required.slug);
    const text = cleanHandbookHtml(section?.body_html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    return !section || section.content_status !== 'ready' || !text || /\{\{[^}]+\}\}|\[insert\b|\bTODO\b/i.test(text);
  }).map(s => ({ slug: s.slug, title: s.title, prompt: s.setupPrompt }));
}

export function mergeCompanyHandbookSource(source, previous, priorMetadata = {}) {
  const priorRelease = documentTemplate(priorMetadata.template?.key, priorMetadata.template?.version);
  const existing = new Map(previous.map(s => [s.slug, s]));
  const originalSlugs = new Set((priorRelease?.sections || []).map(s => s.slug));
  // A deleted company section stays deleted on a later branding/template import.
  const incoming = source.sections.filter(s => !originalSlugs.has(s.slug) || existing.has(s.slug));
  const merged = mergeSuppliedSections(incoming, previous, source.removedSectionSlugs).map(section => {
    const prior = existing.get(section.slug);
    return prior ? { ...section, title: prior.title, parent_slug: prior.parent_slug, sort_order: prior.sort_order } : section;
  });
  validateHandbookSections(merged);
  return merged;
}
