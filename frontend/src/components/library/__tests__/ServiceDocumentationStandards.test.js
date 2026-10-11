import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/documentation-standards/shared.json';
const book = { metadata: { ...source, sections: undefined, organization: 'ITSCO', coverTitle: ['Document', 'with care.'], presentation: { theme: 'itsco-foundations' } }, sections: source.sections, version: { id: 99, version_number: 1, is_draft: 0 } };
beforeEach(() => { window.history.replaceState({}, '', '/itsco/library'); Element.prototype.scrollIntoView = vi.fn(); });
describe('documentation standards reader', () => {
  it('opens the essentials and searches a service code without download controls', async () => {
    const w = mount(Book, { props: { handbook: book } });
    expect(w.find('.handbook-book').attributes('aria-label')).toBe('Service Documentation Standards'); expect(w.findAll('.outline-link')).toHaveLength(23);
    await w.get('.care-orientation-banner button').trigger('click'); expect(window.location.hash).toBe('#service-documentation-standards-minimum-note');
    await w.get('input[type=search]').setValue('90785');
    const option = w.findAll('.outline-link').find(b => b.text().includes('90785')); await option.trigger('click');
    expect(w.get('.book-page').attributes('id')).toBe('service-documentation-standards-interactive-complexity-90785');
    expect(w.find('a[download]').exists()).toBe(false); expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only'); w.unmount();
  });
  it('offers guide questions and opens the exact cited source', async () => {
    const ask = vi.fn().mockResolvedValue({ status: 'answered', paragraphs: [{ text: 'Record the actual service and response.', citations: [{ slug: 'minimum-note', title: 'Every service note', quote: 'Services and interventions actually provided within the author’s scope.' }] }] });
    const w = mount(Book, { props: { handbook: book, answerQuestion: ask } });
    expect(w.get('.handbook-assistant summary').text()).toContain('Ask the documentation guide');
    await w.findAll('.question-ideas button')[0].trigger('click'); await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 99, question: 'What belongs in every service note?' }), expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click'); expect(window.location.hash).toBe('#service-documentation-standards-minimum-note'); w.unmount();
  });
});
