export function chapterFor(section, sections) {
  let current = section;
  const seen = new Set();
  while (current?.parent_slug && !seen.has(current.slug)) {
    seen.add(current.slug);
    const parent = sections.find(item => item.slug === current.parent_slug);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function isChapterOpening(section, metadata = {}) {
  if (!section || !metadata.presentation?.chapterDividers?.includes(section.slug)) return false;
  const text = String(section.body_html || '').replace(/<[^>]*>/g, '').trim();
  return !text || text === 'Explore the sections in this chapter.';
}

// Older imported outlines flatten subheadings under a part. Build a useful
// contents page from the following topics without changing stored policy text.
export function chapterTopics(section, sections, metadata = {}) {
  if (!section) return [];
  const children = sections.filter(item => item.parent_slug === section.slug);
  if (children.length || !isChapterOpening(section, metadata)) return children;
  const result = [];
  for (const next of sections.slice(sections.findIndex(item => item.slug === section.slug) + 1)) {
    if (next.parent_slug !== section.parent_slug || isChapterOpening(next, metadata) || /^(?:\d+[.)]\s|section\s+[a-z]\b|part\s+[ivx]+\b)/i.test(next.title)) break;
    result.push(next);
  }
  return result;
}

export function sectionExcerpt(section) {
  const text = String(section?.body_html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return text.length > 190 ? `${text.slice(0, 187)}…` : text;
}
