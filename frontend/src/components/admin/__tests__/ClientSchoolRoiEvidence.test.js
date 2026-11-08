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
