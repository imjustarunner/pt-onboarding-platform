import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClinicalNoteReviewRequests from '../ClinicalNoteReviewRequests.vue';
import api from '../../../services/api.js';
import { groupNoteReviewWork } from '../../../utils/noteReviewWork.js';
vi.mock('../../../services/api.js', () => ({ default: { post: vi.fn() } }));
const request = (status, overrides = {}) => ({ requestId: 'request-1', clinicalNoteId: 71, agencyId: 7, clientName: 'DEMO QA', status, message: 'Please review the corrected start time.', ...overrides });
beforeEach(() => { vi.resetAllMocks(); api.post.mockResolvedValue({ data: { ok: true } }); });
describe('author review requests', () => {
  it('keeps changes separate from acknowledgement and feedback without duplicate note rows', () => {
    const items = groupNoteReviewWork([request('feedback'), request('changes_needed', { requestId: 'request-2' }), request('review_acknowledge', { requestId: 'request-3', clinicalNoteId: 72 }), request('feedback', { clinicalNoteId: 73, acknowledgedAt: '2026-11-02' })]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ status: 'changes_needed', clinicalNoteId: 71 });
    expect(items[0].requests).toHaveLength(2);
    expect(items[1].status).toBe('review_acknowledge');
    expect(groupNoteReviewWork([request('feedback'), request('feedback', { agencyId: 8 })])).toHaveLength(2);
  });
  it('opens the signed correction flow for changes, never an acknowledgement shortcut', async () => {
    const wrapper = mount(ClinicalNoteReviewRequests, { props: { requests: [request('changes_needed')] } });
    expect(wrapper.text()).toContain('Please review the corrected start time.');
    expect(wrapper.text()).not.toContain('Acknowledge reviewed');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('correct')).toHaveLength(1);
    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('acknowledges the exact request in its own tenant without signing the note', async () => {
    const wrapper = mount(ClinicalNoteReviewRequests, { props: { requests: [request('review_acknowledge')] } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/notes/71/review-requests/request-1/acknowledge', { agencyId: 7 }, { skipGlobalLoading: true });
    expect(wrapper.emitted('acknowledged')).toHaveLength(1);
    wrapper.unmount();
  });
  it.each(['clinical_revision','clinical_revision_proposal'])('opens the exact %s version and never uses generic acknowledgement',async source=>{
    const saved=request(source==='clinical_revision'?'review_acknowledge':'changes_needed',{source,revisionId:901,revisionContentHash:'DEMO QA exact revision hash'});
    const wrapper=mount(ClinicalNoteReviewRequests,{props:{requests:[saved]}});
    expect(wrapper.text()).not.toContain('Acknowledge reviewed');await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('open-version')[0][0]).toMatchObject({revisionId:901,revisionContentHash:'DEMO QA exact revision hash'});expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
  });
  it('allows feedback to be dismissed without claiming acknowledgement is required', () => {
    const wrapper = mount(ClinicalNoteReviewRequests, { props: { requests: [request('feedback')] } });
    expect(wrapper.text()).toContain('No acknowledgement or new signature is required');
    expect(wrapper.find('button').text()).toBe('Dismiss feedback');
    wrapper.unmount();
  });
  it('retains requests after failure and ignores acknowledgement responses after switching notes', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(ClinicalNoteReviewRequests, { props: { requests: [request('review_acknowledge')] } });
    await wrapper.find('button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toContain('Could not save');
    expect(wrapper.emitted('acknowledged')).toBeUndefined();
    let resolve;
    api.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await wrapper.find('button').trigger('click');
    await wrapper.setProps({ requests: [request('review_acknowledge', { clinicalNoteId: 72 })] });
    resolve({ data: { ok: true } }); await flushPromises();
    expect(wrapper.emitted('acknowledged')).toBeUndefined();
    wrapper.unmount();
  });
});
