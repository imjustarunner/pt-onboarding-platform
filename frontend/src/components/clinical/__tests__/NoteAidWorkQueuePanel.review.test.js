import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoteAidWorkQueuePanel from '../NoteAidWorkQueuePanel.vue';
vi.mock('../../../store/agency.js', () => ({ useAgencyStore: () => ({ agencies: [], userAgencies: [], currentAgency: null }) }));
beforeEach(() => { window.localStorage.clear(); });
describe('My Work review categories', () => {
  it('omits empty status badges and exposes nonempty review work', async () => {
    const wrapper = mount(NoteAidWorkQueuePanel, { props: { items: [], reviewItems: [
      { id: 'review_1', clinicalNoteId: 71, agencyId: 7, status: 'changes_needed', clientName: 'DEMO QA A', message: 'Clarify service time.' },
      { id: 'review_2', clinicalNoteId: 72, agencyId: 7, status: 'review_acknowledge', clientName: 'DEMO QA B', message: 'Time corrected.' }
    ] } });
    expect(wrapper.text()).not.toContain('0 Not started');
    expect(wrapper.text()).not.toContain('0 In progress');
    expect(wrapper.text()).not.toContain('Feedback');
    expect(wrapper.text()).toContain('1 Changes needed');
    expect(wrapper.text()).toContain('1 Review / acknowledge needed');
    await wrapper.find('.na-wq-item--changes_needed button').trigger('click');
    expect(wrapper.emitted('select-review')[0][0]).toMatchObject({ clinicalNoteId: 71, agencyId: 7 });
    wrapper.unmount();
  });
  it('keeps the selected cosign note visibly connected to its queue row', () => {
    const wrapper = mount(NoteAidWorkQueuePanel, { props: { mode: 'cosign', showCosignMode: true, activeCosignId: 'cosign_71', cosignItems: [
      { id: 'cosign_71', clinicalNoteId: 71, revisionNumber: 3, clientName: 'DEMO QA A', providerName: 'DEMO PROVIDER' },
      { id: 'cosign_72', clinicalNoteId: 72, clientName: 'DEMO QA B' }
    ] } });
    expect(wrapper.findAll('.na-wq-item--cosign.active')).toHaveLength(1);
    expect(wrapper.find('.na-wq-item--cosign.active').text()).toContain('DEMO QA A');
    expect(wrapper.find('.na-wq-item--cosign.active').text()).toContain('Version 3');
    expect(wrapper.text()).toContain('Version not recorded');
    wrapper.unmount();
  });
  it('reports unavailable review work instead of claiming the queue is empty', () => {
    const wrapper = mount(NoteAidWorkQueuePanel, { props: { mode: 'cosign', showCosignMode: true, cosignError: 'Cannot refresh review queue.' } });
    expect(wrapper.find('[role=alert]').text()).toContain('Cannot refresh');
    expect(wrapper.text()).not.toContain('No supervisee notes are waiting');
    wrapper.unmount();
  });
});


it('shows the four co-sign card actions and preserves normal note review and Quick Sign events',async()=>{
 const item={id:'cosign_81',clinicalNoteId:81,agencyId:7,clientName:'Synthetic client',narriva:{quickSignEligible:true}};
 const wrapper=mount(NoteAidWorkQueuePanel,{props:{mode:'cosign',showCosignMode:true,cosignItems:[item]}});
 expect(wrapper.findAll('.note-review-actions>button').map(button=>button.text())).toEqual(['Quick Sign','Quick look','Open note','Treatment history']);
 await wrapper.get('.nra-open').trigger('click');expect(wrapper.emitted('select-cosign')[0][0]).toMatchObject({clinicalNoteId:81,agencyId:7});
 await wrapper.get('.nra-quick-sign').trigger('click');expect(wrapper.emitted('quick-sign')[0][0]).toMatchObject({clinicalNoteId:81,agencyId:7});
 wrapper.unmount();
});
