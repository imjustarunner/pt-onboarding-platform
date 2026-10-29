import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import DashboardNavMenu from '../DashboardNavMenu.vue';
import { dashboardNavigationContextKey, dashboardMobileNavItems, setDashboardMobileNavItems, clearDashboardMobileNavItems } from '../../navigation/dashboardMobileNav.js';
let wrapper;
const cards = [
  { id: 'overview', label: 'Overview' }, { id: 'my_schedule', label: 'My Schedule' },
  { id: 'tools_nest', label: 'Tools and Resources', kind: 'nest', children: [{ id: 'tools_library', label: 'Library', kind: 'link', to: '/library', children: [{ id: 'library_mine', label: 'My Files', kind: 'link', to: '/library?section=mine' }] }] }
];
async function start() {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/dashboard', '/my-schedule', '/my-meetings', '/library'].map(path => ({ path, component: { template: '<div />' } })) });
  await router.push('/dashboard'); await router.isReady();
  wrapper = mount(DashboardNavMenu, { props: { to: '/dashboard', items: cards, contextKey: 'user-1' }, global: { plugins: [router] }, attachTo: document.body });
  wrapper.element.getBoundingClientRect = () => ({ left: 700, top: 20, bottom: 55, width: 130, height: 35 });
  return router;
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; clearDashboardMobileNavItems(); vi.useRealTimers(); });
const menu = () => document.querySelector('nav[aria-label="My Dashboard sections"]');
it('opens after a brief hover, cancels a short pass, and fits the viewport', async () => {
  await start();
  await wrapper.trigger('pointerenter', { pointerType: 'mouse' }); await vi.advanceTimersByTimeAsync(300);
  expect(menu()).toBeNull(); await wrapper.trigger('pointerleave'); await vi.advanceTimersByTimeAsync(600); expect(menu()).toBeNull();
  await wrapper.trigger('pointerenter', { pointerType: 'mouse' }); await vi.advanceTimersByTimeAsync(500);
  expect(menu().textContent).toContain('My Schedule');
  expect(parseFloat(menu().style.left) + parseFloat(menu().style.width)).toBeLessThanOrEqual(innerWidth - 12);
});
it('opens on click, expands nested sections, and selects the same sidebar item', async () => {
  await start(); await wrapper.get('.dashboard-nav-caret').trigger('click'); await flushPromises();
  const button = text => [...menu().querySelectorAll('button')].find(el => el.textContent.includes(text));
  button('Tools and Resources').click(); await flushPromises();
  expect(button('Library')).toBeTruthy();
  menu().querySelector('[aria-label="Expand Library"]').click(); await flushPromises();
  button('My Files').click(); await flushPromises();
  expect(wrapper.emitted('select')[0][0].id).toBe('library_mine'); expect(menu()).toBeNull();
});
it('supports arrow navigation and Escape, and dismisses outside clicks', async () => {
  await start(); await wrapper.get('a').trigger('keydown', { key: 'ArrowDown' }); await flushPromises();
  expect(document.activeElement.textContent).toContain('Overview');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement.textContent).toContain('My Schedule');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises();
  expect(menu()).toBeNull(); expect(document.activeElement).toBe(wrapper.get('.dashboard-nav-caret').element);
  await wrapper.get('.dashboard-nav-caret').trigger('click'); await flushPromises();
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); await flushPromises(); expect(menu()).toBeNull();
});
it('closes when the user or organization changes and preserves modified link clicks', async () => {
  await start(); await wrapper.get('a').trigger('click', { ctrlKey: true }); expect(menu()).toBeNull();
  await wrapper.get('.dashboard-nav-caret').trigger('click'); await wrapper.setProps({ contextKey: 'user-2' }); expect(menu()).toBeNull();
});
it('opens Overview from a schedule even when its dropdown is already open', async () => {
  const router = await start(); await router.push('/my-schedule');
  await wrapper.get('.dashboard-nav-caret').trigger('click'); await flushPromises();
  expect(menu()).not.toBeNull();
  await wrapper.get('a').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/dashboard?tab=overview');
  expect(menu()).toBeNull();
  expect(wrapper.emitted('open-dashboard')).toHaveLength(1);
});
it('returns to Overview from a dashboard drill-in and preserves its real link destination', async () => {
  const router = await start(); await router.push('/dashboard?tab=my&my=preferences');
  expect(wrapper.get('a').attributes('href')).toBe('/dashboard?tab=overview');
  await wrapper.get('a').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/dashboard?tab=overview');
});
it('provides working menu links before the first dashboard visit and upgrades to the registered rail', async () => {
  const router = await start(); await router.push('/library'); await wrapper.setProps({ items: [] });
  await wrapper.trigger('pointerenter', { pointerType: 'mouse' }); await vi.advanceTimersByTimeAsync(500);
  expect(menu().textContent).toContain('My Schedule');
  [...menu().querySelectorAll('button')].find(el => el.textContent.includes('Overview')).click(); await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/dashboard?tab=overview');
  expect(menu()).toBeNull();
  await wrapper.get('.dashboard-nav-caret').trigger('click');
  await wrapper.setProps({ items: cards });
  expect(menu().textContent).toContain('Tools and Resources');
});
it('preserves nested icons and scopes the shared list to user, permissions, and organization', () => {
  const user = { id: 1, role: 'provider', capabilities: { canViewLibrary: true } };
  const context = dashboardNavigationContextKey(user, 2);
  setDashboardMobileNavItems(cards, context);
  expect(dashboardMobileNavItems.value[2].children[0].children[0].label).toBe('My Files');
  expect(dashboardNavigationContextKey({ ...user, id: 2 }, 2)).not.toBe(context);
  expect(dashboardNavigationContextKey(user, 3)).not.toBe(context);
  expect(dashboardNavigationContextKey({ ...user, capabilities: { canViewLibrary: false } }, 2)).not.toBe(context);
});
