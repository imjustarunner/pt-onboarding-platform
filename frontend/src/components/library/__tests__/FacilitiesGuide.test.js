import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/facilities-guides/shared.json';
const book = slug => ({ metadata: { ...source, sections: undefined, organization: slug, coverTitle: ['Shared','spaces.'], presentation: {theme: `${slug === 'tisi' ? 'isi' : slug}-foundations`}, facilities: {primaryLocation:'437 Windchime', ...(slug === 'itsco' ? {denverStatus:'coming_soon',denverSectionSlug:'denver-procedures'} : {})} }, sections: [...source.sections, ...(slug === 'itsco' ? [{slug:'denver-procedures',title:'Denver · Coming soon',body_html:'<p>Coming soon: this notice is not an operating procedure.</p>',content_status:'ready',parent_slug:null}] : [])], version:{id:88,version_number:1,is_draft:0} });
beforeEach(() => { window.history.replaceState({}, '', '/itsco/library'); Element.prototype.scrollIntoView = vi.fn(); });
describe('facilities reader', () => {
  it.each(['itsco', 'nlu', 'tisi'])('opens the correct site shortcut for %s without credentials or export controls', async slug => {
    const w = mount(Book, { props: { handbook: book(slug) } });
    expect(w.find('.handbook-book').attributes('aria-label')).toBe('Operations & Facilities Guide');
    expect(w.get('.care-orientation-banner').text()).toContain('437 Windchime');
    await w.get('.care-orientation-banner button').trigger('click');
    expect(w.get('.book-page').attributes('id')).toBe(`facilities-guide-${slug === 'itsco' ? 'denver-procedures' : 'windchime-opening-and-closing'}`);
    if (slug === 'itsco') expect(w.get('.book-page').text()).toContain('not an operating procedure');
    else expect(w.get('.book-page').text()).toContain('no sessions, clients or staff remain');
    await w.get('input[type=search]').setValue('temporary use');
    await w.get('.outline-link').trigger('click');
    expect(window.location.hash).toBe('#facilities-guide-office-scheduling');
    expect(w.get('.book-page').text()).toContain('app’s office request');
    expect(w.find('a[download]').exists()).toBe(false); expect(w.find('.handbook-book').classes()).toContain('handbook-screen-only');
    w.unmount();
  });
  it('uses operations-specific Q&A and exact section citations', async () => {
    const ask = vi.fn().mockResolvedValue({status:'answered',paragraphs:[{text:'Obtain current access privately from authorized operations staff.',citations:[{slug:'access-and-security',title:'Access and security',quote:'Obtain current instructions privately.'}]}]});
    const w = mount(Book, {props:{handbook:book('itsco'),answerQuestion:ask}});
    expect(w.get('.handbook-assistant').text()).toContain('contact operations');
    await w.findAll('button').find(b=>b.text().includes('Where do I obtain approved access')).trigger('click');await flushPromises();
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({expectedVersionId:88}),expect.any(Object));
    await w.get('.answer-policy-links a').trigger('click');
    expect(window.location.hash).toBe('#facilities-guide-access-and-security');
    w.unmount();
  });
});
