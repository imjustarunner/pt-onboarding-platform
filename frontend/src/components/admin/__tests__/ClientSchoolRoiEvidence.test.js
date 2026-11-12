import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import View from '../ClientSchoolRoiAccessTab.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
let wrapper;
const payload = (clientId, completed = true) => ({ roi_expired: false, staff: [], school_roi_signing: {
  available_links: [{ id: 1, title: 'School ROI' }], selected_intake_link_id: 1, issued_link: null,
  completed_documents: completed ? [{ id: clientId + 100, signed_at: '2026-11-08T05:21:49Z', signer_name: `Parent ${clientId}` }] : []
} });
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: payload(4) }); });
afterEach(() => wrapper?.unmount());
it('shows signed enrollment ROI evidence even when no standalone signing link was issued', async () => {
  wrapper = mount(View, { props: { client: { id: 4 } } }); await flushPromises();
  expect(wrapper.text()).toContain('Completed');expect(wrapper.text()).toContain('Parent 4');
  expect(wrapper.text()).not.toContain('Not issued');expect(wrapper.text()).not.toContain('Start Signing Session');
  const popup = { opener: {}, location: {}, close: vi.fn() };vi.spyOn(window, 'open').mockReturnValue(popup);
  api.get.mockResolvedValueOnce({ data: { url: 'https://storage.example.test/signed-roi' } });
  await wrapper.findAll('button').find(b => b.text() === 'View signed ROI').trigger('click');await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/clients/4/school-roi-documents/104/view');
  expect(popup.location.href).toBe('https://storage.example.test/signed-roi');expect(api.post).not.toHaveBeenCalled();
});
it('keeps an older sibling response from replacing the selected child’s ROI evidence', async () => {
  let finishOld;api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  wrapper = mount(View, { props: { client: { id: 4 } } });
  api.get.mockResolvedValueOnce({ data: payload(5) });await wrapper.setProps({ client: { id: 5 } });await flushPromises();
  finishOld({ data: payload(4) });await flushPromises();
  expect(wrapper.text()).toContain('Parent 5');expect(wrapper.text()).not.toContain('Parent 4');
});
it('retains initial signing for a client with no signed ROI', async () => {
  api.get.mockResolvedValue({ data: payload(4, false) });wrapper = mount(View, { props: { client: { id: 4 } } });await flushPromises();
  expect(wrapper.text()).toContain('Start Signing Session');expect(wrapper.text()).not.toContain('View signed ROI');
});

it('opens source-bound paper review instead of offering staff grants that the server will reject', async () => {
  const staff=[{school_staff_user_id:9,first_name:'School',last_name:'Staff',access_level:'packet',effective_access_state:'packet'}];
  api.get.mockResolvedValue({data:{...payload(4,false),staff,paper_packet_review_required:true,paper_packet_staff_roi_pending:true,paper_packet_vision:{status:'applied'}}});
  wrapper=mount(View,{props:{client:{id:4}},global:{stubs:{SchoolPaperPacketWorkflow:{props:['clientId'],template:'<button class="finish-review" @click="$emit(\'processed\')">Review fixture</button>'}}}});await flushPromises();
  expect(wrapper.text()).toContain('Review the uploaded paper packet before granting staff access');
  expect(wrapper.text()).not.toContain('school staff ROI was auto-applied');
  const staffSelect=wrapper.get('tbody select');
  expect(staffSelect.get('option[value="roi"]').element.disabled).toBe(true);
  expect(staffSelect.get('option[value="packet"]').element.disabled).toBe(false);
  await wrapper.findAll('button').find(b=>b.text()==='Process paper packet').trigger('click');await flushPromises();
  expect(wrapper.findComponent({name:'SchoolPaperPacketWorkflow'}).exists() || wrapper.find('.finish-review').exists()).toBe(true);
  expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  api.get.mockResolvedValue({data:{...payload(4),staff,paper_packet_review_required:false}});
  await wrapper.get('.finish-review').trigger('click');await flushPromises();
  expect(wrapper.find('.paper-packet-review').exists()).toBe(false);
  expect(wrapper.get('tbody select option[value="roi"]').element.disabled).toBe(false);
});
