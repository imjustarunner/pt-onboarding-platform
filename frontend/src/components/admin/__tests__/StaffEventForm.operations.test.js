import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import StaffEventForm from '../StaffEventForm.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 3, slug: 'itsco' } }) }));
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });

describe('editing event operational settings', () => {
  it('preserves existing recurrence, reminders, SMS poll and audience groups while updating a fee', async () => {
    const event = {
      id: 8, title: 'Team outreach', eventType: 'company_event', startsAt: '2026-10-24T18:00:00Z', endsAt: '2026-10-24T20:00:00Z',
      requiresPayment: true, paymentAmount: null, paymentPaid: false, countsTowardOutreachCommitment: true,
      recurrence: { frequency: 'weekly', interval: 2, byWeekday: [6] },
      reminderConfig: { enabled: true, channels: { sms: true }, offsetsHours: [24] },
      votingConfig: { enabled: true, viaSms: true, question: 'Can you help?', shareResults: true, options: [{ key: '1', label: 'Yes' }, { key: '2', label: 'No' }] },
      audience: { userIds: [4], groupIds: [12], roleKeys: ['provider'] }
    };
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/agencies/3/company-events' ? [event] : url.endsWith('audience-options') ? { users: [], roles: [] } : {} }));
    api.put.mockResolvedValue({ data: { ...event, paymentAmount: 25, paymentPaid: true } });
    const wrapper = mount(StaffEventForm, { props: { agencyId: 3, initialEventId: 8 }, global: { stubs: { RouterLink: true, StaffEventInviteePanel: true, EventTextCampaignPanel: true } } });
    wrappers.push(wrapper); await flushPromises();
    await wrapper.find('[data-testid="payment-amount"]').setValue('25');
    await wrapper.find('[data-testid="payment-paid"]').setValue(true);
    await wrapper.find('.save-row button').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/agencies/3/company-events/8', expect.objectContaining({
      requiresPayment: true, paymentAmount: 25, paymentPaid: true, countsTowardOutreachCommitment: true,
      recurrence: event.recurrence, reminderConfig: event.reminderConfig, votingConfig: event.votingConfig,
      audience: event.audience
    }));
  });
});
