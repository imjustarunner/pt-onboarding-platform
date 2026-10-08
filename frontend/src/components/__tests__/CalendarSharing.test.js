import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
import CalendarSharing from '../CalendarSharing.vue';
let wrapper;
const button = text => wrapper.findAll('button').find(b => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { googleEnabled: false, readers: [], hasSubscription: false } });
  api.post.mockResolvedValue({ data: { url: 'https://app.example/api/calendar-sharing/feed/private.ics' } });
  api.delete.mockResolvedValue({ data: { ok: true } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });
describe('calendar subscription controls', () => {
  it('offers a password account a link without Google integration controls', async () => {
    wrapper = mount(CalendarSharing, { props: { agencyId: 2 } }); await flushPromises();
    expect(button('Create subscription link')).toBeTruthy();
    expect(button('Create shared Google calendar')).toBeUndefined();
    expect(wrapper.text()).toContain('client initials');
    expect(wrapper.text()).toContain('Full client names, clinical notes, diagnoses');
    expect(wrapper.text()).toContain('Apple Calendar'); expect(wrapper.text()).toContain('Outlook');
  });
  it('creates, replaces, and revokes a private link', async () => {
    wrapper = mount(CalendarSharing, { props: { agencyId: 2 } }); await flushPromises();
    api.get.mockResolvedValue({ data: { googleEnabled: false, readers: [], hasSubscription: true } });
    await button('Create subscription link').trigger('click'); await flushPromises();
    expect(wrapper.find('input[readonly]').element.value).toContain('/feed/private.ics');
    await button('Replace subscription link').trigger('click'); await flushPromises();
    expect(window.confirm).toHaveBeenCalledOnce();
    await button('Revoke subscription').trigger('click'); await flushPromises();
    expect(api.delete).toHaveBeenCalledWith('/calendar-sharing/work/2/subscription');
    expect(wrapper.find('input[readonly]').exists()).toBe(false);
  });
  it('keeps the generated link visible when refreshing status fails', async () => {
    wrapper = mount(CalendarSharing, { props: { agencyId: 2 } }); await flushPromises();
    api.get.mockRejectedValueOnce(new Error('network'));
    await button('Create subscription link').trigger('click'); await flushPromises();
    expect(wrapper.find('input[readonly]').element.value).toContain('/feed/private.ics');
    expect(wrapper.find('[role="alert"]').text()).toContain('Please try again');
  });
  it('preserves Google controls for SSO accounts', async () => {
    api.get.mockResolvedValue({ data: { googleEnabled: true, readers: [] } });
    wrapper = mount(CalendarSharing, { props: { agencyId: 2 } }); await flushPromises();
    expect(button('Create shared Google calendar')).toBeTruthy();
  });
  it('does not display a link from a previous organization after switching', async () => {
    let resolve;
    api.post.mockReturnValue(new Promise(r => { resolve = r; }));
    wrapper = mount(CalendarSharing, { props: { agencyId: 2 } }); await flushPromises();
    await button('Create subscription link').trigger('click');
    await wrapper.setProps({ agencyId: 3 }); await flushPromises();
    resolve({ data: { url: 'https://wrong-organization.example/private.ics' } }); await flushPromises();
    expect(wrapper.find('input[readonly]').exists()).toBe(false);
    expect(api.get).toHaveBeenLastCalledWith('/calendar-sharing/work/3');
    expect(button('Create subscription link').attributes('disabled')).toBeUndefined();
  });
});
