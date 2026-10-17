import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CompanyEventStaffView from '../CompanyEventStaffView.vue';
import api from '../../../services/api';
const state = vi.hoisted(() => ({ signedIn: true, participation: { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false } }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { eventId: '8', token: 'share-token' }, fullPath: '/company-events/8/staff/share-token' }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ get isAuthenticated() { return state.signedIn; } }) }));
const wrappers = [];
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);
async function render() { const wrapper = mount(CompanyEventStaffView); wrappers.push(wrapper); await flushPromises(); return wrapper; }
beforeEach(() => {
  state.signedIn = true;
  state.participation = { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false };
  api.get.mockImplementation(url => Promise.resolve({ data: url.includes('/participation') ? state.participation : { event: { id: 8, title: 'School outreach', startsAt: '2026-10-24T18:00:00Z' }, branding: { agencyName: 'ITSCO' } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });

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
    await button(wrapper, 'Check out').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/check-out', {});
  });
  it('submits validated travel context through the existing payroll review endpoint', async () => {
    state.participation = { assigned: true, clockedIn: false, canCheckIn: false };
    const claim = { agencyId: 3, claimDate: '2026-10-24', claimType: 'indirect_time', payload: { categoryGroup: 'support_activity', companyEventId: 8, eventWorkType: 'travel' } };
    api.post.mockResolvedValueOnce({ data: claim }).mockResolvedValueOnce({ data: { id: 9 } });
    const wrapper = await render();
    const fields = wrapper.findAll('input[type="datetime-local"]');
    await wrapper.find('select').setValue('from_event');
    await fields[0].setValue('2026-10-24T09:00'); await fields[1].setValue('2026-10-24T09:30');
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenNthCalledWith(1, '/me/company-events/8/travel-context', expect.objectContaining({ attestation: true, travelDirection: 'from_event', travelStartedAt: expect.any(String), travelEndedAt: expect.any(String) }));
    expect(api.post).toHaveBeenNthCalledWith(2, '/payroll/me/time-claims', claim);
    expect(wrapper.text()).toContain('Travel time submitted for review');
  });
});
