import { it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/caseload-management/shared.json';
it('searches caseload guidance and links answers to the source', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const answerQuestion = vi.fn().mockResolvedValue({ status:'answered', paragraphs:[{ text:'Review continuity before closure.', citations:[{ slug:'transfer-and-closure', title:'Transfer and closure', quote:'Transfer or close a case through the authorized agency process' }] }] });
  const w = mount(Book, { props:{ handbook:{ metadata:source, sections:source.sections, version:{id:99} }, answerQuestion } });
  expect(w.text()).toContain('Ask the caseload management SOP');
  await w.get('input[type=search]').setValue('backfill');
  await w.findAll('.outline-link').find(b => b.text().includes('Scheduling')).trigger('click');
  expect(w.find('.book-page').attributes('id')).toBe('caseload-management-sop-scheduling-and-backfill');
  await w.findAll('.question-ideas button')[2].trigger('click'); await flushPromises();
  await w.get('.answer-policy-links a').trigger('click');
  expect(w.find('.book-page').attributes('id')).toBe('caseload-management-sop-transfer-and-closure');
  expect(w.find('a[download]').exists()).toBe(false); w.unmount();
});
