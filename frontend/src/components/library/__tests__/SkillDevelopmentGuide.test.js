import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/skill-development-guides/nlu.json';
const book = { metadata: { ...source, sections: undefined, coverTitle: ['Skills in', 'practice.'], presentation: { theme: 'nlu-foundations', brandLabel: 'Next Level Up' } }, sections: source.sections, version: { id: 91, version_number: 1, is_draft: 0 } };
beforeEach(() => { window.history.replaceState({}, '', '/nlu/library'); Element.prototype.scrollIntoView = vi.fn(); });
describe('skills reader and citations', () => {
  it('opens company rules, searches full text and keeps stable links without download controls', async () => {
    const w = mount(Book, { props: { handbook: book } });
    expect(w.find('.handbook-book').attributes('aria-label')).toBe('Skill Development & Learning Guide');
    expect(w.get('.branded-cover').attributes('aria-label')).toContain('Next Level Up');
    await w.get('.care-orientation-banner button').trigger('click');
    expect(window.location.hash).toBe('#skill-development-guide-program-boundaries');
    expect(w.get('.book-page').text()).toContain('two or more attending');
    await w.get('input[type=search]').setValue('non-overlapping');
    await w.get('.outline-link').trigger('click');
    expect(window.location.hash).toBe('#skill-development-guide-service-separation');
    expect(w.get('.book-page').text()).toContain('does not enable an automatic split claim');
    expect(w.find('a[download]').exists()).toBe(false); expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    w.unmount();
  });
  it('asks edition-specific questions and opens the exact cited passage', async () => {
    const ask = vi.fn().mockResolvedValue({ status: 'answered', paragraphs: [{ text: 'Proceed with two or more attending.', citations: [{ slug: 'program-boundaries', title: 'NLU group rules', quote: 'Schedule at least three clients.' }] }] });
    const w = mount(Book, { props: { handbook: book, answerQuestion: ask } });
    expect(w.get('.handbook-assistant').text()).toContain('Ask the skills guide');
    await w.findAll('button').find(b => b.text().includes('What are our group attendance')).trigger('click'); await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 91 }), expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');
    expect(w.get('.book-page').attributes('id')).toBe('skill-development-guide-program-boundaries');
    w.unmount();
  });
});
