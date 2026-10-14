import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ProviderEnrollmentWaitlist from '../ProviderEnrollmentWaitlist.vue';
import { waitlistOpeningLabel, waitlistWaitingLabel } from '../providerEnrollmentWaitlistPresentation.js';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
const first = { clientId: 11, clientName: 'Example Client', providerId: 9, providerName: 'Example Provider', agencyId: 2, agencyName: 'ITSCO', joinedAt: '2030-01-01T18:00:00Z', modality: 'VIRTUAL', timeZone: 'America/Denver', preferredDays: ['Tuesday', 'Thursday'], preferredTimes: ['After 5 PM'], contact: { name: 'Example Guardian', email: 'guardian@example.test', phone: '555-0101' }, requestedOpening: { startAt: '2030-01-03T15:00:00Z', endAt: '2030-01-03T16:00:00Z', frequency: 'BIWEEKLY', timeZone: 'America/Denver' } };
const wrappers = [];
const render = props => { const wrapper = mount(ProviderEnrollmentWaitlist, { props: { providerId: 9, agencyIds: [2], ...props } }); wrappers.push(wrapper); return wrapper; };
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: { count: 1, requests: [first], canManage: false } }); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); });

describe('provider enrollment waitlist visibility', () => {
  it('shows an obvious count without blocking the schedule and expands scheduling/contact details', async () => {
    const wrapper = render(); await flushPromises();
    expect(wrapper.find('.pew-toggle').text()).toContain('My waitlist');
    expect(wrapper.find('.pew-count').text()).toBe('1');
    expect(wrapper.find('.pew-body').exists()).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/availability/providers/9/enrollment-waitlist', { params: { agencyId: 2 }, skipGlobalLoading: true });
    await wrapper.find('.pew-toggle').trigger('click');
    expect(wrapper.text()).toContain('Example Client');
    expect(wrapper.text()).toContain('Tuesday · Thursday');
    expect(wrapper.text()).toContain('After 5 PM');
    expect(wrapper.text()).toContain('America/Denver');
    expect(wrapper.text()).toContain('8:00 AM–9:00 AM MST · Every 2 weeks');
    expect(wrapper.text()).toContain('care-team confirmation');
    expect(wrapper.find('a[href^="mailto:"]').text()).toBe('guardian@example.test');
    expect(wrapper.findAll('a').every(link => /^(mailto:|tel:)/.test(link.attributes('href')))).toBe(true);
    expect(wrapper.find('.pew-review').exists()).toBe(false);
  });
  it('never shows staff review actions in the provider view even if the response says manage', async () => {
    api.get.mockResolvedValue({ data: { requests: [first], canManage: true } });
    const wrapper = render({ initiallyExpanded: true }); await flushPromises();
    expect(wrapper.find('.pew-review').exists()).toBe(false);
  });
  it('lets authorized support review the same request using existing placement workflows', async () => {
    api.get.mockResolvedValue({ data: { requests: [first], canManage: true } });
    const wrapper = render({ staffView: true, initiallyExpanded: true }); await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/availability/admin/enrollment-waitlist', expect.objectContaining({ params: { agencyId: 2 } }));
    expect(wrapper.text()).toContain('Example Provider · ITSCO');
    await wrapper.find('.pew-review').trigger('click');
    expect(wrapper.emitted('review')[0][0]).toMatchObject({ clientId: 11, agencyId: 2 });
  });
  it('aggregates agencies, orders oldest requests first, and labels an incomplete count', async () => {
    api.get.mockImplementation(async (_url, { params }) => {
      if (params.agencyId === 3) throw new Error('Unavailable');
      return { data: { requests: [{ ...first, clientId: 12, joinedAt: '2030-01-03T18:00:00Z' }, first], canManage: false } };
    });
    const wrapper = render({ agencyIds: [2, 3, 2], initiallyExpanded: true }); await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.pew-count').text()).toBe('2');
    expect(wrapper.findAll('.pew-request')[0].text()).toContain('Jan 1, 2030');
    expect(wrapper.find('[role="alert"]').text()).toContain('count may be incomplete');
  });
  it('ignores old-scope responses and clears previous client names while a new scope loads', async () => {
    let resolveOld;
    api.get.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const wrapper = render({ initiallyExpanded: true });
    api.get.mockResolvedValue({ data: { requests: [{ ...first, clientId: 99, agencyId: 3, clientName: 'New Agency Client' }] } });
    await wrapper.setProps({ agencyIds: [3] }); await flushPromises();
    resolveOld({ data: { requests: [first] } }); await flushPromises();
    expect(wrapper.text()).toContain('New Agency Client');
    expect(wrapper.text()).not.toContain('Example Client');
  });
  it('shows an honest error rather than a zero count, and refresh recovers', async () => {
    api.get.mockRejectedValueOnce(new Error('Unavailable'));
    const wrapper = render(); await flushPromises();
    expect(wrapper.find('.pew-count').exists()).toBe(false);
    expect(wrapper.text()).toContain('Unavailable');
    expect(wrapper.text()).toContain('Refresh to try again');
    await wrapper.find('.pew-refresh').trigger('click'); await flushPromises();
    expect(wrapper.find('.pew-count').text()).toBe('1');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  it('expands an already-mounted waitlist when opened from a notification', async () => {
    const wrapper = render(); await flushPromises();
    expect(wrapper.find('.pew-body').exists()).toBe(false);
    await wrapper.setProps({ initiallyExpanded: true });
    expect(wrapper.find('.pew-body').exists()).toBe(true);
  });
  it('does not request data without an explicit agency scope', async () => {
    const wrapper = render({ agencyIds: [] }); await flushPromises();
    expect(wrapper.find('.pew').exists()).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('waitlist scheduling labels', () => {
  it('shows elapsed days and weeks while handling missing dates', () => {
    const now = Date.parse('2030-01-16T18:00:00Z');
    expect(waitlistWaitingLabel(first.joinedAt, now)).toBe('2 weeks waiting');
    expect(waitlistWaitingLabel('2030-01-15T18:00:00Z', now)).toBe('1 day waiting');
    expect(waitlistWaitingLabel('invalid', now)).toBe('Join date not recorded');
  });
  it('formats preferred times in their appointment timezone and tolerates malformed preferences', () => {
    expect(waitlistOpeningLabel(first.requestedOpening)).toContain('Thursday, Jan 3, 8:00 AM–9:00 AM MST');
    expect(waitlistOpeningLabel({ startAt: 'invalid' })).toBe('');
    expect(waitlistOpeningLabel({ ...first.requestedOpening, timeZone: 'invalid' })).toContain('MST');
  });
});
