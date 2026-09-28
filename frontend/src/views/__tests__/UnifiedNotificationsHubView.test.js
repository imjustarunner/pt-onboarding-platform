import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import View from '../UnifiedNotificationsHubView.vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../../utils/fontLoader', () => ({ loadFont: vi.fn() }));
vi.mock('../../components/admin/OfficeRequestAssignModal.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../components/notifications/NotificationTypeSettingsDrawer.vue', () => ({ default: { template: '<div />' } }));

let wrapper, router, items, pinia;
const response = (rows, page = 1) => ({
  items: rows.slice((page - 1) * 25, page * 25), unreadCount: rows.filter(n => !n.is_read).length,
  pagination: { page, pageSize: 25, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / 25)) },
  facets: { statuses: {}, categories: [{ key: 'account', label: 'Account', count: rows.length }], types: [], matchingTotal: rows.length },
  scopes: { inbox: true, managed: true, team: true }
});
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  items = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: 'Notice ' + (i + 1), message: 'Details', type: 'test_notice', is_read: false }));
  api.get.mockImplementation(async (path, options) => {
    if (path !== '/notifications/feed') return { data: [] };
    const p = options.params;
    const rows = items.filter(n => p.status === 'read' ? n.is_read : p.status === 'unread' ? !n.is_read : true);
    return { data: response(rows, p.page) };
  });
  api.patch.mockImplementation(async (path, payload) => {
    const n = items.find(n => path === '/notifications/' + n.id + '/state');
    if (payload.read !== undefined) n.is_read = payload.read;
    return { data: {} };
  });
  pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth(null, { id: 7, role: 'super_admin' });
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/notifications', component: View }] });
  await router.push('/notifications');
});
afterEach(() => wrapper?.unmount());
async function render() {
  wrapper = mount(View, { global: { plugins: [pinia, router] } });
  await flushPromises();
}
const button = (text) => wrapper.findAll('button').find(b => b.text() === text);

describe('notification management', () => {
  it('marks only the loaded page and leaves the next rows unread', async () => {
    await render();
    await button('Mark read').trigger('click');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledTimes(25);
    expect(items.filter(n => !n.is_read)).toHaveLength(5);
    expect(wrapper.findAll('.notification-row')).toHaveLength(5);
    expect(api.post).not.toHaveBeenCalled();
  });
  it('applies actions only to selected rows and supports select-page', async () => {
    await render();
    await wrapper.get('.selection-toggle input').setValue(true);
    const boxes = wrapper.findAll('.row-select');
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await wrapper.get('[aria-label="Snooze notifications"]').setValue('snooze1');
    await flushPromises();
    expect(api.patch.mock.calls.map(([path]) => path)).toEqual(['/notifications/1/state', '/notifications/3/state']);
    expect(api.patch.mock.calls.every(([, payload]) => payload.snoozedUntil)).toBe(true);
    await wrapper.get('[aria-label="Select current page"]').setValue(true);
    expect(wrapper.findAll('.row-select').every(el => el.element.checked)).toBe(true);
    await wrapper.get('[aria-label="Notification status"]').setValue('all');
    await flushPromises();
    expect(wrapper.findAll('.row-select').some(el => el.element.checked)).toBe(false);
  });
  it('keeps unread on this route and restores all active items without reloading', async () => {
    items[0].is_read = true;
    await render();
    await wrapper.get('[aria-label="Notification status"]').setValue('read');
    await flushPromises();
    expect(wrapper.findAll('.notification-row')).toHaveLength(1);
    await wrapper.get('.unread-card').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/notifications');
    expect(router.currentRoute.value.query.status).toBe('unread');
    expect(wrapper.findAll('.notification-row')).toHaveLength(25);
    await wrapper.get('[aria-label="Reset filters"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.status).toBe('all');
    expect(wrapper.text()).toContain('of 30 notifications');
  });
  it('ignores a stale feed response after changing filters', async () => {
    await render();
    const original = api.get.getMockImplementation();
    let finish;
    api.get.mockImplementation((path, options) => {
      if (path === '/notifications/feed' && options.params.status === 'read') return new Promise(resolve => { finish = resolve; });
      return original(path, options);
    });
    await wrapper.get('[aria-label="Notification status"]').setValue('read');
    await flushPromises();
    await wrapper.get('[aria-label="Notification status"]').setValue('all');
    await flushPromises();
    finish({ data: response([{ id: 99, title: 'Stale result', type: 'test_notice' }]) });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Stale result');
    expect(wrapper.findAll('.notification-row')).toHaveLength(25);
  });
  it('clamps the page after the last unread item on that page is marked read', async () => {
    await router.replace('/notifications?page=2');
    await render();
    expect(wrapper.findAll('.notification-row')).toHaveLength(5);
    await button('Mark read').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBeUndefined();
    expect(wrapper.findAll('.notification-row')).toHaveLength(25);
  });
});
