import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CompanyEventsCalendarModal from '../CompanyEventsCalendarModal.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper;
const session = (id, date, overrides = {}) => ({
  sessionDateId: id, startsAt: `${date}T14:00:00Z`, endsAt: `${date}T18:00:00Z`,
  requiredProviders: 1, approvedProvidersCount: 0, ...overrides
});
const events = () => [
  { id: 1, agencyId: 2, title: 'Company celebration', eventType: 'company_event', startsAt: '2030-10-15T14:00:00Z', endsAt: '2030-10-15T18:00:00Z', sessions: [] },
  { id: 2, agencyId: 2, title: 'Day off at your school', eventType: 'school_day_off', startsAt: '2030-10-16T14:00:00Z', endsAt: '2030-10-16T18:00:00Z', sessions: [] },
  { id: 3, agencyId: 2, title: 'Outreach opportunity', eventType: 'school_outreach', canRequestOutreachShift: true,
    sessions: [session(10, '2029-10-10'), session(20, '2030-10-10', { approvedProvidersCount: 1 }), session(30, '2030-11-10')] },
  { id: 4, agencyId: 2, title: 'Canceled outreach', eventType: 'school_outreach', schoolEventStatus: 'canceled', startsAt: '2030-10-15T14:00:00Z', endsAt: '2030-10-15T18:00:00Z' }
];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-09T12:00:00Z'));
  api.get.mockReset().mockResolvedValue({ data: events() });
  api.post.mockReset().mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function open() {
  wrapper = mount(CompanyEventsCalendarModal, { global: { stubs: { Teleport: true } } });
  await flushPromises();
}

it('defaults to relevant events and exposes school dates only in All upcoming', async () => {
  await open();
  expect(wrapper.text()).toContain('Events & outreach');
  expect(wrapper.text()).toContain('Company celebration');
  expect(wrapper.text()).toContain('Outreach opportunity');
  expect(wrapper.text()).not.toContain('Day off at your school');
  expect(wrapper.text()).not.toContain('Canceled outreach');
  await wrapper.get('select').setValue('all');
  expect(wrapper.text()).toContain('Day off at your school');
  expect(wrapper.text()).toContain('School calendar date');
  await wrapper.get('input[type="month"]').setValue('2030-11');
  expect(wrapper.text()).not.toContain('Company celebration');
  expect(wrapper.text()).toContain('Outreach opportunity');
});

it('requests the selected available session and refreshes its pending status', async () => {
  await open();
  await wrapper.get('select').setValue('workable');
  expect(wrapper.findAll('article')).toHaveLength(1);
  expect(wrapper.findAll('.session-row')).toHaveLength(1);
  const refreshed = events();
  refreshed[2].sessions[2].myRequest = { id: 99, status: 'pending' };
  api.get.mockResolvedValueOnce({ data: refreshed });
  await wrapper.get('.session-row button').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/company-events/3/session-requests', { agencyId: 2, sessionDateId: 30, requestType: 'regular' });
  expect(wrapper.emitted('changed')).toHaveLength(1);
  expect(wrapper.findAll('article')).toHaveLength(0);
  await wrapper.get('select').setValue('relevant');
  expect(wrapper.text()).toContain('Request pending');
});
