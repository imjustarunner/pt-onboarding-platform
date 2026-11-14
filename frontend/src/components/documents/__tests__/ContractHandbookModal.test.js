import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Modal from '../ContractHandbookModal.vue';
const http = { get: vi.fn() };
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
const reference = () => ({ agency: { id: 377, name: 'The Inner Strength Institute', slug: 'tisi' }, document: { id: 3, title: 'Workplace Handbook' }, version: { id: 42, number: 2 }, section: { id: 9, slug: 'testing-services', title: 'Testing', sourcePage: 44, bodyHtml: '<p>Approved test components.</p><script>bad()</script>' }, location: [{ slug: 'clinical', title: 'Clinical services' }, { slug: 'testing-services', title: 'Testing' }], metadata: { presentation: { agencyBrand: { agencyId: 377, primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' } } } });
const render = props => mount(Modal, { props: { open: true, agencyId: 377, sectionSlug: 'testing-services', expectedVersionId: 42, http, ...props }, attachTo: document.body });
beforeEach(() => { vi.clearAllMocks(); http.get.mockResolvedValue({ data: { reference: reference() } }); document.body.style.overflow = ''; });
describe('contract handbook modal', () => {
  it('opens the exact published section in place with version, location and actual agency colors', async () => {
    const w = render();await flushPromises();
    expect(http.get).toHaveBeenCalledWith('/provider-update/handbook/reference', { params: { agencyId: 377, slug: 'testing-services', versionId: 42 } });
    const modal = document.querySelector('[role=dialog]');expect(modal.textContent).toContain('Version 2');expect(modal.textContent).toContain('Clinical services › Testing');expect(modal.textContent).toContain('Source page 44');expect(modal.style.getPropertyValue('--doc-primary')).toBe('#0F172A');expect(modal.querySelector('script')).toBeNull();
    modal.querySelector('button').click();expect(w.emitted('close')).toHaveLength(1);expect(document.body.style.overflow).toBe('hidden');w.unmount();expect(document.body.style.overflow).toBe('');
  });
  it('uses token-owned portal access without a caller-controlled organization query', async () => {
    const w=render({portalToken:'retained-token'});await flushPromises();expect(http.get).toHaveBeenCalledWith('/prehire-portal/retained-token/resources/handbook/reference',{params:{slug:'testing-services',versionId:42}});w.unmount();
  });
  it.each([
    {id:2,slug:'itsco',url:'https://app.itsco.health/itsco/workplace-handbook'},
    {id:6,slug:'nextlevelup',url:'https://app.nextleveluplcc.com/nlu/workplace-handbook'},
    {id:377,slug:'tisi',url:'https://app.theinnerstrengthinstitute.com/tisi/workplace-handbook'}
  ])('follows actual absolute $slug handbook citations within the same company and pinned version',async agency=>{
    http.get.mockImplementation(async (_url,{params})=>({data:{reference:{...reference(),agency,section:{...reference().section,slug:params.slug,bodyHtml:params.slug==='testing-services'?`<a href="${agency.url}?agencyId=${agency.id}&versionId=999#handbook-flat-clinical-addons-and-eligibility">Related pay policy</a>`:'<p>Referenced historical policy</p>'}}}}));
    const w=render({agencyId:agency.id,portalToken:'retained-token'});await flushPromises();
    const click=new MouseEvent('click',{bubbles:true,cancelable:true});document.querySelector('.reference-prose a').dispatchEvent(click);await flushPromises();
    expect(click.defaultPrevented).toBe(true);expect(http.get).toHaveBeenLastCalledWith('/prehire-portal/retained-token/resources/handbook/reference',{params:{slug:'flat-clinical-addons-and-eligibility',versionId:42}});
    expect(document.querySelector('.reference-prose').textContent).toContain('Referenced historical policy');expect(w.emitted('close')).toBeUndefined();
    [...document.querySelectorAll('button')].find(button=>button.textContent==='Back to the cited section').click();await flushPromises();
    expect(http.get).toHaveBeenLastCalledWith('/prehire-portal/retained-token/resources/handbook/reference',{params:{slug:'testing-services',versionId:42}});w.unmount();
  });
  it('keeps external sources and other-company handbook URLs separate from the pinned manual',async()=>{
    const initial=reference();initial.section.bodyHtml='<a href="https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html">HHS</a><a href="https://app.nextleveluplcc.com/nlu/workplace-handbook#handbook-testing-services">Other company</a><a href="https://evil.example/tisi/workplace-handbook#handbook-testing-services">Untrusted host</a>';
    http.get.mockResolvedValue({data:{reference:initial}});const w=render();await flushPromises();
    for(const link of document.querySelectorAll('.reference-prose a')){
      const click=new MouseEvent('click',{bubbles:true,cancelable:true});
      // Suppress jsdom navigation after the component has handled the event.
      link.addEventListener('click',event=>event.preventDefault(),{once:true});link.dispatchEvent(click);
      expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener noreferrer');
    }
    expect(http.get).toHaveBeenCalledTimes(1);expect(w.emitted('close')).toBeUndefined();w.unmount();
  });
  it.each([{ agency: { id: 2 } }, { version: { id: 43, number: 3 } }, { section: { slug: 'different', bodyHtml: 'wrong' } }])('rejects mismatched agency, version or section before rendering policy text', async override => {
    http.get.mockResolvedValue({ data: { reference: { ...reference(), ...override } } });const w=render();await flushPromises();expect(document.querySelector('[role=dialog]').textContent).toContain('did not match');expect(document.querySelector('.reference-prose')).toBeNull();w.unmount();
  });
  it('ignores a delayed response after the reference is closed', async () => {
    let resolve;http.get.mockReturnValue(new Promise(r=>resolve=r));const w=render();await w.setProps({open:false});resolve({data:{reference:reference()}});await flushPromises();expect(document.querySelector('[role=dialog]')).toBeNull();w.unmount();
  });
});
