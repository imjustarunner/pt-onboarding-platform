import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CompanyEventsManager from '../CompanyEventsManager.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'provider', id: 4 } }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: { eventId: '8' } }) }));
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });

describe('scoped event coordinator', () => {
  it('opens the assigned event without creation or coordinator granting controls, and loads only scoped staff choices', async () => {
    const event = { id: 8, title: 'Outreach', startsAt: '2026-10-24T18:00:00Z', endsAt: '2026-10-24T20:00:00Z', canAssignCoordinators: false, coordinatorUserIds: [4], requiresPayment: true, paymentAmount: 25 };
    api.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('/company-events') ? [event] : { users: [{ id: 4, name: 'Pat' }], roles: [], groups: [] } }));
    const wrapper = mount(CompanyEventsManager, { props: { agencyId: 3 }, global: { stubs: { 'router-link': true, EventTextCampaignPanel: true, StaffPollResultsReview: true } } });
    wrappers.push(wrapper); await flushPromises();
    expect(wrapper.find('.editor-card').text()).toContain('Edit event');
    expect(wrapper.find('select[aria-label="Event coordinators"]').exists()).toBe(false);
    expect(wrapper.findAll('button').some(button => button.text() === 'New event')).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/agencies/3/company-events/audience-options', { params: { eventId: 8 } });
    expect(api.get.mock.calls.some(([url]) => url.endsWith('/templates'))).toBe(false);
    await wrapper.find('.payment-filter input').setValue(true); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/agencies/3/company-events', { params: { paymentStatus: 'outstanding' } });
  });
});
