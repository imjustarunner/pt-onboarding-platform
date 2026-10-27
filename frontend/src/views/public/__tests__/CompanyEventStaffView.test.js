import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CompanyEventStaffView from '../CompanyEventStaffView.vue';
import api from '../../../services/api';
const state = vi.hoisted(() => ({ signedIn: true, query: {}, participation: { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false } }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { eventId: '8', token: 'share-token' }, query: state.query, hash: '#event-check-in', fullPath: '/company-events/8/staff/share-token?attendance=checkout-time#event-check-in' }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ get isAuthenticated() { return state.signedIn; } }) }));
const wrappers = [];
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);
async function render() { const wrapper = mount(CompanyEventStaffView); wrappers.push(wrapper); await flushPromises(); return wrapper; }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
  state.signedIn = true;
  state.query = {};
  state.participation = { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false };
  api.get.mockImplementation(url => Promise.resolve({ data: url.includes('/participation') ? state.participation : { event: { id: 8, title: 'School outreach', startsAt: '2026-10-24T18:00:00Z' }, branding: { agencyName: 'ITSCO' } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); vi.useRealTimers(); });

describe('staff event participation', () => {
  it('requires sign-in before allowing interest, check-in, or travel', async () => {
    state.signedIn = false;
    const wrapper = await render();
    expect(wrapper.find('a').attributes('href')).toContain('/login?redirect=');
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it('records interest without assigning staff or opening check-in', async () => {
    const wrapper = await render();
    await button(wrapper, "I'm interested").trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/staff/8/share-token/respond', { response: 'yes' });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Assignment requires coordinator approval');
    expect(button(wrapper, 'Check in')).toBeUndefined();
  });
  it('permits checkout of an existing open punch even after assignment was removed', async () => {
    state.participation = { assigned: false, clockedIn: true, canCheckOut: true };
    const wrapper = await render();
    await button(wrapper, 'Clock out now').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/check-out', {});
  });
  it('keeps travel reimbursement in Submit instead of the attendance page', async () => {
    state.participation = { assigned: true, canSubmitTravel: true, isEventDay: true, canCheckIn: true };
    const wrapper = await render();
    expect(wrapper.find('.event-travel-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Travel time');
    expect(button(wrapper, 'Check in')).toBeDefined();
  });

  it('opens the chosen-time form from the email without automatically recording a punch', async () => {
    state.query = { attendance: 'checkout-time' };
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true, lastPunch: { at: '2026-10-24T16:00:00Z' } };
    const wrapper = await render();
    expect(wrapper.find('#event-check-in form').exists()).toBe(true);
    expect(wrapper.text()).toContain('device timezone');
    expect(api.post).not.toHaveBeenCalled();
    const form = wrapper.find('#event-check-in form');
    await form.find('input[type="datetime-local"]').setValue('2026-10-24T20:00');
    await form.find('input[type="checkbox"]').setValue(true);
    await form.trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/check-out', { checkoutAt: new Date('2026-10-24T20:00').toISOString() });
    expect(wrapper.text()).toContain('Your event time was saved');
  });

  it('rejects a checkout before clock-in without sending a request', async () => {
    state.query = { attendance: 'checkout-time' };
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true, lastPunch: { at: '2026-10-24T16:00:00Z' } };
    const wrapper = await render();
    const form = wrapper.find('#event-check-in form');
    await form.find('input[type="datetime-local"]').setValue('2026-10-23T10:00');
    await form.find('input[type="checkbox"]').setValue(true);
    await form.trigger('submit'); await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('after your clock-in time');
  });

  it('keeps a failed checkout editable and shows the server error', async () => {
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true };
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'You are not currently clocked in to this event' } } } });
    const wrapper = await render();
    await button(wrapper, 'Clock out now').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('not currently clocked in');
    expect(button(wrapper, 'Clock out now').attributes('disabled')).toBeUndefined();
  });

});
