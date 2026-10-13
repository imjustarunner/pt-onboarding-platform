import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import EventTextCampaignPanel from '../EventTextCampaignPanel.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });
function render() {
  api.get.mockResolvedValue({ data: { smsCampaign: { eventCode: '112', summary: {}, deliveries: [] } } });
  const wrapper = mount(EventTextCampaignPanel, { props: { agencyId: 3, event: { id: 8 } } });
  wrappers.push(wrapper);
  return wrapper;
}
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text().includes(text));

describe('event text campaigns', () => {
  it('previews the eligible audience before sending and invalidates preview when targeting changes', async () => {
    api.post.mockResolvedValue({ data: { body: 'Looking for help. Y for interest; 112 to mute; STOP to opt out.', eligibleCount: 2, skippedCount: 1, recipientCount: 3, senderReady: true } });
    const wrapper = render();
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    await button(wrapper, 'Preview').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/agencies/3/company-events/8/sms-preview', { mode: 'recruitment', recipientScope: 'audience', message: '' });
    expect(button(wrapper, 'Send text to 2')).toBeTruthy();
    await wrapper.findAll('select')[1].setValue('outreach_due');
    expect(button(wrapper, 'Send text')).toBeUndefined();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('only sends after an explicit action and preserves interest rather than assignment language', async () => {
    api.post.mockResolvedValueOnce({ data: { body: 'Looking for help', eligibleCount: 1, recipientCount: 1, skippedCount: 0, senderReady: true } }).mockResolvedValueOnce({ data: { smsCount: 1, smsSkippedCount: 0, smsFailedCount: 0 } });
    const wrapper = render();
    await button(wrapper, 'Preview').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Staff are assigned separately');
    await button(wrapper, 'Send text to 1').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/agencies/3/company-events/8/send-direct-message', { mode: 'recruitment', recipientScope: 'audience', message: '', sendSms: true, sendInApp: true });
    expect(wrapper.text()).toContain('1 texts sent');
    expect(button(wrapper, 'Send text')).toBeUndefined();
  });

  it('shows campaign readiness errors without permitting a send', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Campaign 2 is not approved.' } } } });
    const wrapper = render();
    await button(wrapper, 'Preview').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('Campaign 2 is not approved');
    expect(button(wrapper, 'Send text')).toBeUndefined();
  });
});
