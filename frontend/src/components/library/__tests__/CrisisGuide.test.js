import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/crisis-guides/shared.json';
const book = slug => ({metadata:{...source,sections:undefined,organization:slug,coverTitle:['Crisis &','emergency.'],presentation:{theme:`${slug==='tisi'?'isi':slug}-foundations`}},sections:source.sections,version:{id:90,version_number:1,is_draft:0}});
beforeEach(()=>{window.history.replaceState({},'','/itsco/library');Element.prototype.scrollIntoView=vi.fn();});
describe('crisis reader and direct response access',()=>{
  it.each(['itsco','nlu','tisi'])('%s exposes contacts and procedures without needing Q&A',async slug=>{
    const w=mount(Book,{props:{handbook:book(slug)}});
    expect(w.find('.handbook-book').attributes('aria-label')).toBe('Crisis & Emergency Response Guide');
    expect(w.get('.crisis-quick-actions').text()).toContain('Do not wait');
    expect(w.get('a[href="tel:911"]').text()).toContain('Immediate danger');
    expect(w.get('a[href="tel:988"]').text()).toContain('crisis support');
    expect(w.get('a[href="tel:18442645437"]').text()).toContain('child abuse');
    await w.get('.crisis-quick-actions nav button').trigger('click');
    expect(window.location.hash).toBe('#crisis-response-guide-on-site-emergency');
    expect(w.get('.book-page').text()).toContain('Call 911');
    await w.get('input[type=search]').setValue('referral number');
    await w.get('.outline-link').trigger('click');
    expect(window.location.hash).toBe('#crisis-response-guide-reporting-children');
    expect(w.find('a[download]').exists()).toBe(false);expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    w.unmount();
  });
  it('opens cited policy sections and retains emergency shortcuts on answer failure',async()=>{
    const ask=vi.fn().mockResolvedValueOnce({status:'answered',paragraphs:[{text:'Use a collaborative plan.',citations:[{slug:'safety-planning',title:'Collaborative safety planning',quote:'A contract is not a substitute.'}]}]}).mockRejectedValueOnce(new Error('offline'));
    const w=mount(Book,{props:{handbook:book('itsco'),answerQuestion:ask}});
    const question=w.findAll('.question-ideas button')[1];await question.trigger('click');await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({expectedVersionId:90}),expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');expect(window.location.hash).toBe('#crisis-response-guide-safety-planning');
    await w.get('textarea').setValue('What should we document?');await w.get('.assistant-form').trigger('submit');await flushPromises();
    expect(w.get('.answer-error').text()).toContain('For immediate danger, call 911');
    expect(w.get('a[href="tel:911"]').exists()).toBe(true);
    w.unmount();
  });
});
