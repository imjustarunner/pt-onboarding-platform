import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/facilitator-protocols/shared.json';
const book={metadata:{...source,sections:undefined,organization:'ITSCO',coverTitle:['Facilitator','protocol.'],presentation:{theme:'itsco-foundations'}},sections:source.sections,version:{id:99,version_number:1,is_draft:0}};
beforeEach(()=>{window.history.replaceState({},'','/itsco/library');Element.prototype.scrollIntoView=vi.fn();});
describe('facilitator protocol reader',()=>{
  it('opens the workflow, searches code-specific sections and has no download control',async()=>{
    const w=mount(Book,{props:{handbook:book}});
    expect(w.find('.handbook-book').attributes('aria-label')).toBe('Facilitator Coding & Documentation Protocol');
    expect(w.findAll('.outline-link')).toHaveLength(16);
    await w.get('.care-orientation-banner button').trigger('click');
    expect(window.location.hash).toBe('#facilitator-coding-protocol-before-the-service');
    await w.get('input[type=search]').setValue('H0031 and H0032');
    await w.get('.outline-link').trigger('click');
    expect(w.get('.book-page').attributes('id')).toBe('facilitator-coding-protocol-h0031-h0032');
    expect(w.get('.book-page').text()).toContain('actual documented minutes');
    expect(w.find('a[download]').exists()).toBe(false);expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');w.unmount();
  });
  it('uses protocol questions and navigates directly to cited compensation text',async()=>{
    const ask=vi.fn().mockResolvedValue({status:'answered',paragraphs:[{text:'Follow the applicable Compensation Schedule.',citations:[{slug:'indirect-and-assigned-work',title:'Indirect work',quote:'Unless the Compensation Schedule specifies another allowance.'}]}]});
    const w=mount(Book,{props:{handbook:book,answerQuestion:ask}});
    expect(w.get('.handbook-assistant summary').text()).toContain('Ask the facilitator protocol');
    await w.findAll('.question-ideas button')[1].trigger('click');await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({expectedVersionId:99,question:'How is included indirect time calculated?'}),expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');expect(window.location.hash).toBe('#facilitator-coding-protocol-indirect-and-assigned-work');w.unmount();
  });
});
