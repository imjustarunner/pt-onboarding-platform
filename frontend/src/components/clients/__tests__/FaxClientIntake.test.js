import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import FaxClientIntake from '../FaxClientIntake.vue';
import ClientReferralLinks from '../ClientReferralLinks.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } }));
const picker = { props: ['modelValue'], emits: ['update:modelValue'], template: '<button type="button" @click="$emit(\'update:modelValue\', 8)">Select directory company</button>' };
beforeEach(() => { vi.resetAllMocks(); api.delete.mockResolvedValue({}); URL.createObjectURL = vi.fn(() => 'blob:synthetic'); URL.revokeObjectURL = vi.fn(); });
async function extracted() {
  api.post.mockResolvedValue({ data: { draftId: 'example', fields: { client_full_name: 'Client name', guardian_full_name: 'Guardian name' }, pages: [{ page: 1, text: 'Sam Sample' }], candidates: [{ id: '1', field: 'client_full_name', value: 'Sam Sample', evidence: 'Sam Sample', page: 1 }] } });
  const wrapper = mount(FaxClientIntake, { props: { agencyId: 3, organizationId: 4 }, global: { stubs: { ReferralEntityPicker: picker } } });
  const fileInput = wrapper.get('input[type=file]');
  Object.defineProperty(fileInput.element, 'files', { value: [new File(['synthetic'], 'example.pdf', { type: 'application/pdf' })] });
  await fileInput.trigger('change'); await flushPromises();
  return wrapper;
}
it('requires review and directory selection, and invalidates review after editing', async () => {
  const wrapper = await extracted();
  const last = () => wrapper.emitted('change').at(-1)[0];
  expect(last().ready).toBe(false);
  await wrapper.getComponent(picker).get('button').trigger('click'); await wrapper.get('input[type=checkbox]').setValue(true);
  expect(last().ready).toBe(true);
  await wrapper.get('input[aria-label="Extracted value"]').setValue('Jordan Sample');
  expect(last().reviewed).toBe(false); expect(last().ready).toBe(false);
  expect(api.post.mock.calls[0][1]).toBeInstanceOf(FormData);
  wrapper.unmount();
});
it('discards a draft and PHI preview when agency or organization changes', async () => {
  const wrapper = await extracted(); await wrapper.setProps({ organizationId: 5 }); await flushPromises();
  expect(api.delete).toHaveBeenCalledWith('/fax-intake/example', expect.objectContaining({ params: { agencyId: 3 } }));
  expect(wrapper.text()).not.toContain('Sam Sample'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
  wrapper.unmount();
});
it('links a past referral to an existing document with the original date', async () => {
  api.get.mockResolvedValue({ data: { links: [], documents: [{ id: 7, document_title: 'Old referral', uploaded_at: '2022-04-15' }] } }); api.post.mockResolvedValue({});
  const wrapper = mount(ClientReferralLinks, { props: { agencyId: 3, clientId: 5 }, global: { stubs: { ReferralEntityPicker: picker } } }); await flushPromises();
  await wrapper.findAll('button').find(b => b.text().includes('Link a referral')).trigger('click');
  await wrapper.getComponent(picker).get('button').trigger('click'); await wrapper.get('input[type=date]').setValue('2022-04-15');
  await wrapper.findAll('select')[1].setValue('7');
  await wrapper.findAll('button').find(b => b.text() === 'Save referral link').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/client-referral-links/clients/5', expect.objectContaining({ entryId: 8, documentId: 7, referralDate: '2022-04-15', direction: 'incoming' }), { params: { agencyId: 3 } });
  wrapper.unmount();
});
