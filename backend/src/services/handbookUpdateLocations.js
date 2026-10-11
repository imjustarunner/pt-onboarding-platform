import { readFileSync } from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import { handbookTenant } from './handbookTenant.js';

// Use the same supplied handbook and stable section keys as the full handbook reader.
const sources = Object.fromEntries(['itsco', 'nlu', 'isi'].map(key => [key, {
  book: JSON.parse(readFileSync(new URL(`../content/handbooks/${key}.json`, import.meta.url), 'utf8')),
  updates: JSON.parse(readFileSync(new URL(`../content/handbooks/${key}-draft-updates.json`, import.meta.url), 'utf8')).updates
}]));

export function handbookUpdateLocations(agency, entries, published = null) {
  const source = sources[handbookTenant(agency)];
  const sections = published?.version ? published.sections : source?.book.sections || [];
  const bySlug = new Map(sections.map(s => [s.slug, {
    slug: s.slug, title: s.title, parent: s.parent_slug ?? s.parentSlug,
    status: s.content_status ?? s.status, body: s.body_html ?? s.bodyHtml,
    page: s.source_page ?? s.sourcePage
  }]));
  const mappings = new Map((source?.updates || []).map(e => [e.subject, e]));
  const savedMappings = new Map((source?.updates || []).filter(e => e.id && e.digest_id).map(e => [`${e.digest_id}:${e.id}`, e]));
  return entries.map(entry => {
    const mapping = savedMappings.get(`${entry.digest_id}:${entry.id}`) || mappings.get(entry.subject);
    const override = entry.handbook_section_slug;
    const slugs = override && override !== mapping?.handbook_section_slug ? [override]
      : mapping?.policy_section_slugs || (override ? [override] : []);
    const references = [...new Set(slugs)].map(slug => {
      const section = bySlug.get(slug);
      if (!section || section.status === 'pending' || !section.body) return null;
      const ancestors = [], seen = new Set([slug]);
      let parent = bySlug.get(section.parent);
      while (parent && !seen.has(parent.slug)) {
        ancestors.unshift(parent.title); seen.add(parent.slug); parent = bySlug.get(parent.parent);
      }
      return {
        slug, title: section.title, path: [...ancestors, section.title].join(' › '),
        sourcePage: section.page || null,
        bodyHtml: sanitizeHtml(section.body, { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2'],
          allowedAttributes: { a: ['href', 'title'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
          allowedSchemes: ['https', 'http', 'mailto'], allowProtocolRelative: false }),
        sourceLabel: published?.version ? `Published handbook · version ${published.version.version_number}`
          : `Supplied handbook · ${source.book.edition}`
      };
    }).filter(Boolean);
    return { ...entry, handbook_locations: references,
      handbook_location_status: references.length ? (references.length === slugs.length ? 'linked' : 'partial') : 'unmapped' };
  });
}
