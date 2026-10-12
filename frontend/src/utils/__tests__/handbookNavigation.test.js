import { describe, expect, it } from 'vitest';
import { chapterFor, chapterTopics, isChapterOpening, sectionExcerpt } from '../handbookNavigation';
const chapter = { slug: 'standards', title: 'Provider standards', parent_slug: null, body_html: '' };
const opening = { slug: 'documentation', parent_slug: 'standards', title: '3. Signed Documentation & Annual Compliance', body_html: '<p>Explore the sections in this chapter.</p>' };
const topics = [
  { slug: 'signatures', parent_slug: 'standards', title: 'Required signatures', body_html: '<p>Sign and date each record.</p>' },
  { slug: 'annual-review', parent_slug: 'standards', title: 'Annual review', body_html: '<p>Review the current policy.</p>' }
];
const metadata = { presentation: { chapterDividers: ['standards', 'documentation'] } };
describe('handbook chapter navigation', () => {
  it('tracks the root chapter through nested section levels', () => {
    const child = { slug: 'detailed-topic', parent_slug: 'signatures' };
    expect(chapterFor(child, [chapter, opening, ...topics, child])).toBe(chapter);
    expect(chapterFor(chapter, [chapter])).toBe(chapter);
  });
  it('handles a missing parent and stops on malformed outline cycles', () => {
    const orphan = { slug: 'orphan', parent_slug: 'missing' };
    expect(chapterFor(orphan, [orphan])).toBe(orphan);
    const a = { slug: 'a', parent_slug: 'b' }, b = { slug: 'b', parent_slug: 'a' };
    expect(chapterFor(a, [a, b])).toBe(a);
  });
  it('recognizes only configured, empty chapter openings and preserves real policy content', () => {
    expect(isChapterOpening(opening, metadata)).toBe(true);
    expect(isChapterOpening(chapter, metadata)).toBe(true);
    expect(isChapterOpening(opening, {})).toBe(false);
    expect(isChapterOpening({ ...opening, body_html: '<p>All staff must sign their records.</p>' }, metadata)).toBe(false);
  });
  it('fills an imported flat chapter opening with the next existing topics', () => {
    const nextChapter = { slug: 'next-numbered', parent_slug: 'standards', title: '4. Confidentiality' };
    expect(chapterTopics(opening, [chapter, opening, ...topics, nextChapter, { slug: 'later', parent_slug: 'standards', title: 'Later topic' }], metadata)).toEqual(topics);
  });
  it('stops at a different parent so another chapter’s text is not mixed in', () => {
    expect(chapterTopics(opening, [chapter, opening, topics[0], { slug: 'another-part', parent_slug: null, title: 'Care delivery' }, topics[1]], metadata)).toEqual([topics[0]]);
  });
  it('prefers direct children from a structured outline', () => {
    const nested = { slug: 'nested', parent_slug: opening.slug, title: 'Documentation workflow', body_html: '<p>Existing guidance.</p>' };
    expect(chapterTopics(opening, [chapter, opening, nested, ...topics], metadata)).toEqual([nested]);
  });
  it('shows compact plain-text excerpts from existing content', () => {
    expect(sectionExcerpt({ body_html: '<p>Review&nbsp;<strong>signatures</strong> &amp; dates.</p>' })).toBe('Review signatures & dates.');
    const excerpt = sectionExcerpt({ body_html: `<p>${'Existing policy content. '.repeat(30)}</p>` });
    expect(excerpt.length).toBeLessThanOrEqual(190); expect(excerpt.endsWith('…')).toBe(true);
    expect(sectionExcerpt({})).toBe('');
  });
});
