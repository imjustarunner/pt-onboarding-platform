import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/mandated-reporting/shared.json';
describe('mandated reporting reader', () => {
  it('searches reporting guidance and opens an answer’s exact source', async () => {
    window.history.replaceState({}, '', '/nlu/library'); Element.prototype.scrollIntoView = vi.fn();
    const answerQuestion = vi.fn().mockResolvedValue({ status: 'answered', paragraphs: [{ text: 'Record the source, actions and confirmation.', citations: [{ slug: 'documentation', title: 'Document in the app', quote: 'Use the authorized client record' }] }] });
    const w = mount(Book, { props: { handbook: { metadata: { ...source, sections: undefined }, sections: source.sections, version: { id: 99, version_number: 1 } }, answerQuestion } });
    expect(w.get('.handbook-assistant summary').text()).toContain('Ask the mandated reporting SOP');
    await w.get('input[type=search]').setValue('T1017');
    await w.findAll('.outline-link').find(b => b.text().includes('T1017')).trigger('click');
    expect(window.location.hash).toBe('#mandated-reporting-sop-billing-and-work-time');
    await w.findAll('.question-ideas button')[2].trigger('click'); await flushPromises();
    expect(answerQuestion).toHaveBeenCalledWith(expect.objectContaining({ expectedVersionId: 99 }), expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');
    expect(window.location.hash).toBe('#mandated-reporting-sop-documentation');
    expect(w.find('a[download]').exists()).toBe(false); w.unmount();
  });
});
