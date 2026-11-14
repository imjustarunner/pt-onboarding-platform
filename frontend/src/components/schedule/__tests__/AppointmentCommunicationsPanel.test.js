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
it('distinguishes notification outcomes, free-text replies and authorized secure session comments',async()=>{
 api.get.mockImplementation(async url=>({data:url.includes('secure-session-comments')?{comments:[{id:41,body:'Secure preparation comment',author:{name:'Provider Example'},createdAt:'2026-11-13T18:00:00Z',isOwn:true}]}:{timeline:[{id:'reminder-1',category:'notifications',kind:'Scheduled reminder',channel:'sms',createdAt:'2026-11-13T17:00:00Z',metadata:{deliveryStatus:'failed',reason:'Text not accepted'}},{id:'communication-2',category:'replies',direction:'inbound',kind:'notification_reply',channel:'email',createdAt:'2026-11-13T17:30:00Z',metadata:{deliveryStatus:'received',body:'I have a question about this session.',actionStatus:'review'}}]}}));
 const wrapper=mount(Panel,{props:{appointmentId:5,clientId:21}});await flushPromises();expect(wrapper.text()).toContain('Text not accepted');expect(wrapper.text()).toContain('Reply received');expect(wrapper.text()).toContain('Secure preparation comment');
 expect(api.get).toHaveBeenCalledWith('/secure-session-comments/appointments/5',{params:{clientId:21},skipGlobalLoading:true});
 await wrapper.findAll('button').find(button=>button.text()==='Secure comments').trigger('click');expect(wrapper.findAll('ol>li')).toHaveLength(1);expect(wrapper.find('ol').text()).toContain('AuricWell secure session comment');expect(wrapper.find('ol').text()).not.toContain('I have a question');wrapper.unmount();
});
it('preserves delivery history while withholding comments when clinical access is denied',async()=>{
 api.get.mockImplementation(async url=>{if(url.includes('secure-session-comments'))throw {response:{status:403}};return {data:{timeline:[row(1,12,'sent')]}};});
 const wrapper=mount(Panel,{props:{appointmentId:5,clientId:21}});await flushPromises();expect(wrapper.text()).toContain('Sent');expect(wrapper.text()).toContain('current clinical access');expect(wrapper.findAll('.communication-comments')).toHaveLength(0);wrapper.unmount();
});
