import { mount, flushPromises } from '@vue/test-utils';
import { it, expect, vi } from 'vitest';
vi.mock('../../../services/api', () => ({ default: {} }));
import CredentialingOperationsPanel from '../CredentialingOperationsPanel.vue';
function fixture(kind = 'provider', extra = {}) {
  const transport = { get: vi.fn(async path => ({ data: path.endsWith('/email') ? { mailbox: null } : { items: [] } })), post: vi.fn(async () => ({ data: {} })), patch: vi.fn(async () => ({ data: {} })) };
  const wrapper = mount(CredentialingOperationsPanel, { props: { agencyId: 1, kind, recordId: 3, ...extra }, global: { provide: { credentialingTransport: transport } } });
  return { wrapper, transport };
}
it('opens a provider case without creating an email address until the user clicks Create email', async () => {
  const { wrapper, transport } = fixture(); await flushPromises(); expect(transport.post).not.toHaveBeenCalled();
  const create = wrapper.findAll('button').find(b => b.text() === 'Create email'); expect(create).toBeTruthy(); await create.trigger('click'); await flushPromises();
  expect(transport.post).toHaveBeenCalledExactlyOnceWith('/agencies/1/credentialing/cases/3/email', {}); wrapper.unmount();
});
it('shows the same payer document list in the fee schedule without reminder, mailbox or upload controls', async () => {
  const { wrapper, transport } = fixture('payer', { documentsOnly: true, readOnly: true }); await flushPromises();
  expect(transport.get).toHaveBeenCalledExactlyOnceWith('/agencies/1/credentialing/insurances/3/documents');
  expect(wrapper.text()).toContain('Payer documents'); expect(wrapper.find('form').exists()).toBe(false); expect(wrapper.text()).not.toContain('Create email'); expect(wrapper.text()).not.toContain('team reminders'); wrapper.unmount();
});
it('does not display the previous payer’s documents when a new payer request is still loading', async () => {
  const { wrapper, transport } = fixture('payer', { documentsOnly: true }); await flushPromises();
  transport.get.mockResolvedValueOnce({ data: { items: [{ id: 4, title: 'Private payer A schedule', documentType: 'fee_schedule' }] } });
  await wrapper.setProps({ recordId: 4 }); await flushPromises(); expect(wrapper.text()).toContain('Private payer A schedule');
  let resolve; transport.get.mockReturnValueOnce(new Promise(r => { resolve = r; })); await wrapper.setProps({ recordId: 5 }); expect(wrapper.text()).not.toContain('Private payer A schedule');
  resolve({ data: { items: [] } }); await flushPromises(); wrapper.unmount();
});
