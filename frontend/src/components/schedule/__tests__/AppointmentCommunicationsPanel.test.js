import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Panel from '../AppointmentCommunicationsPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const row = (id, deliveryId, status) => ({ id, channel: 'email', kind: 'cancellation', createdAt: '2026-10-20 14:00:00', metadata: { cancellationDeliveryId: deliveryId, deliveryStatus: status, body: 'Your appointment was canceled due to provider illness.', clientFacingReason: 'Provider illness', recipient: 'client@example.test' } });
beforeEach(() => vi.clearAllMocks());
describe('session communication delivery history', () => {
  it('offers retry only for the latest definitely unsent delivery and preserves prior attempts', async () => {
    api.get.mockResolvedValue({ data: { communications: [row(1, 12, 'failed'), row(2, 12, 'sent'), row(3, 13, 'review'), row(4, 14, 'held'), row(5, 15, 'sending'), row(6, 16, 'skipped'), row(7, 17, 'failed')] } });
    const wrapper = mount(Panel, { props: { appointmentId: 5 } }); await flushPromises();
    expect(wrapper.findAll('li')).toHaveLength(7);
    const retryButtons = wrapper.findAll('button').filter(button => button.text() === 'Retry unsent notification');
    expect(retryButtons).toHaveLength(2);
    expect(wrapper.findAll('li').filter(li => li.find('button').exists()).map(li => li.attributes('data-delivery-id'))).toEqual(['17', '16']);
    expect(wrapper.text()).toContain('manual review required'); expect(wrapper.text()).toContain('Provider illness');
  });
  it('retries once through the cancellation delivery endpoint and reloads the resulting status', async () => {
    api.get.mockResolvedValueOnce({ data: { communications: [row(1, 12, 'failed')] } }).mockResolvedValue({ data: { communications: [row(2, 12, 'sent'), row(1, 12, 'failed')] } });
    api.post.mockResolvedValue({ data: { ok: true } });
    const wrapper = mount(Panel, { props: { appointmentId: 5 } }); await flushPromises();
    await wrapper.find('li button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/appointments/5/cancellation-notifications/12/retry', {}, { skipGlobalLoading: true });
    expect(wrapper.findAll('li button')).toHaveLength(0); expect(wrapper.text()).toContain('rechecked');
  });
  it('shows a delivery failure without claiming a resend succeeded', async () => {
    api.get.mockResolvedValue({ data: { communications: [row(1, 12, 'failed')] } });
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Delivery is uncertain; review required' } } } });
    const wrapper = mount(Panel, { props: { appointmentId: 5 } }); await flushPromises();
    await wrapper.find('li button').trigger('click'); await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toContain('Delivery is uncertain'); expect(wrapper.text()).not.toContain('was rechecked');
  });
});
