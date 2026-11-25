import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClinicalNoteDetailFetcher from '../ClinicalNoteDetailFetcher.vue';
import api from '../../../services/api.js';
const push=vi.hoisted(()=>vi.fn());
vi.mock('vue-router',()=>({useRouter:()=>({push})}));
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn() } }));
const mountFetcher = () => mount(ClinicalNoteDetailFetcher, { props: { noteId: 71, agencyId: 7 }, global: { stubs: { ClinicalNoteReadOnlyView: { name: 'ClinicalNoteReadOnlyView', props: ['note'], emits: ['amended','open-claim'], template: '<article>{{ note.title }}</article>' } } } });
beforeEach(() => vi.resetAllMocks());
describe('signed note review loading', () => {
  it('does not replace a newly selected note with a delayed older response', async () => {
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ data: { note: { id: 72, title: 'Current note' } } });
    const wrapper = mountFetcher();
    await wrapper.setProps({ noteId: 72 }); await flushPromises();
    resolveOld({ data: { note: { id: 71, title: 'Old note' } } }); await flushPromises();
    expect(wrapper.text()).toContain('Current note');
    expect(wrapper.text()).not.toContain('Old note');
    wrapper.unmount();
  });
  it('refreshes the note and author work queue after a signed correction', async () => {
    api.get.mockResolvedValueOnce({ data: { note: { id: 71, title: 'Original note' } } }).mockResolvedValueOnce({ data: { note: { id: 71, title: 'Note with signed correction' } } });
    const wrapper = mountFetcher(); await flushPromises();
    wrapper.findComponent({ name: 'ClinicalNoteReadOnlyView' }).vm.$emit('amended', { noteId: 71, agencyId: 7 });
    await flushPromises();
    expect(wrapper.emitted('amended')[0][0]).toEqual({ noteId: 71, agencyId: 7 });
    expect(wrapper.text()).toContain('Note with signed correction');
    wrapper.unmount();
  });
});

it('opens the exact claim in its saved practice rather than opening the patient',async()=>{
 api.get.mockResolvedValue({data:{note:{id:71,agencyId:8,title:'Signed note'}}});const wrapper=mountFetcher();await flushPromises();wrapper.findComponent({name:'ClinicalNoteReadOnlyView'}).vm.$emit('open-claim',{id:99});await flushPromises();expect(push).toHaveBeenCalledWith({name:'BillingWorkspace',query:{agencyId:'8',billingSection:'claims',claimId:'99'}});wrapper.unmount();
});
