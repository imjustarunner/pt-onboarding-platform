import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import StaffTools from '../AppointmentStaffTools.vue';
import Conversa from '../AppointmentConversa.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const person = { personKey: 'client:31@2', displayName: 'Client A', email: 'client@example.test', phone: '+15555550123', methods: [{ id: 'secure', available: true }, { id: 'email', available: true }, { id: 'sms', available: false, reason: 'Client has opted out.' }] };
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { person } }); });
describe('appointment staff tools', () => {
  it('saves a private alert with revision and does not send communication', async () => {
    api.get.mockResolvedValue({ data: { agencyId: 2, alert: { text: '', revision: 0 }, canEdit: true, clients: [] } });
    api.put.mockResolvedValue({ data: { alert: { text: 'Prepare paperwork', revision: 1 } } });
    const wrapper = mount(StaffTools, { props: { appointmentId: 12 } });
    await flushPromises(); await wrapper.find('button').trigger('click');
    await wrapper.find('textarea').setValue('Prepare paperwork'); await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/appointments/12/staff-alert', { text: 'Prepare paperwork', revision: 0 }, { skipGlobalLoading: true });
    expect(wrapper.text()).toContain('Never sent to clients'); expect(api.post).not.toHaveBeenCalled();
  });
  it('renders no internal content for a denied viewer', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    const wrapper = mount(StaffTools, { props: { appointmentId: 12 } }); await flushPromises();
    expect(wrapper.text()).toBe('');
  });
});
describe('appointment Conversa', () => {
  it('uses the existing secure send pipeline with client filing and no navigation', async () => {
    api.post.mockResolvedValue({ data: { ok: true, queued: true } });
    const wrapper = mount(Conversa, { props: { agencyId: 2, clientId: 31, clientName: 'Client A' }, global: { stubs: { ConversaBrand: true, SecureMessageBanner: true } } });
    await flushPromises(); expect(api.post).not.toHaveBeenCalled();
    await wrapper.find('textarea').setValue('Please contact support about a new time.');
    await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/messages/hub/send', expect.objectContaining({ personKey: 'client:31@2', clientId: 31, agencyId: 2, method: 'secure', newTopic: true }), { skipGlobalLoading: true });
    expect(wrapper.text()).toContain('Message queued');
  });
  it('does not send a text to an opted-out client or carry a secure draft into email', async () => {
    const wrapper = mount(Conversa, { props: { agencyId: 2, clientId: 31 }, global: { stubs: { ConversaBrand: true, SecureMessageBanner: true } } });
    await flushPromises(); await wrapper.find('textarea').setValue('Private care information');
    await wrapper.findAll('.channels button')[1].trigger('click'); expect(wrapper.find('textarea').element.value).toBe('');
    await wrapper.findAll('.channels button')[2].trigger('click');
    expect(wrapper.text()).toContain('Client has opted out'); expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
    await wrapper.find('.btn-primary').trigger('click'); expect(api.post).not.toHaveBeenCalled();
  });
  it('keeps the draft and error if delivery fails', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Current guardian access is required' } } } });
    const wrapper = mount(Conversa, { props: { agencyId: 2, clientId: 31 }, global: { stubs: { ConversaBrand: true, SecureMessageBanner: true } } });
    await flushPromises(); await wrapper.find('textarea').setValue('Hello'); await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Current guardian access is required'); expect(wrapper.find('textarea').element.value).toBe('Hello');
  });
});
